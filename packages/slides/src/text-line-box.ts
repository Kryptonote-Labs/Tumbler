import type { SlideParagraph } from './model.ts';

export interface SlideFontMetrics {
  readonly fontBoundingBoxAscent?: number;
  readonly fontBoundingBoxDescent?: number;
}

export function slideParagraphFontSize(paragraph: SlideParagraph) {
  return paragraph.fontSize ??
    Math.max(paragraph.endRun?.fontSize ?? 1, ...paragraph.runs.map((run) => run.fontSize));
}

/** Line spacing multiplies the face's line box or sets an exact pixel height. Leading is split around the baseline. */
export function slideLineBox(metrics: SlideFontMetrics, size: number, spacing: SlideParagraph['lineHeight']) {
  const ascent = metrics.fontBoundingBoxAscent ?? size * 0.8;
  const descent = metrics.fontBoundingBoxDescent ?? size * 0.2;
  const normal = ascent + descent;
  const height = typeof spacing === 'number' ? normal * spacing : parseFloat(spacing);
  const leading = ((Number.isFinite(height) ? height : normal) - normal) / 2;
  return { ascent: ascent + leading, descent: descent + leading };
}
