import { DRAWING_PRESET_COLORS } from './preset-colors.ts';

/** Parse resolved DrawingML colours for procedural paint brushes. */
export function drawingColorRgba(color: string): readonly [number, number, number, number] | undefined {
  const named = DRAWING_PRESET_COLORS[color];
  if (named) color = '#' + named;
  if (color === 'transparent' || color === 'none') return [0, 0, 0, 0];
  if (/^#[a-f\d]{3,4}$/i.test(color)) color = '#' + [...color.slice(1)].map(value => value + value).join('');
  if (/^#[a-f\d]{6}(?:[a-f\d]{2})?$/i.test(color)) return [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16), color.length === 9 ? parseInt(color.slice(7), 16) / 255 : 1];
  const match = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/.exec(color);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3]), match[4] === undefined ? 1 : Number(match[4])] : undefined;
}
