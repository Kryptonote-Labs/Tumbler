import { formatWordNumber } from './numbering.ts';
export const WORD_LIST_KINDS = ['bullet', 'decimal', 'lowerLetter', 'upperLetter', 'lowerRoman', 'upperRoman'] as const;
export type WordListKind = typeof WORD_LIST_KINDS[number];
export interface WordAuthoredList { readonly id: string; readonly kind: WordListKind; readonly level?: number; readonly start?: number; readonly marker?: string; readonly multilevel?: boolean; }
export function isWordAuthoredList(value: unknown): value is WordAuthoredList {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const list = value as Record<string, unknown>;
  return Object.keys(list).every(key => ['id', 'kind', 'level', 'start', 'marker', 'multilevel'].includes(key)) &&
    typeof list.id === 'string' && list.id.length > 0 && WORD_LIST_KINDS.some(kind => kind === list.kind) &&
    (list.level === undefined || Number.isInteger(list.level) && Number(list.level) >= 0 && Number(list.level) <= 8) &&
    (list.start === undefined || Number.isInteger(list.start) && Number(list.start) >= 0 && Number(list.start) <= 2147483647) &&
    (list.marker === undefined || list.kind === 'bullet' && typeof list.marker === 'string' && list.marker.length > 0 && list.marker.isWellFormed() && !/[\x00-\x1f\ufffe\uffff]/.test(list.marker)) &&
    (list.multilevel === undefined || typeof list.multilevel === 'boolean');
}
export function wordListPattern(list: WordAuthoredList, level: number): string {
  return list.kind === 'bullet' ? list.marker ?? '•' : list.multilevel ? Array.from({ length: level + 1 }, (_, i) => `%${i + 1}`).join('.') + '.' : `%${level + 1}.`;
}
export function wordListMarker(list: WordAuthoredList, values: readonly number[], level: number): string {
  return wordListPattern(list, level).replace(/%([1-9])/g, (_, index: string) => formatWordNumber(values[Number(index) - 1] ?? list.start ?? 1, list.kind));
}
