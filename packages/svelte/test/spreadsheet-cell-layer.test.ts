import { afterEach, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { createCanvas, type Canvas } from '@napi-rs/canvas';
import { createGridSelection } from '../../core/src/index.ts';
import {
  applySpreadsheetCommand,
  createSpreadsheet,
  projectSpreadsheetConditionalStyles,
} from '../../sheets/src/index.ts';
import {
  spreadsheetCellLayer,
  type SpreadsheetCellLayerInput,
} from '../src/spreadsheet-cell-layer.ts';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

function fixture() {
  const window = new Window();
  const canvasPrototype = window.HTMLCanvasElement.prototype;
  const getContext = Object.getOwnPropertyDescriptor(canvasPrototype, 'getContext')!;
  const canvases = new WeakMap<object, Canvas>();
  Object.defineProperty(window.HTMLCanvasElement.prototype, 'getContext', {
    value(this: object) {
      let canvas = canvases.get(this);
      if (!canvas) {
        canvas = createCanvas(4096, 100);
        canvases.set(this, canvas);
      }
      return canvas.getContext('2d');
    },
  });
  const host = window.document.createElement('div') as unknown as HTMLDivElement;
  const artifact = applySpreadsheetCommand(createSpreadsheet(), {
    name: 'set-range',
    sheetId: '1',
    reference: 'A1',
    values: [
      [1, 'Label', 3],
      [4, 5, 6],
      [7, 8, 9],
    ],
  });
  const rows = artifact.worksheet.rowGeometry(10),
    columns = artifact.worksheet.columnGeometry(10);
  const item = (geometry: typeof rows, index: number) => ({
    index,
    start: geometry.start(index),
    size: geometry.size(index),
  });
  const input: SpreadsheetCellLayerInput = {
    worksheet: artifact.worksheet,
    calculation: undefined,
    conditional: projectSpreadsheetConditionalStyles(artifact.worksheet),
    rows: [item(rows, 1), item(rows, 2)],
    columns: [item(columns, 1), item(columns, 2)],
    columnGeometry: columns,
    projectedRows: new Map(),
    selection: createGridSelection({ row: 1, column: 1 }),
    editing: undefined,
    frozenRows: 0,
    frozenColumns: 0,
    rowOrigin: 0,
    columnOrigin: 0,
    rowHeaderWidth: 52,
    columnHeaderHeight: 28,
    emptyRegion: undefined,
    scrollTop: 0,
    scrollLeft: 0,
    viewportWidth: 800,
    viewportHeight: 500,
    scale: 1,
    gridlines: true,
  };
  const layer = spreadsheetCellLayer(host, input);
  cleanups.push(async () => {
    layer.destroy();
    Object.defineProperty(canvasPrototype, 'getContext', getContext);
    await window.happyDOM.close();
  });
  return { host, layer, input, canvases, thirdRow: item(rows, 3) };
}

test('scrolling retains overlapping row bitmaps and mounts only the entering row', () => {
  const f = fixture();
  const first = f.host.querySelectorAll('canvas')[0]!;
  const retained = f.host.querySelectorAll('canvas')[1]!;
  f.layer.update({ ...f.input, rows: [f.input.rows[1]!, f.thirdRow] });
  expect(f.host.querySelectorAll('canvas')).toHaveLength(2);
  expect(f.host.querySelectorAll('canvas')[0]).toBe(retained);
  f.layer.update(f.input);
  expect([...f.host.querySelectorAll('canvas')]).toContain(first);
  expect([...f.host.querySelectorAll('canvas')]).toContain(retained);
  f.layer.destroy();
  expect(f.host.childElementCount).toBe(0);
});

test('selection repaints retained bitmaps without replacing the row', () => {
  const f = fixture();
  const selection = createGridSelection({ row: 1, column: 1 }, { row: 1, column: 2 });
  f.layer.update({ ...f.input, selection });
  const canvas = f.canvases.get(f.host.querySelector('canvas')!)!;
  const pixel = canvas.getContext('2d').getImageData(f.input.columns[1]!.start + 2, 2, 1, 1).data;
  expect(pixel[0]).toBeLessThan(255);
  const retained = f.host.querySelector('canvas');
  f.layer.update(f.input);
  expect(f.host.querySelector('canvas')).toBe(retained);
  const cleared = canvas.getContext('2d').getImageData(f.input.columns[1]!.start + 2, 2, 1, 1).data;
  expect(cleared[0]).toBe(255);
});

test('resizing a retained row replaces its bitmap without leaving an obsolete canvas', () => {
  const f = fixture();
  const first = f.host.querySelector('canvas')!;
  const row = f.input.rows[0]!;
  f.layer.update({ ...f.input, rows: [{ ...row, size: row.size * 2 }, f.input.rows[1]!] });
  const canvases = [...f.host.querySelectorAll('canvas')];
  expect(canvases).toHaveLength(2);
  expect(canvases).not.toContain(first);
  expect(canvases.some((canvas) => canvas.height === first.height * 2)).toBe(true);
});

test('zoom replaces row bitmaps at the new raster resolution', () => {
  const f = fixture();
  const first = f.host.querySelector('canvas')!;
  f.layer.update({ ...f.input, scale: 0.5 });
  const zoomed = f.host.querySelector('canvas')!;
  expect(zoomed).not.toBe(first);
  expect(zoomed.height).toBe(Math.ceil(first.height / 2));
});

test('moving to a higher-density display refreshes retained bitmap resolution', () => {
  const f = fixture();
  const first = f.host.querySelector('canvas')!;
  Object.defineProperty(f.host.ownerDocument.defaultView, 'devicePixelRatio', {
    value: 2,
    configurable: true,
  });
  f.layer.update(f.input);
  const refreshed = f.host.querySelector('canvas')!;
  expect(refreshed).not.toBe(first);
  expect(refreshed.height).toBe(first.height * 2);
});
