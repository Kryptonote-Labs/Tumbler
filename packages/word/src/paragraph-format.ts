import type { WordLineSpacing } from './styles.ts';
import { isWordCellFormat, borderXml, type WordCellBorders } from './table-format.ts';

/** Direct paragraph properties. Measurements use OOXML twips, 20 per point. */
export interface WordParagraphFormat {
  readonly spacingBeforeTwips?: number;
  readonly spacingAfterTwips?: number;
  readonly lineSpacing?: WordLineSpacing;
  readonly keepNext?: boolean;
  readonly keepLines?: boolean;
  readonly pageBreakBefore?: boolean;
  readonly widowControl?: boolean;
  readonly contextualSpacing?: boolean;
  readonly shading?: string;
  readonly borders?: WordCellBorders;
}
const toggles = ['keepNext', 'keepLines', 'pageBreakBefore', 'widowControl', 'contextualSpacing'] as const;
export function isWordParagraphFormat(value: unknown): value is WordParagraphFormat {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value).every(([key, item]) => {
    if (toggles.some(name => name === key)) return typeof item === 'boolean';
    if (key === 'spacingBeforeTwips' || key === 'spacingAfterTwips') return Number.isInteger(item) && item >= 0 && item <= 2147483647;
    if (key === 'shading' || key === 'borders') return isWordCellFormat({ [key]: item });
    if (key === 'lineSpacing') {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
      const spacing = item as Record<string, unknown>;
      return Object.keys(spacing).every(k => k === 'rule' || k === 'value') &&
        ['auto', 'atLeast', 'exact'].includes(String(spacing.rule)) && Number.isInteger(spacing.value) && Number(spacing.value) >= 0 && Number(spacing.value) <= 2147483647;
    }
    return false;
  });
}
/** Individual property elements allow source-aware writers to retain unrelated properties. */
export function paragraphFormatXml(format: WordParagraphFormat): Map<string, string> {
  if (!isWordParagraphFormat(format)) throw new TypeError('Invalid paragraph formatting.');
  const output = new Map<string, string>();
  for (const key of toggles.filter(key => key !== 'contextualSpacing')) if (format[key] !== undefined) output.set(key, `<w:${key} w:val="${format[key] ? 1 : 0}"/>`);
  if (format.borders) output.set('pBdr', `<w:pBdr>${borderXml(format.borders)}</w:pBdr>`);
  if (format.shading !== undefined) output.set('shd', `<w:shd w:val="clear" w:fill="${format.shading === 'transparent' ? 'auto' : format.shading.slice(1)}"/>`);
  const spacing = [format.spacingBeforeTwips === undefined ? '' : `w:before="${format.spacingBeforeTwips}"`, format.spacingAfterTwips === undefined ? '' : `w:after="${format.spacingAfterTwips}"`, format.lineSpacing ? `w:line="${format.lineSpacing.value}" w:lineRule="${format.lineSpacing.rule}"` : ''].filter(Boolean);
  if (spacing.length) output.set('spacing', `<w:spacing ${spacing.join(' ')}/>`);
  if (format.contextualSpacing !== undefined) output.set('contextualSpacing', `<w:contextualSpacing w:val="${format.contextualSpacing ? 1 : 0}"/>`);
  return output;
}
