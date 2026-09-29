import type { WordTextFormat } from './create.ts';

export function xml(value: string) {
  if (!value.isWellFormed()) throw new TypeError('Text contains unpaired UTF-16 surrogates.');
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/.test(value)) throw new TypeError('Text contains characters not supported by XML.');
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
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
  if (format.color !== undefined) {
    if (!/^#[0-9a-f]{6}$/i.test(format.color)) throw new TypeError('Text color must be a six-digit RGB value.');
    output.push(`<w:color w:val="${format.color.slice(1).toUpperCase()}"/>`);
  }
  if (format.fontSizePoints !== undefined) {
    if (!Number.isFinite(format.fontSizePoints) || format.fontSizePoints < 1 || format.fontSizePoints > 409) throw new RangeError('Font size must be between 1 and 409 points.');
    output.push(`<w:sz w:val="${Math.round(format.fontSizePoints * 2)}"/>`);
  }
  if (format.underline !== undefined) {
    if (!['none', 'single', 'double'].includes(format.underline)) throw new TypeError('Unsupported underline style.');
    output.push(`<w:u w:val="${format.underline}"/>`);
  }
  return output.join('');
}
