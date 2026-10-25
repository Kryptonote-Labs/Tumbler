import type { ComputedWordTextFormat } from './styles.ts';

/** Validate and encode the minimum kerning size as OOXML unsigned half-points. */
export function wordKerningHalfPoints(points: number): number {
  const value = points * 2;
  if (!Number.isInteger(value) || value < 0 || value > 4_294_967_295) throw new RangeError('Kerning size must be an OOXML unsigned half-point value.');
  return value;
}

/** ECMA-376 §17.3.2.19: kern is a minimum font size, with zero disabling it. */
export function wordFontKerning(format: Pick<ComputedWordTextFormat, 'fontSizePoints' | 'kerningPoints'>): 'normal' | 'none' {
  return format.kerningPoints !== undefined && format.kerningPoints > 0 && format.fontSizePoints >= format.kerningPoints ? 'normal' : 'none';
}
