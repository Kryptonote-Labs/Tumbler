import type { SparseAxisGeometry } from '@tumblerjs/core';
import { layoutChartScene, type ChartScene } from '@tumblerjs/charts';
import type { SpreadsheetCalculationSnapshot } from './calculation.ts';
import { resolveSpreadsheetCellPaint, spreadsheetPaintStyle, type SpreadsheetCellFrame, type SpreadsheetCellPaint } from './canvas-cell.ts';
import { resolveSpreadsheetChartDataSet } from './chart-data.ts';
import { resolveSpreadsheetChartColor } from './chart-colors.ts';
import { projectSpreadsheetConditionalStyles } from './conditional-formatting.ts';
import { readSpreadsheetDrawingObjects, type SpreadsheetDrawingObject } from './drawing-objects.ts';
import { spreadsheetDrawingBounds, spreadsheetDrawingRegion, type SpreadsheetDrawingAnchor, type SpreadsheetDrawingBounds } from './drawings.ts';
import { formatSpreadsheetCellValue } from './number-format.ts';
import { EXCEL_MAX_COLUMNS, EXCEL_MAX_ROWS, type CellAddress } from './references.ts';
import { projectSpreadsheetTable } from './table-view.ts';
import { spreadsheetTextOverflowWidth } from './text-overflow.ts';
import type { SpreadsheetWorksheet } from './worksheet.ts';

export interface SpreadsheetViewportOptions {
  /** Output size in CSS pixels, including headings. */
  readonly width: number;
  readonly height: number;
  /** Paint row numbers and column letters. */
  readonly headings?: boolean;
  /** Calculated values; saved values are shown without it. */
  readonly calculation?: SpreadsheetCalculationSnapshot;
  /** Widest digit of the Normal style font, which sets column widths. */
  readonly maximumDigitWidth?: number;
  /** Text width in a CSS font shorthand, used to centre chart legends. */
  readonly measureText?: (text: string, font: string) => number | undefined;
}

export interface SpreadsheetViewportAxisItem {
  readonly index: number;
  /** Viewport position in CSS pixels, after headings. */
  readonly start: number;
  readonly size: number;
}
export interface SpreadsheetViewportCell {
  readonly frame: SpreadsheetCellFrame;
  /** Pane bounds for merges that extend beyond the visible span. */
  readonly clip?: SpreadsheetViewportRect;
  readonly paint: SpreadsheetCellPaint;
}
export interface SpreadsheetViewportRect { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
interface PlacedDrawing {
  readonly bounds: SpreadsheetViewportRect;
  readonly clip: SpreadsheetViewportRect;
  /** Anchor position in the Drawing part, which sets stacking order. */
  readonly order: number;
}
export type SpreadsheetViewportDrawing =
  | (PlacedDrawing & { readonly kind: 'chart'; readonly scene: ChartScene })
  | (PlacedDrawing & { readonly kind: 'object'; readonly object: SpreadsheetDrawingObject });

/**
 * A worksheet view resolved to plain paint data, from the saved scroll position and frozen panes.
 * It holds no workbook references, so it can be transferred to a worker and painted there.
 */
export interface SpreadsheetViewportLayout {
  readonly width: number;
  readonly height: number;
  readonly rowHeaderWidth: number;
  readonly columnHeaderHeight: number;
  readonly gridlines: boolean;
  readonly rows: readonly SpreadsheetViewportAxisItem[];
  readonly columns: readonly SpreadsheetViewportAxisItem[];
  /** Merged ranges are single cells, clipped to the pane of their first cell. */
  readonly cells: readonly SpreadsheetViewportCell[];
  /** Stacked in Drawing part order, as the editor stacks them. */
  readonly drawings: readonly SpreadsheetViewportDrawing[];
}

interface Axis {
  readonly items: readonly SpreadsheetViewportAxisItem[];
  readonly frozen: number;
  readonly frozenExtent: number;
  /** Sheet pixels scrolled out of the unfrozen pane. */
  readonly scroll: number;
  readonly header: number;
  readonly extent: number;
}

/** Viewport offset and visible span of the frozen or scrolling pane along one axis. */
function paneSpan(axis: Axis, frozen: boolean) {
  return frozen
    ? { offset: axis.header, start: axis.header, end: axis.header + axis.frozenExtent }
    : { offset: axis.header - axis.scroll, start: axis.header + axis.frozenExtent, end: axis.extent };
}

/** Lays out the worksheet as the editor first shows it, without selection or editing chrome. */
export function layoutSpreadsheetViewport(worksheet: SpreadsheetWorksheet, options: SpreadsheetViewportOptions): SpreadsheetViewportLayout {
  const { calculation } = options;
  const rowHeaderWidth = options.headings ? 52 : 0, columnHeaderHeight = options.headings ? 28 : 0;
  const projectedRows = savedTableRows(worksheet, calculation);
  const rowGeometry = worksheet.rowGeometry(EXCEL_MAX_ROWS, projectedRows), columnGeometry = worksheet.columnGeometry(EXCEL_MAX_COLUMNS, options.maximumDigitWidth);
  const pane = worksheet.panes.find(p => p.state === 'frozen' || p.state === 'frozenSplit');
  const view = worksheet.views[0];
  const topLeft = pane?.topLeftCell ?? view?.topLeftCell;
  const rows = axis(rowGeometry, Math.floor(pane?.ySplit ?? 0), topLeft?.row ?? 1, columnHeaderHeight, options.height);
  const columns = axis(columnGeometry, Math.floor(pane?.xSplit ?? 0), topLeft?.column ?? 1, rowHeaderWidth, options.width);
  const lastColumn = columns.items.at(-1)?.index ?? 1;
  const conditional = projectSpreadsheetConditionalStyles(worksheet, calculation);

  const resolve = (address: CellAddress) => {
    const value = calculation?.value(address) ?? worksheet.cell(address)?.value;
    const style = spreadsheetPaintStyle(worksheet, address, conditional.formats(address), value);
    const text = worksheet.hyperlink(address)?.display ?? calculation?.displayText(address) ?? worksheet.displayText(address);
    return resolveSpreadsheetCellPaint(worksheet, style, text);
  };
  const cells: SpreadsheetViewportCell[] = [];
  for (const row of rows.items) for (const column of columns.items) {
    const source = projectedRows.has(row.index) ? projectedRows.get(row.index) : row.index;
    if (source === undefined) continue;
    const address = { row: source, column: column.index };
    if (worksheet.mergedRange(address)) continue;
    const overflowWidth = spreadsheetTextOverflowWidth({ worksheet, calculation, ...address, columnGeometry, maximumColumn: lastColumn, frozenColumns: columns.frozen });
    cells.push({ frame: { x: column.start, y: row.start, width: column.size, height: row.size, overflowWidth }, paint: resolve(address) });
  }
  // Merges keep their full rectangle in the pane of their first cell, clipped to that pane.
  // As with drawings, the frozen-row pane spans the full width.
  for (const range of worksheet.merges) {
    const span = (geometry: SparseAxisGeometry, axis: Axis, first: number, last: number, fullWidth = false) => {
      const pane = paneSpan(axis, first <= axis.frozen);
      const { start, end } = fullWidth ? { start: axis.header, end: axis.extent } : pane;
      const from = pane.offset + geometry.start(first), to = pane.offset + geometry.start(last) + geometry.size(last);
      return from < end && to > start && to > from ? { from, to, start, end } : undefined;
    };
    const x = span(columnGeometry, columns, range.start.column, range.end.column, range.start.row <= rows.frozen);
    const y = span(rowGeometry, rows, range.start.row, range.end.row);
    if (!x || !y) continue;
    cells.push({
      frame: { x: x.from, y: y.from, width: x.to - x.from, height: y.to - y.from },
      clip: { x: x.start, y: y.start, width: x.end - x.start, height: y.end - y.start },
      paint: resolve(range.start),
    });
  }

  // Mirrors the editor's drawing panes: frozen-row drawings scroll horizontally across the full width.
  const placeDrawing = (anchor: SpreadsheetDrawingAnchor, bounds: SpreadsheetDrawingBounds) => {
    const region = spreadsheetDrawingRegion(anchor, rows.frozen, columns.frozen);
    const fixedColumn = anchor.kind !== 'absolute' && anchor.from.column < columns.frozen;
    const x = paneSpan(columns, region === 'frozen-column' || (region === 'frozen-row' && fixedColumn));
    const y = paneSpan(rows, region === 'frozen-row');
    const clip = region === 'frozen-row'
      ? { x: rowHeaderWidth, y: y.start, width: options.width - rowHeaderWidth, height: y.end - y.start }
      : { x: x.start, y: y.start, width: x.end - x.start, height: y.end - y.start };
    const placed = { x: x.offset + bounds.x, y: y.offset + bounds.y, width: bounds.width, height: bounds.height };
    const visible = placed.x < clip.x + clip.width && placed.x + placed.width > clip.x && placed.y < clip.y + clip.height && placed.y + placed.height > clip.y;
    return visible && placed.width > 0 && placed.height > 0 ? { bounds: placed, clip } : undefined;
  };
  const drawings: SpreadsheetViewportDrawing[] = [];
  const drawing = worksheet.drawing;
  if (drawing) {
    const order = new Map(drawing.anchors.map((anchor, index) => [anchor.elementId, index]));
    for (const { anchor, object } of readSpreadsheetDrawingObjects(worksheet.workbook, drawing, worksheet)) {
      const placed = placeDrawing(anchor, spreadsheetDrawingBounds(anchor, rowGeometry, columnGeometry));
      if (placed) drawings.push({ kind: 'object', order: order.get(anchor.elementId) ?? 0, ...placed, object });
    }
    const models = resolveSpreadsheetChartDataSet(worksheet, drawing.charts.map(frame => frame.model));
    for (const [index, frame] of drawing.charts.entries()) {
      const model = models[index];
      const sheetBounds = spreadsheetDrawingBounds(frame.anchor, rowGeometry, columnGeometry);
      const placed = placeDrawing(frame.anchor, sheetBounds);
      if (!placed || model?.status !== 'supported') continue;
      const { bounds, clip } = placed;
      const left = Math.max(0, clip.x - bounds.x), top = Math.max(0, clip.y - bounds.y);
      const scene = layoutChartScene(model, bounds.width, bounds.height, {
        patternOrigin: { x: sheetBounds.x, y: sheetBounds.y },
        viewport: { x: left, y: top, width: Math.min(bounds.width, clip.x + clip.width - bounds.x) - left, height: Math.min(bounds.height, clip.y + clip.height - bounds.y) - top },
        dateSystem: worksheet.workbook.dateSystem,
        resolveColor: color => resolveSpreadsheetChartColor(worksheet.styles, color),
        formatNumber: (value, formatCode) => formatSpreadsheetCellValue({ type: 'number', value, lexical: String(value) }, { ...(formatCode === undefined ? {} : { numberFormatCode: formatCode }), dateSystem: worksheet.workbook.dateSystem }),
        ...(options.measureText ? { measureText: options.measureText } : {}),
      });
      drawings.push({ kind: 'chart', order: order.get(frame.anchor.elementId) ?? 0, bounds, clip, scene });
    }
  }
  return {
    width: options.width,
    height: options.height,
    rowHeaderWidth,
    columnHeaderHeight,
    gridlines: view?.showGridLines ?? true,
    rows: rows.items,
    columns: columns.items,
    cells,
    drawings: drawings.sort((a, b) => a.order - b.order),
  };
}

/** Visual rows mapped to source rows by saved table sorts and filters, as the editor first shows them. */
function savedTableRows(worksheet: SpreadsheetWorksheet, calculation: SpreadsheetCalculationSnapshot | undefined) {
  const rows = new Map<number, number | undefined>();
  const values = calculation && {
    value: (row: number, column: number) => calculation.value({ row, column }),
    displayText: (row: number, column: number) => calculation.displayText({ row, column }),
  };
  for (const table of worksheet.tables) {
    const projection = projectSpreadsheetTable(worksheet, table, undefined, values);
    const bodyStart = table.range.start.row + table.headerRowCount;
    for (let row = bodyStart; row <= table.range.end.row - table.totalsRowCount; row++) rows.set(row, projection.rows[row - bodyStart]);
  }
  return rows;
}

/** Frozen items, then the scrolling pane from `first`, until `extent` is filled. Hidden items are skipped. */
function axis(geometry: SparseAxisGeometry, frozen: number, first: number, header: number, extent: number): Axis {
  const items: SpreadsheetViewportAxisItem[] = [];
  frozen = Math.min(Math.max(0, frozen), geometry.count);
  let position = header;
  const visit = (index: number) => {
    const size = geometry.size(index);
    if (size > 0) items.push({ index, start: position, size });
    position += size;
  };
  for (let index = 1; index <= frozen && position < extent; index++) visit(index);
  const frozenExtent = position - header;
  const start = Math.min(Math.max(first, frozen + 1), geometry.count);
  for (let index = start; index <= geometry.count && position < extent; index++) visit(index);
  return { items, frozen, frozenExtent, scroll: start > geometry.count ? 0 : geometry.start(start) - frozenExtent, header, extent };
}
