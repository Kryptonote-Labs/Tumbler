import type { PdfTextModel } from './model.ts';
import { type PdfTextStyle, type PdfEditingFonts } from './fonts.ts';
export type PdfLayoutGlyph = { text: string; start: number; end: number; x: number; y: number; width: number; style: PdfTextStyle };
export type PdfLayoutCaret = { offset: number; x: number; y: number; height: number };
export type PdfTextLayout = { id: string; glyphs: PdfLayoutGlyph[]; carets: PdfLayoutCaret[]; height: number };
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
/** Layout uses full font metrics in page viewport points and UTF-16 offsets shared with Y.Text. */
export function layoutPdfText(model: PdfTextModel, id: string, fonts: PdfEditingFonts): PdfTextLayout {
  const seed = model.seed(id), glyphs: PdfLayoutGlyph[] = [], carets: PdfLayoutCaret[] = [];
  let x = seed.x, y = seed.y, offset = 0;
  const text = model.text(id).toString();
  for (const { segment, index } of segmenter.segment(text)) {
    const style = model.styleAt(id, index + 1), width = segment === '\n' ? 0 : fonts.measure(segment, style);
    if (x > seed.x && x + width > seed.x + seed.width) { x = seed.x; y += Math.max(seed.lineHeight, style.size * 1.25); }
    carets.push({ offset: index, x, y, height: style.size });
    glyphs.push({ text: segment, start: index, end: index + segment.length, x, y, width, style });
    if (segment === '\n') { x = seed.x; y += Math.max(seed.lineHeight, style.size * 1.25); } else x += width;
    offset = index + segment.length;
  }
  carets.push({ offset, x, y, height: model.styleAt(id, offset).size });
  return { id, glyphs, carets, height: y - seed.y + seed.style.size * 1.25 };
}
export function hitPdfText(layout: PdfTextLayout, x: number, y: number) {
  return layout.carets.reduce((best, caret) => {
    const distance = (c: PdfLayoutCaret) => Math.abs(c.y - y) * 1000 + Math.abs(c.x - x);
    return distance(caret) < distance(best) ? caret : best;
  });
}
