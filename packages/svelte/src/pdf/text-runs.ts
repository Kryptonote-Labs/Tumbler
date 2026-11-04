import type { PdfTextContent, PdfTextItem } from '@tumblerjs/pdf';
type Run = {
  id: string;
  transform: string;
  size: number;
  font: PdfTextItem['font'];
  items: { item: PdfTextItem; x: number; y: number; size: number }[];
};
/** Share one SVG transform across a text run, retaining each glyph's affine baseline and advance.
 * Per-glyph CSS transforms create thousands of paint chunks even though the text is invisible. */
export function pdfTextRuns(content: PdfTextContent): Run[] {
  const runs: Run[] = [];
  let previous: readonly number[] | undefined;
  let previousFont: PdfTextItem['font'] | undefined;
  let previousSize = 0;
  for (const item of content.items) {
    const [ma, mb, mc, md, e, f] = item.transform,
      size = Math.hypot(mc, md) || Math.hypot(ma, mb) || 1;
    const a = ma / size,
      b = mb / size,
      c = mc / size,
      d = md / size,
      determinant = a * d - b * c;
    const singular = Math.abs(determinant) < 1e-12;
    if (
      singular ||
      !previous ||
      size !== previousSize ||
      item.font.family !== previousFont?.family ||
      item.font.weight !== previousFont?.weight ||
      item.font.style !== previousFont?.style ||
      [a, b, c, d].some((value, index) => value !== previous![index])
    ) {
      runs.push({
        id: item.id,
        size,
        font: item.font,
        transform: `matrix(${a} ${b} ${c} ${d} ${singular ? e : 0} ${singular ? f : 0})`,
        items: [],
      });
    }
    runs
      .at(-1)!
      .items.push({
        item,
        size,
        x: singular ? 0 : (d * e - c * f) / determinant,
        y: singular ? 0 : (a * f - b * e) / determinant,
      });
    previous = singular ? undefined : [a, b, c, d];
    previousFont = item.font;
    previousSize = size;
  }
  return runs;
}
