import { WORD_HIGHLIGHTS } from './text-properties.ts';
import { wordColourAttributes } from './theme-colour-xml.ts';
import type { WordTextFormat } from './create.ts';

export function xml(value: string) {
  if (!value.isWellFormed()) throw new TypeError('Text contains unpaired UTF-16 surrogates.');
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/.test(value)) throw new TypeError('Text contains characters not supported by XML.');
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

// Literal whitespace in XML attributes is normalized to spaces by readers.
export function xmlAttribute(value: string) {
  return xml(value).replaceAll('\t', '&#9;').replaceAll('\n', '&#10;').replaceAll('\r', '&#13;');
}

export function textContent(value: string) {
  if (/[\r\n]/.test(value)) throw new TypeError('Use separate paragraphs for line-feed text.');
  return value.split('\t').map(part => `<w:t xml:space="preserve">${xml(part)}</w:t>`).join('<w:tab/>');
}

export function runProperties(format: WordTextFormat) {
  const output: string[] = [];
  // CT_RPr order follows the WordprocessingML schema.
  if (format.fontFamily !== undefined) output.push(`<w:rFonts w:ascii="${xml(format.fontFamily)}" w:hAnsi="${xml(format.fontFamily)}" w:eastAsia="${xml(format.fontFamily)}" w:cs="${xml(format.fontFamily)}"/>`);
  if (format.bold !== undefined) output.push(`<w:b w:val="${format.bold ? 1 : 0}"/>`);
  if (format.italic !== undefined) output.push(`<w:i w:val="${format.italic ? 1 : 0}"/>`);
  if (format.strike !== undefined) output.push(`<w:strike w:val="${format.strike ? 1 : 0}"/>`);
  if (format.color !== undefined) {
    output.push(`<w:color ${wordColourAttributes(format.color)}/>`);
  }
  if (format.characterSpacingPoints !== undefined) {
    if (!Number.isFinite(format.characterSpacingPoints) || !Number.isInteger(format.characterSpacingPoints * 20) || format.characterSpacingPoints * 20 < -2147483648 || format.characterSpacingPoints * 20 > 2147483647) throw new RangeError('Character spacing must be an OOXML signed twip value.');
    output.push(`<w:spacing w:val="${format.characterSpacingPoints * 20}"/>`);
  }
  if (format.fontSizePoints !== undefined) {
    if (!Number.isFinite(format.fontSizePoints) || format.fontSizePoints < 1 || format.fontSizePoints > 1638) throw new RangeError('Font size must be between 1 and 1638 points.');
    output.push(`<w:sz w:val="${Math.round(format.fontSizePoints * 2)}"/>`);
  }
  if (format.highlight !== undefined) {
    if (!WORD_HIGHLIGHTS.includes(format.highlight)) throw new TypeError('Unsupported highlight color.');
    output.push(`<w:highlight w:val="${format.highlight}"/>`);
  }
  if (format.underline !== undefined) {
    if (!['none', 'single', 'double'].includes(format.underline)) throw new TypeError('Unsupported underline style.');
    output.push(`<w:u w:val="${format.underline}"/>`);
  }
  if (format.verticalAlign !== undefined) {
    if (!['baseline', 'superscript', 'subscript'].includes(format.verticalAlign)) throw new TypeError('Invalid vertical alignment.');
    output.push(`<w:vertAlign w:val="${format.verticalAlign}"/>`);
  }
  return output.join('');
}
