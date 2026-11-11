import { expect, test } from 'bun:test';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { DRAWING_PATTERN_PRESETS, drawingPatternGeometry, drawingPatternPaint, drawingPatternPicture, paintDrawingPattern } from '../src/index.ts';

const decode = (pattern: import('../src/pattern-fill.ts').DrawingPattern) => loadImage(Buffer.from(drawingPatternPicture(pattern).bytes));
const colors = { foreground: '#000000', background: '#ffffff' };
test('native horizontal and percentage masks keep their actual repeat and pixel arrangement', async () => {
  const canvas = createCanvas(16, 16), context = canvas.getContext('2d');
  paintDrawingPattern(context, await decode({ preset: 'horz', ...colors }), 16, 16);
  const red = (x: number, y: number) => context.getImageData(x, y, 1, 1).data[0];
  expect([red(3, 0), red(3, 1), red(3, 7), red(3, 8)]).toEqual([0, 255, 255, 0]);
  context.clearRect(0, 0, 16, 16);
  paintDrawingPattern(context, await decode({ preset: 'pct5', ...colors }), 16, 16);
  expect([red(0, 0), red(4, 4), red(4, 0), red(0, 4)]).toEqual([0, 0, 255, 255]);
});
test('diagonals retain native coverage instead of replacing their grey edges with black pixels', () => {
  const paint = drawingPatternPaint({ preset: 'dnDiag', ...colors });
  expect(paint.rects.find(rect => rect.x === 0 && rect.y === 0)?.fill).toBe('rgba(21,21,21,1)');
  expect(paint.rects.find(rect => rect.x === 1 && rect.y === 0)?.fill).toBe('rgba(191,191,191,1)');
});
test('transparent pattern cells expose the destination rather than an underlying background fill', async () => {
  const canvas = createCanvas(8, 8), context = canvas.getContext('2d');
  paintDrawingPattern(context, await decode({ preset: 'pct50', foreground: 'rgba(255,0,0,0.5)', background: 'transparent' }), 8, 8);
  const pixel = [...context.getImageData(0, 0, 1, 1).data];
  expect(pixel.slice(0, 3)).toEqual([255, 0, 0]);
  expect(pixel[3]).toBeGreaterThanOrEqual(127);
  expect(pixel[3]).toBeLessThanOrEqual(128);
  expect([...context.getImageData(1, 0, 1, 1).data]).toEqual([0, 0, 0, 0]);
});
test.each([...DRAWING_PATTERN_PRESETS])('%s retains one brush phase when a clipped frame is painted separately', async preset => {
  const full = createCanvas(32, 32), crop = createCanvas(16, 16);
  const pattern = await decode({ preset, ...colors });
  paintDrawingPattern(full.getContext('2d'), pattern, 32, 32);
  paintDrawingPattern(crop.getContext('2d'), pattern, 16, 16, { x: 3, y: 5 });
  expect(crop.getContext('2d').getImageData(0, 0, 16, 16).data).toEqual(full.getContext('2d').getImageData(3, 5, 16, 16).data);
  expect(drawingPatternGeometry(preset).size).toBe(8);
});
test('a large authored pattern extent uses one repeating paint without a tile-count limit', async () => {
  const context = createCanvas(8, 8).getContext('2d');
  expect(paintDrawingPattern(context, await decode({ preset: 'horz', ...colors }), 1e12, 1e12)).toBe(true);
  expect([...context.getImageData(1, 1, 1, 1).data]).toEqual([255, 255, 255, 255]);
});
test.each([1.1, 1.5, 2.3])('opaque tiles remain opaque at fractional scale %s', async scale => {
  for (const preset of ['pct50', 'horz', 'dnDiag']) {
    const canvas = createCanvas(32, 32), context = canvas.getContext('2d'); context.scale(scale, scale);
    paintDrawingPattern(context, await decode({ preset, ...colors }), 32, 32);
    const pixels = context.getImageData(1, 1, 30, 30).data;
    expect(pixels.every((value, index) => index % 4 !== 3 || value === 255)).toBe(true);
  }
});
