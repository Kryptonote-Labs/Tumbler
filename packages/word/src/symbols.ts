import type { LosslessXmlElement } from '@tumblerjs/ooxml';

export interface WordSymbol {
  readonly kind: 'symbol';
  readonly elementId: number;
  readonly fontFamily: string;
  readonly character: number;
  /** Unicode display text; the original font and code remain in the source element. */
  readonly value: string;
  readonly unicodeFallback: boolean;
}

// Wingdings wide-headed barb arrows, glyph IDs 1223–1230 in Unicode WG2 N4384, p. 43.
// https://www.unicode.org/wg2/docs/n4384.pdf
const wingdingsArrows = [0x1f868, 0x1f86a, 0x1f869, 0x1f86b, 0x1f86c, 0x1f86d, 0x1f86f, 0x1f86e];

/** Read the font-specific code without treating the private-use value as ordinary body text. */
export function readWordSymbol(element: LosslessXmlElement, namespace: string): WordSymbol | undefined {
  const attr = (name: string) => element.attributes.find(a => a.namespaceUri === namespace && a.localName === name)?.value;
  const fontFamily = attr('font');
  const hex = attr('char');
  if (!fontFamily?.trim() || !hex || !/^[0-9a-f]{4}$/i.test(hex)) return;
  const character = parseInt(hex, 16);
  if (character >= 0xd800 && character <= 0xdfff || character >= 0xfffe) return;
  const code = character >= 0xf000 && character <= 0xf0ff ? character - 0xf000 : character;
  const unicode = fontFamily.trim().toLowerCase() === 'wingdings' ? wingdingsArrows[code - 0xdf] : undefined;
  // Windows symbol fonts commonly expose their legacy character codes in the F000 range.
  const display = unicode ?? (character < 0x100 ? character + 0xf000 : character);
  return Object.freeze({ kind: 'symbol', elementId: element.id, fontFamily, character,
    value: String.fromCodePoint(display), unicodeFallback: unicode !== undefined });
}
