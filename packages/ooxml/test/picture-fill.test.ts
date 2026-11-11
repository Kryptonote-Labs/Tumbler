import { expect, test } from 'bun:test';
import { createCanvas } from '@napi-rs/canvas';
import { drawingPictureGeometry, paintDrawingPicture, type DrawingPictureFill } from '../src/index.ts';

const source = createCanvas(2, 2), paint = source.getContext('2d');
for (const [index, color] of ['#ff0000', '#00ff00', '#0000ff', '#ffff00'].entries()) { paint.fillStyle = color; paint.fillRect(index % 2, Math.floor(index / 2), 1, 1); }
const picture: DrawingPictureFill = { bytes: new Uint8Array(), contentType: 'image/png', crop: [0, 0, 0, 0] };
const decoded = { image: source, width: 2, height: 2 };

test('source cropping stays inside the inset destination rectangle', () => {
  const canvas = createCanvas(40, 40), context = canvas.getContext('2d'); context.imageSmoothingEnabled = false;
  paintDrawingPicture(context, { ...picture, crop: [.5, 0, 0, 0], stretch: [.25, .25, .25, .25] }, 40, 40, decoded);
  const pixel = (x: number, y: number) => [...context.getImageData(x, y, 1, 1).data];
  expect(pixel(5, 20)).toEqual([0, 0, 0, 0]);
  expect(pixel(15, 15)).toEqual([0, 255, 0, 255]);
  expect(pixel(15, 25)).toEqual([255, 255, 0, 255]);
  expect(pixel(35, 20)).toEqual([0, 0, 0, 0]);
});

test('mirrored tiles alternate in both directions and preserve opacity', () => {
  const canvas = createCanvas(24, 24), context = canvas.getContext('2d'); context.imageSmoothingEnabled = false;
  paintDrawingPicture(context, { ...picture, opacity: .5, tile: { x: 0, y: 0, scaleX: 4, scaleY: 4, align: 'tl', flip: 'xy' } }, 24, 24, decoded);
  const pixel = (x: number, y: number) => [...context.getImageData(x, y, 1, 1).data];
  expect(pixel(1, 1)).toEqual([255, 0, 0, 128]);
  expect(pixel(9, 1)).toEqual([0, 255, 0, 128]);
  expect(pixel(1, 9)).toEqual([0, 0, 255, 128]);
  expect(pixel(9, 9)).toEqual([255, 255, 0, 128]);
});

test('tile scale retains the native frame after source cropping and ignores DPI as Office does', () => {
  const geometry = drawingPictureGeometry({ ...picture, crop: [.25, 0, .25, 0], dpi: 192, tile: { x: 0, y: 0, scaleX: 2, scaleY: 3, align: 'br', flip: 'none' } }, 100, 80, { width: 40, height: 20 });
  expect(geometry).toMatchObject({ width: 80, height: 60, x: 20, y: 20 });
});

test('large tile offsets keep a finite repeating phase', () => {
  const canvas = createCanvas(16, 16), context = canvas.getContext('2d'); context.imageSmoothingEnabled = false;
  paintDrawingPicture(context, { ...picture, tile: { x: 1e15, y: -1e15, scaleX: 4, scaleY: 4, align: 'tl', flip: 'xy' } }, 16, 16, decoded);
  expect(context.getImageData(1, 1, 1, 1).data[3]).toBe(255);
});
