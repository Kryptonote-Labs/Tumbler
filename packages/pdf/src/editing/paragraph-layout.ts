import type { PdfLayoutGlyph, PdfLayoutCaret } from './layout.ts';
import type { PdfTextStyle } from './fonts.ts';

/** Align the shared glyph and caret coordinates, justifying only soft-wrapped lines. */
export function alignPdfLines(glyphs: PdfLayoutGlyph[], carets: PdfLayoutCaret[], x: number, width: number, alignment: NonNullable<PdfTextStyle['alignment']>) {
  if (alignment === 'left') return;
  const lines = new Map<number, PdfLayoutGlyph[]>();
  for (const glyph of glyphs) {
    let line = lines.get(glyph.y);
    if (!line) lines.set(glyph.y, line = []);
    line.push(glyph);
  }
  const last = [...lines.keys()].at(-1);
  for (const [y, line] of lines) {
    const visible = line.filter(g => !/\s/u.test(g.text));
    const edge = visible.at(-1);
    if (!edge) continue;
    const extra = Math.max(0, x + width - edge.x - edge.width);
    const gaps = line.filter(g => g.text === ' ' && g.start < edge.start);
    const justify = alignment === 'justify' && y !== last && line.at(-1)?.text !== '\n' && gaps.length > 0;
    const shift = (offset: number) => justify
      ? gaps.filter(g => g.start < offset).length * extra / gaps.length
      : alignment === 'center' ? extra / 2 : alignment === 'right' ? extra : 0;
    for (const caret of carets.filter(c => c.y === y)) caret.x += shift(caret.offset);
    for (const glyph of line) {
      glyph.x += shift(glyph.start);
      if (justify && gaps.includes(glyph)) glyph.width += extra / gaps.length;
    }
  }
}
