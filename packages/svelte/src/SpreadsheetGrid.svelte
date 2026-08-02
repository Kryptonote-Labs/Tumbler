<script lang="ts">
  import { tick } from "svelte";
  import { createGridSelection, moveGridSelection, type GridDirection, type GridSelection } from "@tumbler/core";
  import { EXCEL_MAX_COLUMNS, EXCEL_MAX_ROWS, formatCellReference, type SpreadsheetCellValue, type SpreadsheetWorksheet } from "@tumbler/sheets";
  import { calculateSpreadsheetViewport } from "./spreadsheet-viewport.ts";
  import { composeSpreadsheetGridLayout, frozenGridTranslation } from "./spreadsheet-grid-layout.ts";
  import { coerceSpreadsheetEditValue, type SpreadsheetGridEdit } from "./spreadsheet-edit.ts";
  import { measureMaximumDigitWidth, spreadsheetFontShorthand } from "./spreadsheet-font-metrics.ts";

  interface Props {
    readonly worksheet: SpreadsheetWorksheet;
    selection?: GridSelection;
    readonly onselectionchange?: (selection: GridSelection) => void;
    readonly onedit?: (edit: SpreadsheetGridEdit) => void;
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
  let editor = $state<HTMLInputElement>();
  let draft = $state("");
  let maximumDigitWidth = $state(7);
  const rowHeaderWidth = 52;
  const columnHeaderHeight = 28;
  let rowGeometry = $derived(worksheet.rowGeometry(rowCount));
  let columnGeometry = $derived(worksheet.columnGeometry(columnCount, maximumDigitWidth));
  let frozenPane = $derived(worksheet.panes.find((pane) => pane.state === "frozen" || pane.state === "frozenSplit"));
  let frozenRows = $derived(Math.min(rowCount, Math.max(0, Math.floor(frozenPane?.ySplit ?? 0))));
  let frozenColumns = $derived(Math.min(columnCount, Math.max(0, Math.floor(frozenPane?.xSplit ?? 0))));
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
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      const owner = worksheet.mergedRange(selection.focus)?.start ?? selection.focus;
      onedit?.({ reference: formatCellReference(owner), value: null });
    }
  }

  function beginEdit(row: number, column: number) {
    const owner = worksheet.mergedRange({ row, column })?.start ?? { row, column };
    const reference = formatCellReference(owner);
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
    return worksheet.displayText(reference);
  }

  function cellCss(reference: string): string {
    const style = worksheet.cellStyle(reference);
    const declarations: string[] = [];
    const fontName = worksheet.styles.resolveFontName(style.font);
    if (fontName !== undefined) declarations.push(`font-family:${cssValue(fontName)}`);
    if (style.font.size !== undefined) declarations.push(`font-size:${style.font.size}pt`);
    if (style.font.bold) declarations.push("font-weight:700");
    if (style.font.italic) declarations.push("font-style:italic");
    if (style.font.underline !== undefined || style.font.strike) {
      declarations.push(`text-decoration:${[style.font.underline === undefined ? "" : "underline", style.font.strike ? "line-through" : ""].filter(Boolean).join(" ")}`);
    }
    const foreground = cssColor(style.font.color);
    const background = style.fill.patternType === "solid" ? cssColor(style.fill.foreground) : undefined;
    if (foreground !== undefined) declarations.push(`color:${foreground}`);
    if (background !== undefined) declarations.push(`background-color:${background}`);
    if (style.alignment.horizontal !== undefined) declarations.push(`text-align:${horizontalAlignment(style.alignment.horizontal)}`);
    if (style.alignment.wrapText) declarations.push("white-space:normal;overflow-wrap:anywhere");
    for (const side of ["left", "right", "top", "bottom"] as const) {
      const edge = style.border[side];
      if (edge.style !== undefined) declarations.push(`border-${side}:${borderWidth(edge.style)} ${borderStyle(edge.style)} ${cssColor(edge.color) ?? "currentColor"}`);
    }
    return declarations.join(";");
  }

  function cssColor(color: ReturnType<typeof worksheet.cellStyle>["font"]["color"]): string | undefined {
    const argb = worksheet.styles.resolveColor(color);
    return argb === undefined ? undefined : `#${argb.slice(2)}`;
  }

  function cssValue(value: string): string {
    return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
  }

  function horizontalAlignment(value: string): string {
    return value === "center" || value === "centerContinuous" ? "center" : value === "right" ? "right" : value === "justify" || value === "distributed" ? "justify" : "left";
  }

  function borderWidth(value: string): string {
    return value === "medium" || value.startsWith("medium") ? "2px" : value === "thick" || value === "double" ? "3px" : "1px";
  }

  function borderStyle(value: string): string {
    return value === "double" ? "double" : value.includes("Dash") || value.includes("dash") ? "dashed" : value.includes("Dot") || value.includes("dot") ? "dotted" : "solid";
  }

  function columnLabel(column: number): string {
    return formatCellReference({ row: 1, column }).slice(0, -1);
  }

  function cellTransform(row: number, column: number): string {
    const translation = frozenGridTranslation({ row, column, frozenRows, frozenColumns, scrollTop, scrollLeft });
    return `translate(${translation.x}px, ${translation.y}px)`;
  }

  function cellLayer(row: number, column: number): number {
    return row <= frozenRows || column <= frozenColumns ? 4 : 1;
  }

</script>

{#snippet gridCell(reference: string, row: number, column: number, left: number, top: number, width: number, height: number)}
  <div
    class:selected={selected(row, column)}
    class:focused={selection.focus.row === row && selection.focus.column === column}
    class="cell"
    role="gridcell"
    tabindex="-1"
    aria-selected={selected(row, column)}
    style:left={`${left}px`}
    style:top={`${top}px`}
    style:width={`${width}px`}
    style:height={`${height}px`}
    style:transform={cellTransform(row, column)}
    style:z-index={cellLayer(row, column)}
    style={cellCss(reference)}
    onclick={(event) => select(row, column, event.shiftKey)}
    onkeydown={(event) => cellKeydown(event, row, column)}
    ondblclick={() => beginEdit(row, column)}
  >
    {#if editing === reference}
      <input bind:this={editor} bind:value={draft} onkeydown={inputKeydown} onblur={() => finishEdit(true)} aria-label={`Edit ${reference}`} />
    {:else}
      <span>{displayCell(reference)}</span>
    {/if}
  </div>
{/snippet}

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
    {#each layout.columns as column (column.index)}
      <div
        class="column-header"
        style:left={`${rowHeaderWidth + column.start}px`}
        style:width={`${column.size}px`}
        style:transform={`translate(${column.index <= frozenColumns ? scrollLeft : 0}px, ${scrollTop}px)`}
      >{columnLabel(column.index)}</div>
    {/each}
    {#each layout.rows as row (row.index)}
      <div
        class="row-header"
        style:top={`${columnHeaderHeight + row.start}px`}
        style:height={`${row.size}px`}
        style:transform={`translate(${scrollLeft}px, ${row.index <= frozenRows ? scrollTop : 0}px)`}
      >{row.index}</div>
      {#each layout.columns as column (column.index)}
        {@const reference = formatCellReference({ row: row.index, column: column.index })}
        {#if worksheet.mergedRange(reference) === undefined}
          {@render gridCell(reference, row.index, column.index, rowHeaderWidth + column.start, columnHeaderHeight + row.start, column.size, row.size)}
        {/if}
      {/each}
    {/each}
    {#each layout.merges as merge (`${merge.range.start.row}:${merge.range.start.column}`)}
      {@const reference = formatCellReference(merge.range.start)}
      {@render gridCell(reference, merge.range.start.row, merge.range.start.column, rowHeaderWidth + merge.left, columnHeaderHeight + merge.top, merge.width, merge.height)}
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
  .cell.selected::after { content: ""; position: absolute; inset: 0; z-index: 0; pointer-events: none; background: var(--tumbler-grid-selection-bg, rgba(65, 255, 83, 0.1)); }
  .cell.focused { z-index: 2; box-shadow: inset 0 0 0 2px var(--tumbler-grid-accent, #42ff53); }
  .cell > * { position: relative; z-index: 1; }
  input { width: 100%; height: 100%; box-sizing: border-box; border: 0; outline: 0; padding: 0; color: inherit; background: transparent; font: inherit; }
</style>
