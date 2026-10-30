import type { WordVerticalAlign } from './styles.ts';

/** Shared by layout and editing carets; shifts are relative to the unscaled run's baseline, in points. */
export function wordVerticalTextMetrics(fontSizePoints: number, alignment: WordVerticalAlign) {
  const shifted = alignment === 'superscript' || alignment === 'subscript';
  return {
    fontSizePoints: shifted ? fontSizePoints * 0.65 : fontSizePoints,
    baselineShift: alignment === 'superscript' ? -fontSizePoints * 0.3
      : alignment === 'subscript' ? fontSizePoints * 0.15 : 0,
  };
}
