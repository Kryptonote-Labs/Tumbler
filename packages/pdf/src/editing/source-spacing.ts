import type { PdfTextSeed } from './import-text.ts';
import type { PdfTextStyle } from './fonts.ts';

export const pdfSourceAttribute = 'pdf-source';
export function pdfStyleAttributes(attributes: Record<string, unknown> = {}) {
  const result = { ...attributes };
  delete result[pdfSourceAttribute];
  return result;
}
const sameFace = (a: PdfTextStyle, b: PdfTextStyle) =>
  a.font === b.font && a.family === b.family && a.bold === b.bold && a.italic === b.italic;
/** Source markers survive collaborative undo, while newly inserted text receives no source identity. */
export function pdfSourceSpacing(
  seed: PdfTextSeed,
  text: string[],
  originals: (number | undefined)[],
  styles: PdfTextStyle[],
  widths: number[],
) {
  const result = text.map(() => 0),
    gaps = new Map(seed.spacing?.map((gap) => [gap.left + ':' + gap.right, gap]));
  for (let i = 1; i < text.length; i++) {
    const left = originals[i - 1],
      right = originals[i];
    if (left === undefined || right === undefined) continue;
    const gap = gaps.get(left + ':' + right),
      before = seed.delta[left],
      after = seed.delta[right];
    if (!gap || !before || !after || text[i - 1] !== before.insert || text[i] !== after.insert)
      continue;
    const a = styles[i - 1]!,
      b = styles[i]!,
      ratio = a.size / before.attributes.size;
    if (
      sameFace(a, before.attributes) &&
      sameFace(b, after.attributes) &&
      Math.abs(ratio - b.size / after.attributes.size) < 1e-9
    )
      result[i] =
        gap.advance === undefined ? gap.gap * ratio : gap.advance * ratio - widths[i - 1]!;
  }
  return result;
}
