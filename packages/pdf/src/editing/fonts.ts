import '../buffer-runtime.ts';
import { Buffer } from 'buffer';
import { create, type Font, type Glyph } from 'fontkit';
import { PdfInterpreter } from '../interpreter.ts';
import type { PdfDocument } from '../document.ts';
import type { PdfFont } from '../fonts.ts';
import { pdfTextContent, type PdfTextItem } from '../text-content.ts';
export type PdfTextStyle = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  size: number;
  family: 'Sans' | 'Serif' | 'Mono';
  color: string;
  font?: string;
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
export type PdfEditingFont = {
  key: string;
  name: string;
  bytes: Uint8Array;
  font: Font;
  family: string;
  bold: boolean;
  italic: boolean;
  source: PdfFont | undefined;
  kerning?: Map<string, number>;
  sourceGlyphs?: Map<string, { id: number; width: number; code: number; length: number }>;
};
export type PdfEditingShape = {
  face: PdfEditingFont;
  glyphs: Glyph[];
  positions: { xAdvance: number; yAdvance: number; xOffset: number; yOffset: number }[];
  bold: boolean;
  italic: boolean;
};
const familyKey = (family: string) =>
  family
    .replace(/^[A-Z]{6}\+/, '')
    .replace(/[- ]?(regular|bolditalic|bold|italic|oblique|roman|mt)$/i, '')
    .replace(/\s/g, '')
    .toLowerCase();
/** Source programs and source code-to-glyph mappings remain authoritative for existing text.
 * Full matching faces extend subset fonts for new characters. Fallback affects only missing glyphs. */
export class PdfEditingFonts {
  private fonts = new Map<string, PdfEditingFont>();
  private documents = new WeakSet<PdfDocument>();
  add(key: string, bytes: Uint8Array, source?: PdfFont) {
    const font = create(Buffer.from(bytes));
    if ('fonts' in font) throw new Error('Supply a single editing font.');
    this.fonts.set(key, {
      key,
      name: font.postscriptName ?? source?.baseName ?? key,
      bytes,
      font,
      source,
      family: familyKey(font.familyName ?? source?.baseName ?? key),
      bold: /bold/i.test(font.subfamilyName ?? source?.baseName ?? key),
      italic: /italic|oblique/i.test(font.subfamilyName ?? source?.baseName ?? key),
    });
  }
  importDocument(document: PdfDocument) {
    if (this.documents.has(document)) return;
    const interpreter = new PdfInterpreter(document);
    for (const page of document.pages) {
      for (const element of interpreter.page(page.index).elements) {
        if (element.kind !== 'glyph' || !element.font.program || !element.font.sourceId) continue;
        const source = element.font,
          key = source.sourceId!;
        if (!this.fonts.has(key)) {
          this.add(key, source.program!, source);
          this.fonts.get(key)!.sourceGlyphs = new Map();
          this.fonts.get(key)!.kerning = new Map();
        }
        const face = this.fonts.get(key)!;
        if (element.glyph.unicode && !face.sourceGlyphs!.has(element.glyph.unicode))
          face.sourceGlyphs!.set(element.glyph.unicode, {
            id: element.glyph.glyphId,
            code: element.glyph.code,
            length: element.glyph.codeLength,
            width: (element.glyph.width * face.font.unitsPerEm) / 1000,
          });
      }
      let previous: PdfTextItem | undefined;
      for (const item of pdfTextContent(interpreter.page(page.index)).items) {
        if (item.kind !== 'glyph') {
          previous = undefined;
          continue;
        }
        if (previous?.font.source && previous.font.source === item.font.source) {
          const face = this.fonts.get(item.font.source)!;
          const [a, b, , , x, y] = previous.transform,
            em = Math.hypot(a, b);
          const dx = item.transform[4] - x,
            dy = item.transform[5] - y;
          if (em && Math.abs(-b * dx + a * dy) / em < 0.01) {
            const advance = (a * dx + b * dy) / em;
            face.kerning!.set(
              JSON.stringify([previous.text, item.text]),
              (advance / em - previous.width) * face.font.unitsPerEm,
            );
          }
        }
        previous = item;
      }
      interpreter.releasePage(page.index);
    }
    this.documents.add(document);
  }
  fork(document: PdfDocument) {
    const result = new PdfEditingFonts();
    result.fonts = new Map(this.fonts);
    result.importDocument(document);
    return result;
  }
  get sourceFamilies() {
    return new Set(
      [...this.fonts.values()].filter((face) => face.sourceGlyphs).map((face) => face.family),
    );
  }
  get(style: PdfTextStyle, text?: string): PdfEditingFont {
    const source = style.font ? this.fonts.get(style.font) : undefined;
    if (source) {
      const matches = source.bold === style.bold && source.italic === style.italic;
      if (matches && (!text || source.sourceGlyphs?.has(text))) return source;
      const full = [...this.fonts.values()].find(
        (face) =>
          !face.sourceGlyphs &&
          face.family === source.family &&
          face.bold === style.bold &&
          face.italic === style.italic &&
          (!text || [...text].every((c) => face.font.hasGlyphForCodePoint(c.codePointAt(0)!))),
      );
      if (full) return full;
      if (!text || source.sourceGlyphs?.has(text)) return source;
    }
    const fallback = this.fonts.get(pdfFontKey(style));
    if (!fallback) throw new Error(`Missing PDF editing font ${pdfFontKey(style)}.`);
    return fallback;
  }
  shape(text: string, style: PdfTextStyle): PdfEditingShape {
    const face = this.get(style, text),
      original = face.sourceGlyphs?.get(text);
    const run = original
      ? {
          glyphs: [face.font.getGlyph(original.id)],
          positions: [{ xAdvance: original.width, yAdvance: 0, xOffset: 0, yOffset: 0 }],
        }
      : face.font.layout(text);
    return {
      face,
      glyphs: run.glyphs,
      positions: run.positions,
      bold: style.bold && !face.bold,
      italic: style.italic && !face.italic,
    };
  }
  kerning(left: string, right: string, leftStyle: PdfTextStyle, rightStyle: PdfTextStyle) {
    const a = this.get(leftStyle, left),
      b = this.get(rightStyle, right);
    if (
      a.key !== b.key ||
      leftStyle.size !== rightStyle.size ||
      leftStyle.bold !== rightStyle.bold ||
      leftStyle.italic !== rightStyle.italic
    )
      return 0;
    return (
      ((a.kerning?.get(JSON.stringify([left, right])) ?? 0) * rightStyle.size) / a.font.unitsPerEm
    );
  }
  measure(text: string, style: PdfTextStyle) {
    const shaped = this.shape(text, style);
    return (
      (shaped.positions.reduce((sum, p) => sum + p.xAdvance, 0) * style.size) /
      shaped.face.font.unitsPerEm
    );
  }
}
