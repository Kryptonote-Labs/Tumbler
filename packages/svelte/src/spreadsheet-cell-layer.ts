import type { GridSelection, SparseAxisGeometry } from '@tumblerjs/core';
import {
  formatCellReference,
  invalidateSpreadsheetPaintFonts,
  paintSpreadsheetCell,
  resolveSpreadsheetCellPaint,
  spreadsheetPaintStyle,
  spreadsheetTextOverflowWidth,
  type CellAddress,
  type SpreadsheetCalculationSnapshot,
  type SpreadsheetCellPaint,
  type SpreadsheetConditionalStyleProjection,
  type SpreadsheetPaintColours,
  type SpreadsheetWorksheet,
} from '@tumblerjs/sheets';
import type { VirtualGridItem } from './spreadsheet-viewport.ts';

export interface SpreadsheetCellLayerInput {
  readonly scrollTop: number;
  readonly scrollLeft: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly scale: number;
  readonly gridlines: boolean;
  readonly worksheet: SpreadsheetWorksheet;
  readonly calculation: SpreadsheetCalculationSnapshot | undefined;
  readonly conditional: SpreadsheetConditionalStyleProjection;
  readonly rows: readonly VirtualGridItem[];
  readonly columns: readonly VirtualGridItem[];
  readonly columnGeometry: SparseAxisGeometry;
  readonly projectedRows: ReadonlyMap<number, number | undefined>;
  readonly selection: GridSelection;
  readonly editing: string | undefined;
  readonly frozenRows: number;
  readonly frozenColumns: number;
  readonly rowOrigin: number;
  readonly columnOrigin: number;
  readonly rowHeaderWidth: number;
  readonly columnHeaderHeight: number;
  readonly emptyRegion: CellAddress | undefined;
}
interface PaintedCell {
  readonly address: CellAddress;
  readonly width: number;
  readonly height: number;
  readonly paint: SpreadsheetCellPaint;
  readonly canOverflow: boolean;
  overflowWidth: number | undefined;
}
interface PaintedRow {
  readonly element: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
  readonly opaque: boolean;
  readonly cells: Map<number, PaintedCell>;
  origin: number;
  readonly extent: number;
  readonly item: VirtualGridItem;
  selection: GridSelection;
  gridlines: boolean;
}

/** Dense grids retain row bitmaps; the grid head owns keyboard access, selection and editing. */
export function spreadsheetCellLayer(host: HTMLDivElement, initial: SpreadsheetCellLayerInput) {
  const document = host.ownerDocument;
  const window = document.defaultView!;
  const computed = window.getComputedStyle(host);
  const colours: SpreadsheetPaintColours = {
    background: computed.getPropertyValue('--tumbler-sheet-bg').trim() || '#ffffff',
    foreground: computed.getPropertyValue('--tumbler-sheet-fg').trim() || '#111111',
    gridline: computed.getPropertyValue('--tumbler-sheet-line').trim() || '#d9ded9',
    selection: computed.getPropertyValue('--tumbler-grid-selection-bg').trim() || 'rgba(0,0,0,.16)',
  };
  const rows = new Map<number, PaintedRow>();
  const pending = new Set<number>();
  const recent = new Map<number, PaintedRow>();
  let recentBytes = 0;
  let previous: SpreadsheetCellLayerInput | undefined;
  let idle: number | undefined;
  let rasterRatio = NaN;
  function update(input: SpreadsheetCellLayerInput, preparationBudget = 0.5) {
    const pixelRatio = input.scale * window.devicePixelRatio;
    const budget =
      previous && typeof window.requestIdleCallback === 'function'
        ? performance.now() + preparationBudget
        : Infinity;
    if (
      !previous ||
      input.worksheet !== previous.worksheet ||
      input.calculation !== previous.calculation ||
      input.conditional !== previous.conditional ||
      input.columnGeometry !== previous.columnGeometry ||
      input.projectedRows !== previous.projectedRows ||
      input.scale !== previous.scale ||
      input.frozenColumns !== previous.frozenColumns ||
      pixelRatio !== rasterRatio
    ) {
      host.replaceChildren();
      rows.clear();
      recent.clear();
      recentBytes = 0;
      pending.clear();
    }
    rasterRatio = pixelRatio;
    const visible = new Set(
      input.rows
        .filter(
          (row) =>
            row.index > input.frozenRows &&
            !(
              input.emptyRegion &&
              row.index > input.emptyRegion.row &&
              (input.columns.find((column) => column.index > input.frozenColumns)?.index ??
                Infinity) > input.emptyRegion.column
            ),
        )
        .map((row) => row.index),
    );
    for (const [index, row] of rows)
      if (!visible.has(index)) {
        row.element.remove();
        recent.set(index, row);
        recentBytes += row.element.width * row.element.height * 4;
        while (recentBytes > 32 * 1024 * 1024 || recent.size > 512) {
          const oldest = recent.entries().next().value;
          if (!oldest) break;
          recent.delete(oldest[0]);
          recentBytes -= oldest[1].element.width * oldest[1].element.height * 4;
        }
        rows.delete(index);
        pending.delete(index);
      }
    const columnsChanged = input.columns !== previous?.columns;
    const selectionChanged = input.selection !== previous?.selection;
    const positionChanged =
      input.rowOrigin !== previous?.rowOrigin ||
      input.columnOrigin !== previous?.columnOrigin ||
      input.rowHeaderWidth !== previous?.rowHeaderWidth ||
      input.columnHeaderHeight !== previous?.columnHeaderHeight;
    const columns = new Map(
      input.columns
        .filter((column) => column.index > input.frozenColumns)
        .map((column) => [column.index, column]),
    );
    const firstColumn = input.columns[0]?.start ?? 0;
    const lastColumn = input.columns.at(-1);
    const lastEdge = lastColumn ? lastColumn.start + lastColumn.size : 0;
    const ratio = pixelRatio;
    const nextOrigin = (Math.floor((firstColumn * ratio) / 1024) * 1024) / ratio;
    for (const item of input.rows) {
      if (!visible.has(item.index)) continue;
      let row = rows.get(item.index);
      const returning = !row && recent.has(item.index);
      if (returning) {
        row = recent.get(item.index)!;
        recent.delete(item.index);
        recentBytes -= row.element.width * row.element.height * 4;
        rows.set(item.index, row);
      }
      if (
        row &&
        (row.item.start !== item.start ||
          row.item.size !== item.size ||
          lastEdge - firstColumn > row.extent)
      ) {
        row.element.remove();
        rows.delete(item.index);
        row = undefined;
      }
      let originMoved = false;
      if (row && (firstColumn < row.origin || lastEdge > row.origin + row.extent)) {
        const shift = Math.round((row.origin - nextOrigin) * ratio);
        const context = row.context;
        context.save();
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.drawImage(row.element, shift, 0);
        if (shift < 0) context.clearRect(row.element.width + shift, 0, -shift, row.element.height);
        else context.clearRect(0, 0, shift, row.element.height);
        context.restore();
        row.origin = nextOrigin;
        originMoved = true;
      }
      const creating = !row;
      if (!row) {
        const element = document.createElement('canvas');
        element.className = 'painted-row';
        element.setAttribute('aria-hidden', 'true');
        const origin = nextOrigin;
        const extent = ((Math.ceil(((lastEdge - origin) * ratio) / 1024) + 1) * 1024) / ratio;
        element.width = Math.ceil(extent * ratio);
        element.height = Math.max(1, Math.ceil(item.size * ratio));
        element.style.width = `${extent}px`;
        element.style.height = `${item.size}px`;
        const opaque =
          /^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(colours.background) &&
          !(input.emptyRegion && item.index > input.emptyRegion.row);
        const context = element.getContext('2d', { alpha: !opaque })!;
        if (opaque) {
          context.fillStyle = colours.background;
          context.fillRect(0, 0, element.width, element.height);
        }
        context.scale(ratio, ratio);
        row = {
          element,
          context,
          opaque,
          cells: new Map(),
          item,
          origin,
          extent,
          selection: input.selection,
          gridlines: input.gridlines,
        };
        rows.set(item.index, row);
      }
      const added: PaintedCell[] = [];
      let overflowChanged = false;
      if (creating || returning || columnsChanged || pending.has(item.index)) {
        pending.delete(item.index);
        for (const index of row.cells.keys()) if (!columns.has(index)) row.cells.delete(index);
        const sourceRow = input.projectedRows.has(item.index)
          ? input.projectedRows.get(item.index)
          : item.index;
        if (sourceRow !== undefined)
          for (const column of columns.values()) {
            if (row.cells.has(column.index)) continue;
            const onScreen =
              item.start + item.size > input.scrollTop &&
              item.start < input.scrollTop + input.viewportHeight - input.columnHeaderHeight &&
              column.start + column.size > input.scrollLeft &&
              column.start < input.scrollLeft + input.viewportWidth - input.rowHeaderWidth;
            if (!onScreen && performance.now() > budget) {
              pending.add(item.index);
              continue;
            }
            const address = { row: sourceRow, column: column.index };
            if (skipped(input, address, item.index)) continue;
            const reference = formatCellReference(address);
            const value = input.calculation?.value(address) ?? input.worksheet.cell(address)?.value;
            const style = spreadsheetPaintStyle(
              input.worksheet,
              reference,
              input.conditional.formats(reference),
              value,
            );
            const cell: PaintedCell = {
              address,
              canOverflow: value?.type === 'string',
              overflowWidth: undefined,
              width: column.size,
              height: item.size,
              paint: resolveSpreadsheetCellPaint(
                input.worksheet,
                style,
                input.calculation?.displayText(reference) ?? input.worksheet.displayText(reference),
              ),
            };
            cell.overflowWidth = overflow(cell, input);
            row.cells.set(column.index, cell);
            added.push(cell);
          }
      }
      if ((columnsChanged || returning) && !creating)
        for (const cell of row.cells.values())
          if (cell.canOverflow) {
            const width = overflow(cell, input);
            overflowChanged ||= width !== cell.overflowWidth;
            cell.overflowWidth = width;
          }
      const redraw =
        selectionChanged ||
        row.selection !== input.selection ||
        overflowChanged ||
        row.gridlines !== input.gridlines;
      const cells = redraw ? [...row.cells.values()] : added;
      for (const phase of ['background', 'text'] as const)
        for (const cell of cells) {
          const { row: sourceRow, column } = cell.address;
          const selection = input.selection;
          const selected =
            sourceRow >= selection.range.start.row &&
            sourceRow <= selection.range.end.row &&
            column >= selection.range.start.column &&
            column <= selection.range.end.column &&
            !(sourceRow === selection.anchor.row && column === selection.anchor.column);
          paintSpreadsheetCell(
            row.context,
            cell.paint,
            {
              x: columns.get(column)!.start - row.origin,
              y: 0,
              width: cell.width,
              height: cell.height,
              selected,
              overflowWidth: cell.overflowWidth,
            },
            colours,
            input.gridlines,
            phase,
            { opaque: row.opaque },
          );
        }
      if (creating || returning || positionChanged || originMoved) {
        row.element.style.top = `${input.columnHeaderHeight + item.start - input.rowOrigin}px`;
        row.element.style.left = `${input.rowHeaderWidth + row.origin - input.columnOrigin}px`;
      }
      row.selection = input.selection;
      row.gridlines = input.gridlines;
      if (creating || returning) host.append(row.element);
    }
    previous = input;
    if (pending.size && idle === undefined) schedule();
  }
  function schedule() {
    idle = window.requestIdleCallback((deadline) => {
      idle = undefined;
      if (!previous || !pending.size) return;
      if (deadline.timeRemaining() < 2) {
        schedule();
        return;
      }
      update(previous, Math.min(1, deadline.timeRemaining() / 3));
    });
  }
  const refreshFonts = () => {
    invalidateSpreadsheetPaintFonts();
    const input = previous;
    previous = undefined;
    if (input) update(input);
  };
  document.fonts?.addEventListener('loadingdone', refreshFonts);
  update(initial);
  return {
    update,
    destroy() {
      document.fonts?.removeEventListener('loadingdone', refreshFonts);
      if (idle !== undefined) window.cancelIdleCallback(idle);
      host.replaceChildren();
      rows.clear();
      recent.clear();
      recentBytes = 0;
      pending.clear();
      previous = undefined;
    },
  };
}
function skipped(
  input: SpreadsheetCellLayerInput,
  address: CellAddress,
  visualRow: number,
): boolean {
  const sheet = input.worksheet;
  if (
    input.emptyRegion &&
    visualRow > input.emptyRegion.row &&
    address.column > input.emptyRegion.column
  )
    return true;
  return (
    sheet.mergedRange(address) !== undefined ||
    sheet.hyperlink(address) !== undefined ||
    sheet.cellStyle(address).alignment.textRotation === 255 ||
    sheet.tables.some(
      (table) =>
        table.headerRowCount === 1 &&
        address.row === table.range.start.row &&
        address.column >= table.range.start.column &&
        address.column <= table.range.end.column,
    )
  );
}
function overflow(cell: PaintedCell, input: SpreadsheetCellLayerInput): number | undefined {
  return cell.canOverflow
    ? spreadsheetTextOverflowWidth({
        worksheet: input.worksheet,
        calculation: input.calculation,
        ...cell.address,
        columnGeometry: input.columnGeometry,
        maximumColumn: input.columns.at(-1)?.index ?? cell.address.column,
        frozenColumns: input.frozenColumns,
      })
    : undefined;
}
