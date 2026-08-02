<script lang="ts">
  import { tick } from "svelte";
  import { createGridSelection, moveGridSelection, type GridDirection, type GridSelection } from "@tumbler/core";
  import {
    EXCEL_MAX_COLUMNS,
    EXCEL_MAX_ROWS,
    clearSpreadsheetTableFilter,
    formatCellReference,
    projectSpreadsheetTable,
    savedSpreadsheetTableView,
    setSpreadsheetTableSort,
    setSpreadsheetTableValueFilter,
    spreadsheetTableDistinctValues,
    type SpreadsheetCellValue,
    type SpreadsheetCalculationSnapshot,
    type SpreadsheetHyperlink,
    type SpreadsheetTable,
    type SpreadsheetTableViewState,
    type SpreadsheetWorksheet,
  } from "@tumbler/sheets";
  import { calculateSpreadsheetViewport } from "./spreadsheet-viewport.ts";
  import { composeSpreadsheetGridLayout, frozenAxisExtent } from "./spreadsheet-grid-layout.ts";
  import { coerceSpreadsheetEditValue, type SpreadsheetGridEdit } from "./spreadsheet-edit.ts";
  import { measureMaximumDigitWidth, spreadsheetFontShorthand } from "./spreadsheet-font-metrics.ts";
  import { spreadsheetCellContentCss, spreadsheetCellCss } from "./spreadsheet-cell-style.ts";

  interface Props {
    readonly worksheet: SpreadsheetWorksheet;
    readonly calculation?: SpreadsheetCalculationSnapshot;
    selection?: GridSelection;
    readonly onselectionchange?: (selection: GridSelection) => void;
    readonly onedit?: (edit: SpreadsheetGridEdit) => void;
    readonly onhyperlink?: (hyperlink: SpreadsheetHyperlink) => void;
    /** Prevents cell edits while retaining selection and table view controls. */
    readonly readonly?: boolean;
    readonly rowCount?: number;
    readonly columnCount?: number;
    readonly rowHeight?: number;
    readonly columnWidth?: number;
  }

  let {
    worksheet,
    calculation,
    selection = createGridSelection({ row: 1, column: 1 }),
    onselectionchange,
    onedit,
    onhyperlink,
    readonly = false,
    rowCount = EXCEL_MAX_ROWS,
    columnCount = EXCEL_MAX_COLUMNS,
    rowHeight = 28,
    columnWidth = 112,
  }: Props = $props();

  let viewportWidth = $state(800);
  let viewportHeight = $state(500);
  let scrollTop = $state(0);
  let scrollLeft = $state(0);
  let editing = $state<string>();
  let editor = $state<HTMLInputElement>();
  let draft = $state("");
  let maximumDigitWidth = $state(7);
  let stateWorksheet = $state<SpreadsheetWorksheet>();
  let tableStates = $state<Record<string, SpreadsheetTableViewState>>({});
  let tableMenu = $state<{ key: string; columnId: number; left: number; top: number }>();
  let selectingPointer = $state<number>();
  let selectionDragged = $state(false);
  let suppressCellClick = $state(false);
  const rowHeaderWidth = 52;
  const columnHeaderHeight = 28;
  let tableProjections = $derived(worksheet.tables.map((table) => ({
    table,
    projection: projectSpreadsheetTable(
      worksheet,
      table,
      tableStates[table.partName.value] ?? savedSpreadsheetTableView(table).state,
      calculation === undefined ? undefined : {
        value: (row, column) => calculation.value({ row, column }),
        displayText: (row, column) => calculation.displayText({ row, column }),
      },
    ),
  })));
  let projectedRows = $derived.by(() => {
    const result = new Map<number, number | undefined>();
    for (const { table, projection } of tableProjections) {
      const bodyStart = table.range.start.row + table.headerRowCount;
      const bodyEnd = table.range.end.row - table.totalsRowCount;
      for (let visualRow = bodyStart; visualRow <= bodyEnd; visualRow += 1) {
        result.set(visualRow, projection.rows[visualRow - bodyStart]);
      }
    }
    return result;
  });
  let rowGeometry = $derived(worksheet.rowGeometry(rowCount, projectedRows));
  let columnGeometry = $derived(worksheet.columnGeometry(columnCount, maximumDigitWidth));
  let frozenPane = $derived(worksheet.panes.find((pane) => pane.state === "frozen" || pane.state === "frozenSplit"));
  let frozenRows = $derived(Math.min(rowCount, Math.max(0, Math.floor(frozenPane?.ySplit ?? 0))));
  let frozenColumns = $derived(Math.min(columnCount, Math.max(0, Math.floor(frozenPane?.xSplit ?? 0))));
  let frozenRowsHeight = $derived(frozenAxisExtent(rowGeometry, frozenRows));
  let frozenColumnsWidth = $derived(frozenAxisExtent(columnGeometry, frozenColumns));
  let viewport = $derived(calculateSpreadsheetViewport({
    rowCount,
    columnCount,
    rowHeight,
    columnWidth,
    scrollTop: Math.max(0, scrollTop - columnHeaderHeight),
    scrollLeft: Math.max(0, scrollLeft - rowHeaderWidth),
    viewportHeight,
    viewportWidth,
    overscan: 3,
    rowGeometry,
    columnGeometry,
  }));
  let layout = $derived(composeSpreadsheetGridLayout({ viewport, rowGeometry, columnGeometry, frozenRows, frozenColumns, merges: worksheet.merges }));
  let gutterViewport = $derived(calculateSpreadsheetViewport({
    rowCount,
    columnCount,
    rowHeight,
    columnWidth,
    scrollTop: Math.max(0, scrollTop - columnHeaderHeight),
    scrollLeft: Math.max(0, scrollLeft - rowHeaderWidth),
    viewportHeight,
    viewportWidth,
    overscan: 128,
    rowGeometry,
    columnGeometry,
  }));
  let gutterLayout = $derived(composeSpreadsheetGridLayout({ viewport: gutterViewport, rowGeometry, columnGeometry, frozenRows, frozenColumns, merges: [] }));
  let hasActiveProjection = $derived(tableProjections.some(({ projection }) => projection.state.filters.length > 0 || projection.state.sorts.length > 0));
  let editable = $derived(!readonly && !hasActiveProjection && onedit !== undefined);

  $effect(() => {
    const current = worksheet;
    if (stateWorksheet === current) return;
    stateWorksheet = current;
    tableStates = Object.fromEntries(current.tables.map((table) => [table.partName.value, savedSpreadsheetTableView(table).state]));
    tableMenu = undefined;
  });

  $effect(() => {
    const reference = editing;
    if (reference === undefined) return;
    void tick().then(() => {
      if (editing !== reference) return;
      editor?.focus();
      editor?.select();
    });
  });

  $effect(() => {
    const styles = worksheet.styles;
    const font = styles.resolve(0).font;
    const name = styles.resolveFontName(font);
    if (name === undefined || typeof document === "undefined") {
      maximumDigitWidth = 7;
      return;
    }
    let current = true;
    const shorthand = spreadsheetFontShorthand(font, name);
    const refresh = () => {
      const context = document.createElement("canvas").getContext("2d");
      if (context === null || !current) return;
      context.font = shorthand;
      maximumDigitWidth = measureMaximumDigitWidth((digit) => context.measureText(digit).width);
    };
    refresh();
    void document.fonts?.load(shorthand).then(refresh);
    return () => { current = false; };
  });

  function select(row: number, column: number, extend = false) {
    const point = { row, column };
    const merge = worksheet.mergedRange(point);
    selection = extend
      ? createGridSelection(selection.anchor, merge?.end ?? point)
      : merge === undefined
        ? createGridSelection(point)
        : createGridSelection(merge.start, merge.end);
    onselectionchange?.(selection);
  }

  function handleScroll(event: Event) {
    const target = event.currentTarget as HTMLDivElement;
    scrollTop = target.scrollTop;
    scrollLeft = target.scrollLeft;
  }

  function cellPointerDown(event: PointerEvent, row: number, column: number) {
    if (event.pointerType !== "mouse" || event.button !== 0 || interactivePointerTarget(event)) return;
    event.preventDefault();
    selectingPointer = event.pointerId;
    selectionDragged = false;
    select(row, column, event.shiftKey);
  }

  function cellPointerEnter(event: PointerEvent, row: number, column: number) {
    if (selectingPointer !== event.pointerId || (event.buttons & 1) === 0) return;
    event.preventDefault();
    selectionDragged = true;
    select(row, column, true);
  }

  function finishPointerSelection(event: PointerEvent) {
    if (selectingPointer !== event.pointerId) return;
    selectingPointer = undefined;
    if (!selectionDragged) return;
    suppressCellClick = true;
    setTimeout(() => { suppressCellClick = false; }, 0);
  }

  function cellClick(event: MouseEvent, row: number, column: number) {
    if (suppressCellClick) return;
    select(row, column, event.shiftKey);
  }

  function interactivePointerTarget(event: PointerEvent): boolean {
    return event.target instanceof Element && event.target.closest("button, input") !== null;
  }

  function handleKeydown(event: KeyboardEvent) {
    const directions: Partial<Record<string, GridDirection>> = {
      ArrowUp: "up",
      ArrowDown: "down",
      ArrowLeft: "left",
      ArrowRight: "right",
    };
    const direction = directions[event.key];
    if (direction !== undefined) {
      event.preventDefault();
      if ((direction === "up" || direction === "down") && projectedRows.size > 0) moveProjectedSelection(direction, event.shiftKey);
      else {
        selection = moveGridSelection(selection, direction, { rows: rowCount, columns: columnCount }, { extend: event.shiftKey });
        onselectionchange?.(selection);
      }
    } else if (event.key === "Enter") {
      if (editable) {
        event.preventDefault();
        beginEdit(selection.focus.row, selection.focus.column);
      }
    } else if (event.key === "Delete" || event.key === "Backspace") {
      if (editable) {
        event.preventDefault();
        const owner = worksheet.mergedRange(selection.focus)?.start ?? selection.focus;
        onedit?.({ reference: formatCellReference(owner), value: null });
      }
    }
  }

  function beginEdit(row: number, column: number) {
    if (!editable) return;
    const owner = worksheet.mergedRange({ row, column })?.start ?? { row, column };
    const reference = formatCellReference(owner);
    editing = reference;
    draft = displayValue(worksheet.cell(reference)?.value);
  }

  function cellKeydown(event: KeyboardEvent, row: number, column: number) {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      select(row, column, event.shiftKey);
    }
  }

  function finishEdit(commit: boolean) {
    const reference = editing;
    editing = undefined;
    if (commit && reference !== undefined) {
      onedit?.({ reference, value: coerceSpreadsheetEditValue(draft, worksheet.cell(reference)?.value) });
    }
  }

  function inputKeydown(event: KeyboardEvent) {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      finishEdit(true);
    } else if (event.key === "Escape") {
      event.preventDefault();
      finishEdit(false);
    }
  }

  function selected(row: number, column: number): boolean {
    return row >= selection.range.start.row && row <= selection.range.end.row &&
      column >= selection.range.start.column && column <= selection.range.end.column;
  }

  function displayValue(value: SpreadsheetCellValue | undefined): string {
    if (value === undefined || value.type === "blank") return "";
    if (value.type === "boolean") return value.value ? "TRUE" : "FALSE";
    return String(value.value);
  }

  function displayCell(reference: string): string {
    return calculation?.displayText(reference) ?? worksheet.displayText(reference);
  }

  function activateHyperlink(event: MouseEvent, hyperlink: SpreadsheetHyperlink, row: number, column: number) {
    event.stopPropagation();
    select(row, column);
    onhyperlink?.(hyperlink);
  }

  function columnLabel(column: number): string {
    return formatCellReference({ row: 1, column }).slice(0, -1);
  }

  function sourceRow(visualRow: number): number | undefined {
    return projectedRows.has(visualRow) ? projectedRows.get(visualRow) : visualRow;
  }

  function visualRow(source: number): number {
    for (const [visual, projected] of projectedRows) if (projected === source) return visual;
    return source;
  }

  function moveProjectedSelection(direction: "up" | "down", extend: boolean) {
    const step = direction === "up" ? -1 : 1;
    let targetVisual = visualRow(selection.focus.row) + step;
    while (targetVisual >= 1 && targetVisual <= rowCount) {
      const targetSource = sourceRow(targetVisual);
      if (targetSource !== undefined) {
        const point = { row: targetSource, column: selection.focus.column };
        selection = extend ? createGridSelection(selection.anchor, point) : createGridSelection(point);
        onselectionchange?.(selection);
        return;
      }
      targetVisual += step;
    }
  }

  function tableHeader(row: number, column: number): { table: SpreadsheetTable; columnId: number } | undefined {
    const table = worksheet.tables.find((candidate) => candidate.headerRowCount === 1 && row === candidate.range.start.row &&
      column >= candidate.range.start.column && column <= candidate.range.end.column);
    return table === undefined ? undefined : { table, columnId: column - table.range.start.column };
  }

  function openTableMenu(event: MouseEvent, table: SpreadsheetTable, columnId: number) {
    event.stopPropagation();
    const bounds = (event.currentTarget as HTMLButtonElement).getBoundingClientRect();
    tableMenu = { key: table.partName.value, columnId, left: bounds.right - 220, top: bounds.bottom + 4 };
  }

  function menuTable(): SpreadsheetTable | undefined {
    return worksheet.tables.find((table) => table.partName.value === tableMenu?.key);
  }

  function menuState(table: SpreadsheetTable): SpreadsheetTableViewState {
    return tableStates[table.partName.value] ?? savedSpreadsheetTableView(table).state;
  }

  function updateTableState(table: SpreadsheetTable, state: SpreadsheetTableViewState) {
    tableStates = { ...tableStates, [table.partName.value]: state };
    editing = undefined;
    const projection = projectSpreadsheetTable(worksheet, table, state, calculation === undefined ? undefined : {
      value: (row, column) => calculation.value({ row, column }),
      displayText: (row, column) => calculation.displayText({ row, column }),
    });
    const bodyStart = table.range.start.row + table.headerRowCount;
    const bodyEnd = table.range.end.row - table.totalsRowCount;
    if (selection.focus.row >= bodyStart && selection.focus.row <= bodyEnd && !projection.rows.includes(selection.focus.row)) {
      const row = projection.rows[0] ?? table.range.start.row;
      select(row, selection.focus.column);
    }
  }

  function tableButtonVisible(table: SpreadsheetTable, columnId: number): boolean {
    const column = table.autoFilter?.columns.find((candidate) => candidate.columnId === columnId);
    return column?.hiddenButton !== true && column?.showButton !== false;
  }

  function sortTable(table: SpreadsheetTable, columnId: number, direction: "ascending" | "descending") {
    updateTableState(table, setSpreadsheetTableSort(menuState(table), columnId, direction));
    tableMenu = undefined;
  }

  function clearTableFilter(table: SpreadsheetTable, columnId: number) {
    updateTableState(table, clearSpreadsheetTableFilter(menuState(table), columnId));
  }

  function valueChecked(table: SpreadsheetTable, columnId: number, value: string): boolean {
    const criteria = menuState(table).filters.find((filter) => filter.columnId === columnId)?.criteria;
    if (criteria?.kind !== "values") return true;
    return value === "" ? criteria.includeBlank : criteria.values.includes(value);
  }

  function toggleTableValue(table: SpreadsheetTable, columnId: number, value: string, checked: boolean) {
    const distinct = tableDistinctValues(table, columnId);
    const values = distinct.filter((candidate) => candidate !== "" && (candidate === value ? checked : valueChecked(table, columnId, candidate)));
    const includeBlank = distinct.includes("") && (value === "" ? checked : valueChecked(table, columnId, ""));
    updateTableState(table, setSpreadsheetTableValueFilter(menuState(table), columnId, values, includeBlank));
  }

  function tableDistinctValues(table: SpreadsheetTable, columnId: number): readonly string[] {
    return spreadsheetTableDistinctValues(worksheet, table, columnId, calculation === undefined ? undefined : {
      value: (row, column) => calculation.value({ row, column }),
      displayText: (row, column) => calculation.displayText({ row, column }),
    });
  }

</script>

<svelte:window onpointerup={finishPointerSelection} onpointercancel={finishPointerSelection} />

{#snippet gridCell(reference: string, sourceRow: number, column: number, left: number, top: number, width: number, height: number, zIndex: number)}
  {@const header = tableHeader(sourceRow, column)}
  {@const hyperlink = worksheet.hyperlink({ row: sourceRow, column })}
  <div
    class:selected={selected(sourceRow, column)}
    class:focused={selection.focus.row === sourceRow && selection.focus.column === column}
    class:table-header={header !== undefined}
    class="cell"
    role="gridcell"
    tabindex="-1"
    aria-selected={selected(sourceRow, column)}
    style:left={`${left}px`}
    style:top={`${top}px`}
    style:width={`${width}px`}
    style:height={`${height}px`}
    style:z-index={zIndex}
    style={spreadsheetCellCss(worksheet, reference)}
    onpointerdown={(event) => cellPointerDown(event, sourceRow, column)}
    onpointerenter={(event) => cellPointerEnter(event, sourceRow, column)}
    onclick={(event) => cellClick(event, sourceRow, column)}
    onkeydown={(event) => cellKeydown(event, sourceRow, column)}
    ondblclick={() => beginEdit(sourceRow, column)}
  >
    {#if editing === reference}
      <input
        bind:this={editor}
        bind:value={draft}
        autocomplete="off"
        onkeydown={inputKeydown}
        onblur={() => finishEdit(true)}
        aria-label={`Edit ${reference}`}
      />
    {:else}
      {#if hyperlink === undefined}
        <span style={spreadsheetCellContentCss(worksheet, reference)}>{displayCell(reference)}</span>
      {:else}
        <button
          class="cell-hyperlink"
          type="button"
          title={hyperlink.tooltip}
          style={spreadsheetCellContentCss(worksheet, reference)}
          onclick={(event) => activateHyperlink(event, hyperlink, sourceRow, column)}
        >{hyperlink.display ?? displayCell(reference)}</button>
      {/if}
      {#if header !== undefined && tableButtonVisible(header.table, header.columnId)}
        <button
          class="table-menu-button"
          class:active={menuState(header.table).filters.some((filter) => filter.columnId === header.columnId) || menuState(header.table).sorts.some((sort) => sort.columnId === header.columnId)}
          type="button"
          aria-label={`Sort or filter ${header.table.columns[header.columnId]?.name ?? reference}`}
          aria-haspopup="menu"
          aria-expanded={tableMenu?.key === header.table.partName.value && tableMenu.columnId === header.columnId}
          onclick={(event) => openTableMenu(event, header.table, header.columnId)}
        >⌄</button>
      {/if}
    {/if}
  </div>
{/snippet}

<div
  class="tumbler-grid"
  role="grid"
  aria-rowcount={rowCount}
  aria-colcount={columnCount}
  tabindex="0"
  onkeydown={handleKeydown}
>
  <div
    class="grid-scroller"
    bind:clientWidth={viewportWidth}
    bind:clientHeight={viewportHeight}
    onscroll={handleScroll}
  >
    <div class="canvas" style:width={`${viewport.totalWidth + rowHeaderWidth}px`} style:height={`${viewport.totalHeight + columnHeaderHeight}px`}>
      {#each layout.rows as row (row.index)}
        {#each layout.columns as column (column.index)}
          {@const projectedRow = sourceRow(row.index)}
          {@const reference = formatCellReference({ row: projectedRow ?? row.index, column: column.index })}
          {#if row.index > frozenRows && column.index > frozenColumns && projectedRow !== undefined && worksheet.mergedRange(reference) === undefined}
            {@render gridCell(reference, projectedRow, column.index, rowHeaderWidth + column.start, columnHeaderHeight + row.start, column.size, row.size, 1)}
          {/if}
        {/each}
      {/each}
      {#each layout.merges as merge (`${merge.range.start.row}:${merge.range.start.column}`)}
        {#if merge.range.start.row > frozenRows && merge.range.start.column > frozenColumns}
          {@const reference = formatCellReference(merge.range.start)}
          {@render gridCell(reference, merge.range.start.row, merge.range.start.column, rowHeaderWidth + merge.left, columnHeaderHeight + merge.top, merge.width, merge.height, 1)}
        {/if}
      {/each}
    </div>
  </div>
  {#if frozenRowsHeight > 0}
    <div class="frozen-row-pane" style:height={`${frozenRowsHeight}px`}>
      {#each layout.rows.filter((row) => row.index <= frozenRows) as row (row.index)}
        {#each layout.columns as column (column.index)}
          {@const projectedRow = sourceRow(row.index)}
          {@const reference = formatCellReference({ row: projectedRow ?? row.index, column: column.index })}
          {#if projectedRow !== undefined && worksheet.mergedRange(reference) === undefined}
            {@render gridCell(reference, projectedRow, column.index, column.start - (column.index <= frozenColumns ? 0 : scrollLeft), row.start, column.size, row.size, 2)}
          {/if}
        {/each}
      {/each}
      {#each layout.merges.filter((merge) => merge.range.start.row <= frozenRows) as merge (`${merge.range.start.row}:${merge.range.start.column}`)}
        {@const reference = formatCellReference(merge.range.start)}
        {@render gridCell(reference, merge.range.start.row, merge.range.start.column, merge.left - (merge.range.start.column <= frozenColumns ? 0 : scrollLeft), merge.top, merge.width, merge.height, 2)}
      {/each}
    </div>
  {/if}
  {#if frozenColumnsWidth > 0}
    <div class="frozen-column-pane" style:width={`${frozenColumnsWidth}px`} style:top={`${columnHeaderHeight + frozenRowsHeight}px`}>
      {#each layout.rows.filter((row) => row.index > frozenRows) as row (row.index)}
        {#each layout.columns.filter((column) => column.index <= frozenColumns) as column (column.index)}
          {@const projectedRow = sourceRow(row.index)}
          {@const reference = formatCellReference({ row: projectedRow ?? row.index, column: column.index })}
          {#if projectedRow !== undefined && worksheet.mergedRange(reference) === undefined}
            {@render gridCell(reference, projectedRow, column.index, column.start, row.start - scrollTop - frozenRowsHeight, column.size, row.size, 2)}
          {/if}
        {/each}
      {/each}
      {#each layout.merges.filter((merge) => merge.range.start.row > frozenRows && merge.range.start.column <= frozenColumns) as merge (`${merge.range.start.row}:${merge.range.start.column}`)}
        {@const reference = formatCellReference(merge.range.start)}
        {@render gridCell(reference, merge.range.start.row, merge.range.start.column, merge.left, merge.top - scrollTop - frozenRowsHeight, merge.width, merge.height, 2)}
      {/each}
    </div>
  {/if}
  <div class="column-gutter">
    <div class="scrolling-column-headers" style:left={`${frozenColumnsWidth}px`}>
      {#each gutterLayout.columns.filter((column) => column.index > frozenColumns) as column (column.index)}
        <div
          class="column-header"
          style:left={`${column.start - scrollLeft - frozenColumnsWidth}px`}
          style:width={`${column.size}px`}
        >{columnLabel(column.index)}</div>
      {/each}
    </div>
    {#if frozenColumnsWidth > 0}
      <div class="frozen-column-headers" style:width={`${frozenColumnsWidth}px`}>
        {#each gutterLayout.columns.filter((column) => column.index <= frozenColumns) as column (column.index)}
          <div class="column-header" style:left={`${column.start}px`} style:width={`${column.size}px`}>{columnLabel(column.index)}</div>
        {/each}
      </div>
    {/if}
  </div>
  <div class="row-gutter">
    <div class="scrolling-row-headers" style:top={`${frozenRowsHeight}px`}>
      {#each gutterLayout.rows.filter((row) => row.index > frozenRows) as row (row.index)}
        <div
          class="row-header"
          style:top={`${row.start - scrollTop - frozenRowsHeight}px`}
          style:height={`${row.size}px`}
        >{row.index}</div>
      {/each}
    </div>
    {#if frozenRowsHeight > 0}
      <div class="frozen-row-headers" style:height={`${frozenRowsHeight}px`}>
        {#each gutterLayout.rows.filter((row) => row.index <= frozenRows) as row (row.index)}
          <div class="row-header" style:top={`${row.start}px`} style:height={`${row.size}px`}>{row.index}</div>
        {/each}
      </div>
    {/if}
  </div>
  <div class="corner"></div>
</div>

{#if tableMenu !== undefined && menuTable() !== undefined}
  {@const table = menuTable()!}
  {@const values = tableDistinctValues(table, tableMenu.columnId)}
  <button class="menu-scrim" aria-label="Close table menu" onclick={() => tableMenu = undefined}></button>
  <div class="table-menu" role="menu" style:left={`${Math.max(8, tableMenu.left)}px`} style:top={`${tableMenu.top}px`}>
    <button type="button" role="menuitem" onclick={() => sortTable(table, tableMenu!.columnId, "ascending")}>Sort ascending</button>
    <button type="button" role="menuitem" onclick={() => sortTable(table, tableMenu!.columnId, "descending")}>Sort descending</button>
    <button type="button" role="menuitem" onclick={() => clearTableFilter(table, tableMenu!.columnId)}>Clear filter</button>
    <div class="menu-values" role="group" aria-label="Visible values">
      {#each values as value (value)}
        <label>
          <input type="checkbox" checked={valueChecked(table, tableMenu.columnId, value)} onchange={(event) => toggleTableValue(table, tableMenu!.columnId, value, event.currentTarget.checked)} />
          <span>{value === "" ? "Blank" : value}</span>
        </label>
      {/each}
    </div>
  </div>
{/if}

<style>
  .tumbler-grid { position: relative; overflow: hidden; color: var(--tumbler-grid-fg, #d8e2d8); background: var(--tumbler-grid-bg, #111411); outline: none; font: 13px/1.3 system-ui, sans-serif; user-select: none; -webkit-user-select: none; }
  .grid-scroller { width: 100%; height: 100%; overflow: auto; overscroll-behavior: contain; }
  .canvas { position: relative; color: var(--tumbler-sheet-fg, #111111); background: var(--tumbler-sheet-bg, #ffffff); }
  .frozen-row-pane, .frozen-column-pane { position: absolute; z-index: 2; overflow: hidden; pointer-events: none; background: var(--tumbler-sheet-bg, #ffffff); }
  .frozen-row-pane { left: 52px; right: 0; top: 28px; }
  .frozen-column-pane { left: 52px; bottom: 0; }
  .frozen-row-pane .cell, .frozen-column-pane .cell { pointer-events: auto; }
  .column-gutter { position: absolute; left: 52px; right: 0; top: 0; z-index: 3; height: 28px; overflow: hidden; pointer-events: none; background: var(--tumbler-grid-header-bg, #171b17); }
  .row-gutter { position: absolute; left: 0; top: 28px; bottom: 0; z-index: 3; width: 52px; overflow: hidden; pointer-events: none; background: var(--tumbler-grid-header-bg, #171b17); }
  .scrolling-column-headers, .frozen-column-headers, .scrolling-row-headers, .frozen-row-headers { position: absolute; overflow: hidden; }
  .scrolling-column-headers { right: 0; top: 0; bottom: 0; }
  .frozen-column-headers { left: 0; top: 0; bottom: 0; z-index: 1; background: var(--tumbler-grid-header-bg, #171b17); }
  .scrolling-row-headers { left: 0; right: 0; bottom: 0; }
  .frozen-row-headers { left: 0; right: 0; top: 0; z-index: 1; background: var(--tumbler-grid-header-bg, #171b17); }
  .corner, .column-header, .row-header { position: absolute; box-sizing: border-box; background: var(--tumbler-grid-header-bg, #171b17); color: var(--tumbler-grid-muted, #9aa79a); border: 0 solid var(--tumbler-grid-line, #2a302a); }
  .corner { left: 0; top: 0; width: 52px; height: 28px; border-right-width: 1px; border-bottom-width: 1px; z-index: 4; pointer-events: none; }
  .column-header { top: 0; height: 28px; display: grid; place-items: center; border-right-width: 1px; border-bottom-width: 1px; }
  .row-header { left: 0; width: 52px; display: grid; place-items: center; border-right-width: 1px; border-bottom-width: 1px; }
  .cell { position: absolute; z-index: 1; box-sizing: border-box; display: flex; align-items: flex-end; overflow: hidden; padding: 2px 8px; white-space: nowrap; text-overflow: ellipsis; color: var(--tumbler-sheet-fg, #111111); border-right: 1px solid var(--tumbler-sheet-line, #d9ded9); border-bottom: 1px solid var(--tumbler-sheet-line, #d9ded9); background: var(--tumbler-sheet-bg, #ffffff); }
  .cell.selected::after { content: ""; position: absolute; inset: 0; z-index: 0; pointer-events: none; background: var(--tumbler-grid-selection-bg, rgba(65, 255, 83, 0.1)); }
  .cell.focused { z-index: 2; box-shadow: inset 0 0 0 2px var(--tumbler-grid-accent, #42ff53); }
  .cell > * { position: relative; z-index: 1; min-width: 0; max-width: 100%; transform-origin: center; }
  .cell.table-header { align-items: center; font-weight: 600; padding-right: 30px; }
  .table-menu-button { position: absolute; right: 4px; top: 50%; width: 20px; height: 20px; padding: 0; translate: 0 -50%; border: 1px solid transparent; border-radius: 3px; color: inherit; background: color-mix(in srgb, currentColor 10%, transparent); cursor: pointer; }
  .table-menu-button:hover, .table-menu-button:focus-visible, .table-menu-button.active { border-color: var(--tumbler-grid-accent, #42ff53); outline: none; }
  .cell-hyperlink { overflow: hidden; padding: 0; border: 0; color: inherit; background: transparent; font: inherit; text-align: inherit; text-decoration: inherit; text-overflow: inherit; white-space: inherit; cursor: pointer; }
  .cell-hyperlink:focus-visible { outline: 1px solid currentColor; outline-offset: 1px; }
  .menu-scrim { position: fixed; inset: 0; z-index: 9998; border: 0; background: transparent; }
  .table-menu { position: fixed; z-index: 9999; width: 220px; overflow: hidden; border: 1px solid var(--tumbler-grid-line, #2a302a); border-radius: 8px; color: var(--tumbler-grid-fg, #d8e2d8); background: var(--tumbler-grid-header-bg, #171b17); box-shadow: 0 12px 36px rgb(0 0 0 / 35%); font: 13px/1.3 system-ui, sans-serif; }
  .table-menu > button { display: block; width: 100%; padding: 9px 12px; border: 0; color: inherit; background: transparent; text-align: left; cursor: pointer; }
  .table-menu > button:hover, .table-menu > button:focus-visible { background: color-mix(in srgb, var(--tumbler-grid-accent, #42ff53) 12%, transparent); outline: none; }
  .menu-values { max-height: 220px; overflow: auto; padding: 6px 0; border-top: 1px solid var(--tumbler-grid-line, #2a302a); }
  .menu-values label { display: flex; gap: 8px; align-items: center; padding: 6px 12px; cursor: pointer; }
  .menu-values label:hover { background: color-mix(in srgb, var(--tumbler-grid-accent, #42ff53) 8%, transparent); }
  .cell input { width: 100%; height: 100%; box-sizing: border-box; border: 0; outline: 0; padding: 0; color: inherit; background: transparent; font: inherit; user-select: text; -webkit-user-select: text; }
</style>
