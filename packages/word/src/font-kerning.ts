import type { ComputedWordTextFormat } from './styles.ts';

/** ECMA-376 §17.3.2.19: kern is a minimum font size, with zero disabling it. */
export function wordFontKerning(format: Pick<ComputedWordTextFormat, 'fontSizePoints' | 'kerningPoints'>): 'normal' | 'none' {
  return format.kerningPoints !== undefined && format.kerningPoints > 0 && format.fontSizePoints >= format.kerningPoints ? 'normal' : 'none';
}
