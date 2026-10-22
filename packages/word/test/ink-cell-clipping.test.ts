import { expect, test } from 'bun:test';
import { layoutWordDocument, wordPageInkBounds, type WordLayoutPage } from '../src/index.ts';
import { paintWordInk } from '../src/ink-canvas.ts';
import { inkFixture } from './ink-fixture.ts';
import { officeInk } from '../../ink/test/fixture.ts';

const ink = () => inkFixture(false, false, officeInk({ brush: '<brushProperty name="width" value="0.1" units="cm"/><brushProperty name="height" value="0.1" units="cm"/><brushProperty name="rasterOp" value="xOrPen"/><brushProperty name="color" value="#ffffff"/>' })).source;
const measure = { measure: (text: string) => ({ width: text.length * 5, ascent: 8, descent: 2 }) };

test('native ink intersects page-point cell clips with device-pixel viewport before localizing writes', () => {
  const page = layoutWordDocument(ink().document, measure).pages[0]!;
  const fragment = page.columns[0]!.lines.flatMap(line => line.fragments).find(fragment => fragment.drawing)!;
  const scale = 2;
  const cellClip = { x: fragment.x + 10, y: fragment.y + 10, width: 20, height: 30 };
  const viewport = { x: Math.ceil(cellClip.x * scale) + 5, y: Math.ceil(cellClip.y * scale) - 5, width: 50, height: 40 };
  const reads: number[][] = [], writes: number[][] = [];
  const context = {
    getImageData(x: number, y: number, width: number, height: number) {
      reads.push([x, y, width, height]);
      return { width, height, data: new Uint8ClampedArray(width * height * 4).fill(255) };
    },
    putImageData(pixels: { width: number; height: number; data: Uint8ClampedArray }, x: number, y: number) {
      writes.push([x, y, pixels.width, pixels.height]);
    },
  };
  expect(paintWordInk(context, fragment, scale, Infinity, viewport, cellClip)).toBe(true);
  const width = Math.floor((cellClip.x + cellClip.width) * scale) - viewport.x;
  expect(reads).toEqual([[0, 5, width, 35]]);
  expect(writes).toEqual(reads);
  reads.length = 0; writes.length = 0;
  expect(paintWordInk(context, fragment, scale, Infinity, viewport, { ...cellClip, x: cellClip.x + 1000 })).toBe(true);
  expect(reads).toEqual([]);
  expect(writes).toEqual([]);
});

test('DOM ink overlay bounds intersect the inherited cell clip', () => {
  const page = layoutWordDocument(ink().document, measure).pages[0]!;
  const column = page.columns[0]!;
  const fragment = column.lines.flatMap(line => line.fragments).find(fragment => fragment.drawing)!;
  const clip = { x: fragment.x + 5, y: fragment.y + 5, width: 20, height: 10 };
  const clipped: WordLayoutPage = { ...page, columns: [{ ...column, lines: [], tables: [{ tableElementId: 1, ...clip, cells: [{ cellElementId: 2, continuationElementIds: [], row: 0, column: 0, columnSpan: 1, rowSpan: 1, ...clip, lines: column.lines, tables: [] }] }] }] };
  const boxes = wordPageInkBounds(clipped);
  expect(boxes).toHaveLength(1);
  expect(boxes[0]!.x).toBeCloseTo(clip.x);
  expect(boxes[0]!.y).toBeCloseTo(clip.y);
  expect(boxes[0]!.width).toBeCloseTo(clip.width);
  expect(boxes[0]!.height).toBeCloseTo(clip.height);
});
