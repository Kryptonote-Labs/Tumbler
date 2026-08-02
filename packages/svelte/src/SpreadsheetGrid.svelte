<script lang="ts">
  import { createGridSelection, moveGridSelection, type GridDirection, type GridSelection } from "@tumbler/core";
  import { EXCEL_MAX_COLUMNS, EXCEL_MAX_ROWS, formatCellReference, type SpreadsheetCellValue, type SpreadsheetWorksheet } from "@tumbler/sheets";
  import { calculateSpreadsheetViewport } from "./spreadsheet-viewport.ts";

  interface CellEdit {
    readonly reference: string;
    readonly value: string;
  }

  interface Props {
    readonly worksheet: SpreadsheetWorksheet;
    selection?: GridSelection;
    readonly onselectionchange?: (selection: GridSelection) => void;
    readonly onedit?: (edit: CellEdit) => void;
    readonly rowCount?: number;
    readonly columnCount?: number;
    readonly rowHeight?: number;
    readonly columnWidth?: number;
  }

  let {
    worksheet,
    selection = createGridSelection({ row: 1, column: 1 }),
    onselectionchange,
    onedit,
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
  let draft = $state("");
  const rowHeaderWidth = 52;
  const columnHeaderHeight = 28;
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
  }));

  function select(row: number, column: number, extend = false) {
    const point = { row, column };
    selection = extend ? createGridSelection(selection.anchor, point) : createGridSelection(point);
    onselectionchange?.(selection);
  }

  function handleScroll(event: Event) {
    const target = event.currentTarget as HTMLDivElement;
    scrollTop = target.scrollTop;
    scrollLeft = target.scrollLeft;
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
      selection = moveGridSelection(selection, direction, { rows: rowCount, columns: columnCount }, { extend: event.shiftKey });
      onselectionchange?.(selection);
    } else if (event.key === "Enter") {
      event.preventDefault();
      beginEdit(selection.focus.row, selection.focus.column);
    }
  }

  function beginEdit(row: number, column: number) {
    const reference = formatCellReference({ row, column });
    editing = reference;
    draft = displayValue(worksheet.cell(reference)?.value);
  }

  function cellKeydown(event: KeyboardEvent, row: number, column: number) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      select(row, column, event.shiftKey);
    }
  }

  function finishEdit(commit: boolean) {
    const reference = editing;
    editing = undefined;
    if (commit && reference !== undefined) onedit?.({ reference, value: draft });
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

  function columnLabel(column: number): string {
    return formatCellReference({ row: 1, column }).slice(0, -1);
  }
</script>

<div
  class="tumbler-grid"
  role="grid"
  aria-rowcount={rowCount}
  aria-colcount={columnCount}
  tabindex="0"
  bind:clientWidth={viewportWidth}
  bind:clientHeight={viewportHeight}
  onscroll={handleScroll}
  onkeydown={handleKeydown}
>
  <div class="canvas" style:width={`${viewport.totalWidth + rowHeaderWidth}px`} style:height={`${viewport.totalHeight + columnHeaderHeight}px`}>
    <div class="corner" style:transform={`translate(${scrollLeft}px, ${scrollTop}px)`}></div>
    {#each viewport.columns as column (column.index)}
      <div
        class="column-header"
        style:left={`${rowHeaderWidth + column.start}px`}
        style:width={`${column.size}px`}
        style:transform={`translateY(${scrollTop}px)`}
      >{columnLabel(column.index)}</div>
    {/each}
    {#each viewport.rows as row (row.index)}
      <div
        class="row-header"
        style:top={`${columnHeaderHeight + row.start}px`}
        style:height={`${row.size}px`}
        style:transform={`translateX(${scrollLeft}px)`}
      >{row.index}</div>
      {#each viewport.columns as column (column.index)}
        {@const reference = formatCellReference({ row: row.index, column: column.index })}
        <div
          class:selected={selected(row.index, column.index)}
          class:focused={selection.focus.row === row.index && selection.focus.column === column.index}
          class="cell"
          role="gridcell"
          tabindex="-1"
          aria-selected={selected(row.index, column.index)}
          style:left={`${rowHeaderWidth + column.start}px`}
          style:top={`${columnHeaderHeight + row.start}px`}
          style:width={`${column.size}px`}
          style:height={`${row.size}px`}
          onclick={(event) => select(row.index, column.index, event.shiftKey)}
          onkeydown={(event) => cellKeydown(event, row.index, column.index)}
          ondblclick={() => beginEdit(row.index, column.index)}
        >
          {#if editing === reference}
            <input bind:value={draft} onkeydown={inputKeydown} onblur={() => finishEdit(true)} aria-label={`Edit ${reference}`} />
          {:else}
            <span>{displayValue(worksheet.cell(reference)?.value)}</span>
          {/if}
        </div>
      {/each}
    {/each}
  </div>
</div>

<style>
  .tumbler-grid { position: relative; overflow: auto; contain: strict; color: var(--tumbler-grid-fg, #d8e2d8); background: var(--tumbler-grid-bg, #111411); outline: none; font: 13px/1.3 system-ui, sans-serif; }
  .canvas { position: relative; }
  .corner, .column-header, .row-header { position: absolute; z-index: 3; box-sizing: border-box; background: var(--tumbler-grid-header-bg, #171b17); color: var(--tumbler-grid-muted, #9aa79a); border: 0 solid var(--tumbler-grid-line, #2a302a); }
  .corner { left: 0; top: 0; width: 52px; height: 28px; border-right-width: 1px; border-bottom-width: 1px; z-index: 4; }
  .column-header { top: 0; height: 28px; display: grid; place-items: center; border-right-width: 1px; border-bottom-width: 1px; }
  .row-header { left: 0; width: 52px; display: grid; place-items: center; border-right-width: 1px; border-bottom-width: 1px; }
  .cell { position: absolute; z-index: 1; box-sizing: border-box; overflow: hidden; padding: 5px 8px; white-space: nowrap; text-overflow: ellipsis; border-right: 1px solid var(--tumbler-grid-line, #2a302a); border-bottom: 1px solid var(--tumbler-grid-line, #2a302a); background: var(--tumbler-grid-cell-bg, transparent); }
  .cell.selected { background: var(--tumbler-grid-selection-bg, rgba(65, 255, 83, 0.1)); }
  .cell.focused { z-index: 2; box-shadow: inset 0 0 0 2px var(--tumbler-grid-accent, #42ff53); }
  input { width: 100%; height: 100%; box-sizing: border-box; border: 0; outline: 0; padding: 0; color: inherit; background: transparent; font: inherit; }
</style>
