import type { SparseAxisGeometry } from '@tumblerjs/core';
import { layoutChartScene, type ChartScene } from '@tumblerjs/charts';
import type { SpreadsheetCalculationSnapshot } from './calculation.ts';
import { resolveSpreadsheetCellPaint, spreadsheetPaintStyle, type SpreadsheetCellFrame, type SpreadsheetCellPaint } from './canvas-cell.ts';
import { resolveSpreadsheetChartDataSet } from './chart-data.ts';
import { resolveSpreadsheetChartColor } from './chart-colors.ts';
import { projectSpreadsheetConditionalStyles } from './conditional-formatting.ts';
import { readSpreadsheetDrawingObjects, type SpreadsheetDrawingObject } from './drawing-objects.ts';
import { spreadsheetDrawingBounds, type SpreadsheetDrawingAnchor, type SpreadsheetDrawingBounds } from './drawings.ts';
import { formatSpreadsheetCellValue } from './number-format.ts';
import { EXCEL_MAX_COLUMNS, EXCEL_MAX_ROWS, type CellAddress } from './references.ts';
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
  readonly paint: SpreadsheetCellPaint;
}
export interface SpreadsheetViewportRect { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
export type SpreadsheetViewportDrawing =
  | { readonly kind: 'chart'; readonly bounds: SpreadsheetViewportRect; readonly clip: SpreadsheetViewportRect; readonly scene: ChartScene }
  | { readonly kind: 'object'; readonly bounds: SpreadsheetViewportRect; readonly clip: SpreadsheetViewportRect; readonly object: SpreadsheetDrawingObject };

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
  /** Merged ranges are single cells covering their visible span. */
  readonly cells: readonly SpreadsheetViewportCell[];
  /** Paint order: shapes and pictures, then charts, as the editor stacks them. */
  readonly drawings: readonly SpreadsheetViewportDrawing[];
}

interface Axis {
  readonly items: readonly SpreadsheetViewportAxisItem[];
  readonly frozen: number;
  readonly frozenExtent: number;
  /** Sheet pixels scrolled out of the unfrozen pane. */
  readonly scroll: number;
}

/** Lays out the worksheet as the editor first shows it, without selection or editing chrome. */
export function layoutSpreadsheetViewport(worksheet: SpreadsheetWorksheet, options: SpreadsheetViewportOptions): SpreadsheetViewportLayout {
  const { calculation } = options;
  const rowHeaderWidth = options.headings ? 52 : 0, columnHeaderHeight = options.headings ? 28 : 0;
  const rowGeometry = worksheet.rowGeometry(EXCEL_MAX_ROWS), columnGeometry = worksheet.columnGeometry(EXCEL_MAX_COLUMNS, options.maximumDigitWidth);
  const pane = worksheet.panes.find(p => p.state === 'frozen' || p.state === 'frozenSplit');
  const view = worksheet.views[0];
  const topLeft = pane?.topLeftCell ?? view?.topLeftCell;
  const rows = axis(rowGeometry, Math.floor(pane?.ySplit ?? 0), topLeft?.row ?? 1, columnHeaderHeight, options.height);
  const columns = axis(columnGeometry, Math.floor(pane?.xSplit ?? 0), topLeft?.column ?? 1, rowHeaderWidth, options.width);
  const rowItems = new Map(rows.items.map(item => [item.index, item]));
  const columnItems = new Map(columns.items.map(item => [item.index, item]));
  const lastColumn = columns.items.at(-1)?.index ?? 1;
  const conditional = projectSpreadsheetConditionalStyles(worksheet, calculation);

  const resolve = (address: CellAddress) => {
    const value = calculation?.value(address) ?? worksheet.cell(address)?.value;
    const style = spreadsheetPaintStyle(worksheet, address, conditional.formats(address), value);
    return resolveSpreadsheetCellPaint(worksheet, style, calculation?.displayText(address) ?? worksheet.displayText(address));
  };
  const cells: SpreadsheetViewportCell[] = [];
  for (const row of rows.items) for (const column of columns.items) {
    const address = { row: row.index, column: column.index };
    if (worksheet.mergedRange(address)) continue;
    const overflowWidth = spreadsheetTextOverflowWidth({ worksheet, calculation, ...address, columnGeometry, maximumColumn: lastColumn, frozenColumns: columns.frozen });
    cells.push({ frame: { x: column.start, y: row.start, width: column.size, height: row.size, overflowWidth }, paint: resolve(address) });
  }
  for (const range of worksheet.merges) {
    const span = (from: number, to: number, items: ReadonlyMap<number, SpreadsheetViewportAxisItem>) => {
      let start = Infinity, end = -Infinity;
      for (let index = from; index <= to; index++) {
        const item = items.get(index);
        if (item) { start = Math.min(start, item.start); end = Math.max(end, item.start + item.size); }
      }
      return start < end ? { start, size: end - start } : undefined;
    };
    const y = span(range.start.row, range.end.row, rowItems), x = span(range.start.column, range.end.column, columnItems);
    if (x && y) cells.push({ frame: { x: x.start, y: y.start, width: x.size, height: y.size }, paint: resolve(range.start) });
  }

  const placeDrawing = (anchor: SpreadsheetDrawingAnchor) => {
    const place = (start: number, size: number, marker: number | undefined, axis: Axis, header: number, extent: number) => {
      const frozen = marker !== undefined && marker < axis.frozen;
      return {
        start: header + start - (frozen ? 0 : axis.scroll),
        size,
        clipStart: header + (frozen ? 0 : axis.frozenExtent),
        clipEnd: frozen ? header + axis.frozenExtent : extent,
      };
    };
    return (bounds: SpreadsheetDrawingBounds) => {
      const from = anchor.kind === 'absolute' ? undefined : anchor.from;
      const x = place(bounds.x, bounds.width, from?.column, columns, rowHeaderWidth, options.width);
      const y = place(bounds.y, bounds.height, from?.row, rows, columnHeaderHeight, options.height);
      const clip = { x: x.clipStart, y: y.clipStart, width: x.clipEnd - x.clipStart, height: y.clipEnd - y.clipStart };
      const placed = { x: x.start, y: y.start, width: bounds.width, height: bounds.height };
      const visible = placed.x < clip.x + clip.width && placed.x + placed.width > clip.x && placed.y < clip.y + clip.height && placed.y + placed.height > clip.y;
      return visible && placed.width > 0 && placed.height > 0 ? { bounds: placed, clip } : undefined;
    };
  };
  const drawings: SpreadsheetViewportDrawing[] = [];
  const drawing = worksheet.drawing;
  if (drawing) {
    for (const { anchor, object } of readSpreadsheetDrawingObjects(worksheet.workbook, drawing, worksheet)) {
      const placed = placeDrawing(anchor)(spreadsheetDrawingBounds(anchor, rowGeometry, columnGeometry));
      if (placed) drawings.push({ kind: 'object', ...placed, object });
    }
    const models = resolveSpreadsheetChartDataSet(worksheet, drawing.charts.map(frame => frame.model));
    for (const [index, frame] of drawing.charts.entries()) {
      const model = models[index];
      const sheetBounds = spreadsheetDrawingBounds(frame.anchor, rowGeometry, columnGeometry);
      const placed = placeDrawing(frame.anchor)(sheetBounds);
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
      drawings.push({ kind: 'chart', bounds, clip, scene });
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
    drawings,
  };
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
  return { items, frozen, frozenExtent, scroll: start > geometry.count ? 0 : geometry.start(start) - frozenExtent };
}
