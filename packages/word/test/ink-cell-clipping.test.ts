import { beginPackageTransaction } from '@tumblerjs/opc';
import { expect, test } from 'bun:test';
import { openWordArtifact, paintWordPage, layoutWordDocument, wordPageInkBounds, type WordLayoutPage } from '../src/index.ts';
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

test('wrapped floating ink outside its anchor cell keeps page bounds for pixel IO and the DOM overlay', () => {
  const source = ink();
  const drawing = [...source.document.drawings.values()][0]!;
  const anchored = source.updateDrawing({ elementId: drawing.elementId, widthPoints: 40, heightPoints: 40, layout: 'front', xPoints: 100, yPoints: 100 });
  const edit = beginPackageTransaction(anchored.document.package);
  edit.replacePart(anchored.document.part.name, new TextEncoder().encode(anchored.document.source.source.replace('<wp:anchor ', '<wp:anchor layoutInCell="0" ').replace('<wp:wrapNone/>', '<wp:wrapSquare wrapText="bothSides"/>')));
  const page = layoutWordDocument(openWordArtifact(edit.commit()).document, measure).pages[0]!;
  const column = page.columns[0]!;
  const cell = { x: 0, y: 0, width: 10, height: 10 };
  const inTable: WordLayoutPage = { ...page, columns: [{ ...column, lines: [], tables: [{ tableElementId: 1, ...cell, cells: [{ cellElementId: 2, continuationElementIds: [], row: 0, column: 0, columnSpan: 1, rowSpan: 1, ...cell, lines: column.lines, tables: [] }] }] }] };
  expect(wordPageInkBounds(inTable)).toEqual(wordPageInkBounds(page));
  expect(wordPageInkBounds(inTable)[0]!.width).toBeGreaterThan(0);
  const reads: number[][] = [], writes: number[][] = [];
  const context = {
    save() {}, restore() {}, scale() {}, beginPath() {}, rect() {}, clip() {}, fillRect() {}, fillText() {},
    direction: 'inherit' as const, globalAlpha: 1, translate() {}, rotate() {}, arc() {}, fill() {}, measureText: () => ({ width: 0 }),
    font: '', fillStyle: '' as string | CanvasGradient | CanvasPattern, strokeStyle: '' as string | CanvasGradient | CanvasPattern,
    lineWidth: 1, textAlign: 'left' as const, textBaseline: 'alphabetic' as const, fontKerning: 'none' as const,
    moveTo() {}, lineTo() {}, stroke() {}, setLineDash() {}, drawImage() {},
    getImageData(x: number, y: number, width: number, height: number) {
      reads.push([x, y, width, height]);
      return { width, height, data: new Uint8ClampedArray(width * height * 4).fill(255) };
    },
    putImageData(pixels: { width: number; height: number; data: Uint8ClampedArray }, x: number, y: number) {
      writes.push([x, y, pixels.width, pixels.height]);
    },
  };
  paintWordPage(context, inTable, { scale: 1 });
  expect(reads).toHaveLength(1);
  expect(writes).toEqual(reads);
  expect(reads[0]![0]).toBeGreaterThan(cell.width);
  expect(reads[0]![2]).toBeGreaterThan(0);
});
