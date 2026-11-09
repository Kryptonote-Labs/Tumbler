import '../buffer-runtime.ts';
import { Buffer } from 'buffer';
import { create, type Font, type Glyph } from 'fontkit';
import { PdfInterpreter } from '../interpreter.ts';
import type { PdfDocument } from '../document.ts';
import type { PdfFont } from '../fonts.ts';
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
/** Resolve a family change without carrying an incompatible named source font into new text. */
export function pdfTextStylePatch(style: PdfTextStyle, patch: Partial<PdfTextStyle>) {
  if (patch.family === undefined || patch.font !== undefined) return patch;
  return { ...patch, font: pdfFontKey({ ...style, ...patch }) };
}
export type PdfEditingFont = {
  key: string;
  name: string;
  bytes: Uint8Array;
  font: Font;
  family: string;
  bold: boolean;
  italic: boolean;
  source: PdfFont | undefined;
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
    // Subset/CFF programs may omit name tables or expose non-string localized names.
    const name = typeof font.postscriptName === 'string' ? font.postscriptName : source?.baseName ?? key;
    const family = typeof font.familyName === 'string' ? font.familyName : source?.baseName ?? key;
    const subfamily = typeof font.subfamilyName === 'string' ? font.subfamilyName : source?.baseName ?? key;
    this.fonts.set(key, {
      key,
      name,
      bytes,
      font,
      source,
      family: familyKey(family),
      bold: /bold/i.test(subfamily),
      italic: /italic|oblique/i.test(subfamily),
    });
  }
  private *importPages(document: PdfDocument) {
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
      interpreter.releasePage(page.index);
      yield;
    }
    this.documents.add(document);
  }
  importDocument(document: PdfDocument) {
    const pages = this.importPages(document);
    while (!pages.next().done) { /* Consume synchronously for headless callers. */ }
  }
  /** Prepare source fonts a page at a time, allowing the host to paint or cancel between pages. */
  async forkAsync(document: PdfDocument, yieldControl: () => Promise<void>) {
    const result = new PdfEditingFonts();
    result.fonts = new Map(this.fonts);
    await yieldControl();
    for (const _ of result.importPages(document)) await yieldControl();
    return result;
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
  measure(text: string, style: PdfTextStyle) {
    const shaped = this.shape(text, style);
    return (
      (shaped.positions.reduce((sum, p) => sum + p.xAdvance, 0) * style.size) /
      shaped.face.font.unitsPerEm
    );
  }
}
