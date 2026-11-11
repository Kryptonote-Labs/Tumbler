import { DRAWING_PRESET_COLORS } from './preset-colors.ts';
import { encodeRgbaPng } from './png.ts';
import type { DrawingPictureFill } from './picture-fill.ts';
import { DRAWING_PATTERN_PRESETS, type DrawingPatternPreset } from './pattern-presets.ts';
import { DRAWING_PATTERN_TILES } from './pattern-tiles.ts';
export interface DrawingPattern { readonly preset: string; readonly foreground: string; readonly background: string }
interface PatternRect { readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly opacity: number }
interface PatternGeometry { readonly size: number; readonly strokeWidth: number; readonly path: string; readonly filled: boolean; readonly rects: readonly PatternRect[] }
const presets = new Set<string>(DRAWING_PATTERN_PRESETS);
export function isDrawingPatternPreset(value: string): value is DrawingPatternPreset { return presets.has(value); }
const geometryCache = new Map<string, PatternGeometry>();

/** Native Office patterns repeat every eight CSS pixels; coverage retains shaded diagonal edges. */
export function drawingPatternGeometry(preset: string): PatternGeometry {
  let result = geometryCache.get(preset);
  if (result) return result;
  const tile = DRAWING_PATTERN_TILES[isDrawingPatternPreset(preset) ? preset : 'pct5'];
  const unit = tile.size / tile.rows.length, rects: PatternRect[] = [];
  tile.rows.forEach((row, y) => {
    for (let x = 0; x < row.length / 2;) {
      const start = x, value = row.slice(x * 2, x * 2 + 2);
      while (++x < row.length / 2 && row.slice(x * 2, x * 2 + 2) === value) {}
      rects.push(Object.freeze({ x: start * unit, y: y * unit, width: (x - start) * unit, height: unit, opacity: parseInt(value, 16) / 255 }));
    }
  });
  result = Object.freeze({ size: tile.size, strokeWidth: 0, path: '', filled: false, rects: Object.freeze(rects) });
  geometryCache.set(preset, result); return result;
}
function rgba(color: string): readonly [number, number, number, number] | undefined {
  const named = DRAWING_PRESET_COLORS[color];
  if (named) color = '#' + named;
  if (color === 'transparent' || color === 'none') return [0, 0, 0, 0];
  if (/^#[a-f\d]{3,4}$/i.test(color)) color = '#' + [...color.slice(1)].map(value => value + value).join('');
  if (/^#[a-f\d]{6}(?:[a-f\d]{2})?$/i.test(color)) return [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16), color.length === 9 ? parseInt(color.slice(7), 16) / 255 : 1];
  const match = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/.exec(color);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3]), match[4] === undefined ? 1 : Number(match[4])] : undefined;
}
function mix(foreground: string, background: string, coverage: number): string {
  if (coverage === 0) return background;
  if (coverage === 1) return foreground;
  const a = rgba(foreground), b = rgba(background);
  if (!a || !b) return coverage >= .5 ? foreground : background;
  const alpha = a[3] * coverage + b[3] * (1 - coverage);
  if (!alpha) return 'transparent';
  const channels = [0, 1, 2].map(index => Math.round((a[index]! * a[3] * coverage + b[index]! * b[3] * (1 - coverage)) / alpha));
  return `rgba(${channels.join(',')},${Math.round(alpha * 100000) / 100000})`;
}
/** Colour the complete tile, including transparent background cells, without painting colours over each other. */
export function drawingPatternPaint(pattern: DrawingPattern) {
  const geometry = drawingPatternGeometry(pattern.preset), colors = new Map<number, string>();
  return { size: geometry.size, rects: geometry.rects.map(({ opacity, ...rect }) => {
    let fill = colors.get(opacity);
    if (fill === undefined) { fill = mix(pattern.foreground, pattern.background, opacity); colors.set(opacity, fill); }
    return { ...rect, fill };
  }) };
}
const pictures = new WeakMap<DrawingPattern, DrawingPictureFill>();
/** A complete tile is rasterized before scaling. Four samples per pattern pixel keep cubic image samplers from softening native pixel centres. */
export function drawingPatternPicture(pattern: DrawingPattern): DrawingPictureFill {
  let picture = pictures.get(pattern);
  if (picture) return picture;
  const paint = drawingPatternPaint(pattern), scale = 4, size = paint.size * scale, pixels = new Uint8Array(size * size * 4);
  for (const rect of paint.rects) {
    const color = rgba(rect.fill) ?? [0, 0, 0, 0];
    for (let y = rect.y * scale; y < (rect.y + rect.height) * scale; y++) for (let x = rect.x * scale; x < (rect.x + rect.width) * scale; x++) {
      const offset = (y * size + x) * 4;
      pixels.set([color[0], color[1], color[2], Math.round(color[3] * 255)], offset);
    }
  }
  picture = Object.freeze({ bytes: encodeRgbaPng(size, size, pixels), contentType: 'image/png', crop: [0, 0, 0, 0] as const });
  pictures.set(pattern, picture); return picture;
}
export interface DrawingCanvasPattern { setTransform(transform: { readonly a: number; readonly b: number; readonly c: number; readonly d: number; readonly e: number; readonly f: number }): void }
export interface DrawingPatternCanvasContext<Image> {
  fillStyle: unknown;
  createPattern?(image: Image, repetition: 'repeat'): DrawingCanvasPattern | null;
  filter?: string | undefined;
  save(): void; restore(): void; beginPath(): void; rect(x: number, y: number, width: number, height: number): void; fill(): void;
}
/** Repeat one decoded native tile in a single paint, including at fractional scales. */
export function paintDrawingPattern<Image>(context: DrawingPatternCanvasContext<Image>, image: Image, width: number, height: number, origin = { x: 0, y: 0 }, light = 1): boolean {
  if (!context.createPattern || ![width, height, origin.x, origin.y].every(Number.isFinite) || width <= 0 || height <= 0) return false;
  const pattern = context.createPattern(image, 'repeat');
  if (!pattern) return false;
  pattern.setTransform({ a: .25, b: 0, c: 0, d: .25, e: -((origin.x % 8 + 8) % 8), f: -((origin.y % 8 + 8) % 8) });
  context.save();
  try { if (context.filter !== undefined && light !== 1) context.filter = `brightness(${light})`; context.fillStyle = pattern; context.beginPath(); context.rect(0, 0, width, height); context.fill(); }
  finally { context.restore(); }
  return true;
}
