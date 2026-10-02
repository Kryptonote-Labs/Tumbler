import { isDocumentImage, type DocumentImage } from './images.ts';
import { isTableCell, type TableCell } from './tables.ts';
export const TEXT_FORMATS = ['bold', 'italic', 'underline'] as const;
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
  color?: string;
  font?: string;
  fontSize?: number;
  table?: TableCell;
  image?: DocumentImage;
  list?: { id: string; kind: 'bullet' | 'decimal'; level: number };
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
    if (key === 'image' && isDocumentImage(value)) continue;
    if (key === 'table' && isTableCell(value)) continue;
    if (key === 'list' && isList(value)) continue;
    if (key === 'fontSize' && isFontSize(value)) continue;
    if (key === 'font' && typeof value === 'string' && value.length > 0) continue;
    if (key === 'color' && isTextColor(value)) continue;
    if (key === 'align' && ALIGNMENTS.some((alignment) => alignment === value)) continue;
    throw new Error('Unsupported document formatting.');
  }
}

export function isList(value: unknown): value is NonNullable<TextAttributes['list']> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return (
    'id' in value &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    value.id.length <= 128 &&
    'kind' in value &&
    (value.kind === 'bullet' || value.kind === 'decimal') &&
    'level' in value &&
    Number.isInteger(value.level) &&
    typeof value.level === 'number' &&
    value.level >= 0 &&
    value.level <= 8 &&
    Object.keys(value).every((key) => ['id', 'kind', 'level'].includes(key))
  );
}
