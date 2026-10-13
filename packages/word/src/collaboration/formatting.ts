import { isWordParagraphPositioning, isWordPositionalTab, type WordParagraphPositioning } from '../positioning.ts';
import type { WordPositionalTab } from '../document.ts';
import { WORD_HIGHLIGHTS } from '../text-properties.ts';
import { isWordParagraphFormat, type WordParagraphFormat } from '../paragraph-format.ts';
import { isWordAuthoredList, type WordAuthoredList } from '../authored-list.ts';
import { isWordHyperlink } from '../hyperlinks.ts';
import { isDocumentImage, type DocumentImage } from './images.ts';
import { isTableCell, type TableCell } from './tables.ts';
export const TEXT_FORMATS = ['bold', 'italic', 'underline', 'strike'] as const;
export const ALIGNMENTS = ['left', 'center', 'right', 'justify'] as const;
export type TextFormat = (typeof TEXT_FORMATS)[number];
export type Alignment = (typeof ALIGNMENTS)[number];
export type TextAttributes = Partial<Record<TextFormat, boolean>> & {
  wordSource?: number;
  wordParagraph?: number;
  wordCopy?: string;
  fontFamily?: string;
  wordUnderline?: 'single' | 'double';
  align?: Alignment;
  styleId?: string;
  paragraph?: WordParagraphFormat;
  positioning?: WordParagraphPositioning;
  tab?: WordPositionalTab;
  highlight?: string;
  verticalAlign?: 'baseline' | 'superscript' | 'subscript';
  characterSpacingPoints?: number;
  link?: string;
  color?: string;
  font?: string;
  fontSize?: number;
  table?: TableCell;
  image?: DocumentImage;
  field?: import('../page-fields.ts').WordPageField;
  list?: WordAuthoredList & { level: number };
};


// Word supports 1–1638 pt in half-point steps:
// https://support.microsoft.com/en-us/office/fonts/change-the-font-size
export function isFontSize(value: unknown): value is number {
  return typeof value === 'number' && value >= 1 && value <= 1638 && Number.isInteger(value * 2);
}

export function isTextColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

export function validateAttributes(attributes: Record<string, unknown> | undefined) {
  for (const [key, value] of Object.entries(attributes ?? {})) {
    if (TEXT_FORMATS.some((format) => format === key) && typeof value === 'boolean') continue;
    if (
      (key === 'wordSource' || key === 'wordParagraph') &&
      Number.isSafeInteger(value) &&
      Number(value) > 0
    )
      continue;
    if (
      key === 'fontFamily' &&
      typeof value === 'string' &&
      value.length > 0 &&
      !/[\x00-\x1f]/.test(value)
    )
      continue;
    if (key === 'wordCopy' && typeof value === 'string') continue;
    if (key === 'wordUnderline' && (value === 'single' || value === 'double')) continue;
    if (key === 'styleId' && typeof value === 'string' && value.length > 0 && !/[\x00-\x1f]/.test(value)) continue;
    if (key === 'paragraph' && isWordParagraphFormat(value)) continue;
    if (key === 'positioning' && isWordParagraphPositioning(value)) continue;
    if (key === 'tab' && isWordPositionalTab(value)) continue;
    if (key === 'field' && (value === 'PAGE' || value === 'NUMPAGES')) continue;
    if (key === 'image' && isDocumentImage(value)) continue;
    if (key === 'table' && isTableCell(value)) continue;
    if (key === 'list' && isList(value)) continue;
    if (key === 'fontSize' && isFontSize(value)) continue;
    if (key === 'font' && typeof value === 'string' && value.length > 0) continue;
    if (key === 'highlight' && typeof value === 'string' && WORD_HIGHLIGHTS.includes(value)) continue;
    if (key === 'verticalAlign' && typeof value === 'string' && ['baseline', 'superscript', 'subscript'].includes(value)) continue;
    if (key === 'characterSpacingPoints' && typeof value === 'number' && Number.isInteger(value * 20) && value * 20 >= -2147483648 && value * 20 <= 2147483647) continue;
    if (key === 'link' && isWordHyperlink(value)) continue;
    if (key === 'color' && isTextColor(value)) continue;
    if (key === 'align' && ALIGNMENTS.some((alignment) => alignment === value)) continue;
    throw new Error('Unsupported document formatting.');
  }
}

export function isList(value: unknown): value is NonNullable<TextAttributes['list']> {
  return isWordAuthoredList(value) && value.level !== undefined;
}
