import '../buffer-runtime.ts';
import { Buffer } from 'buffer';
import { create, type Font } from 'fontkit';

export type PdfTextStyle = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  size: number;
  family: 'Sans' | 'Serif' | 'Mono';
  color: string;
};
export const defaultPdfTextStyle: PdfTextStyle = {
  bold: false,
  italic: false,
  underline: false,
  size: 12,
  family: 'Sans',
  color: '#000000',
};
export const pdfFontKey = (style: Pick<PdfTextStyle, 'family' | 'bold' | 'italic'>) =>
  `${style.family}-${style.bold ? 'Bold' : ''}${style.italic ? 'Italic' : ''}${!style.bold && !style.italic ? 'Regular' : ''}`;
export type PdfEditingFont = { key: string; bytes: Uint8Array; font: Font };
/** The same full fonts supply browser geometry and exported glyphs. Hosts own font acquisition. */
export class PdfEditingFonts {
  private fonts = new Map<string, PdfEditingFont>();
  add(key: string, bytes: Uint8Array) {
    const font = create(Buffer.from(bytes));
    if ('fonts' in font) throw new Error('Supply a single editing font.');
    this.fonts.set(key, { key, bytes, font });
  }
  get(style: PdfTextStyle) {
    const value = this.fonts.get(pdfFontKey(style));
    if (!value) throw new Error(`Missing PDF editing font ${pdfFontKey(style)}.`);
    return value;
  }
  measure(text: string, style: PdfTextStyle) {
    const { font } = this.get(style);
    return (
      (font.layout(text).positions.reduce((sum, p) => sum + p.xAdvance, 0) * style.size) /
      font.unitsPerEm
    );
  }
}
