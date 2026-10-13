import type * as Y from 'yjs';
import { createWordCommands, type WordRange, type WordChange } from './commands.ts';

export interface WordSearchOptions { readonly matchCase?: boolean; readonly wholeWord?: boolean; readonly locale?: string; }
/** Literal, Unicode-aware search. Results never split graphemes or cross object placeholders. */
export function findWordMatches(value: string, query: string, options: WordSearchOptions = {}): WordRange[] {
  if (!query || !query.isWellFormed() || /[\n\r\uFFFC]/u.test(query)) return [];
  const offsets = new Map<number, number>();
  let normalized = '';
  for (const segment of new Intl.Segmenter('und', { granularity: 'grapheme' }).segment(value)) {
    offsets.set(normalized.length, segment.index);
    normalized += segment.segment.normalize('NFC');
  }
  offsets.set(normalized.length, value.length);
  query = query.normalize('NFC');
  const words = options.wholeWord ? new Set<number>([normalized.length]) : undefined;
  if (words) for (const segment of new Intl.Segmenter(options.locale ?? 'und', { granularity: 'word' }).segment(normalized)) { words.add(segment.index); words.add(segment.index + segment.segment.length); }
  const expression = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), options.matchCase ? 'gu' : 'giu');
  const matches: WordRange[] = [];
  for (const match of normalized.matchAll(expression)) {
    const start = match.index, end = start + match[0].length;
    const originalStart = offsets.get(start), originalEnd = offsets.get(end);
    if (originalStart !== undefined && originalEnd !== undefined && (!words || words.has(start) && words.has(end))) matches.push({ start: originalStart, end: originalEnd });
  }
  return matches;
}

/** Anchor all replacements before mutation. Call wordTransaction once for atomic replace-all. */
export function replaceWordMatches(text: Y.Text, query: string, replacement: string, options: WordSearchOptions = {}): WordChange[] {
  if (!replacement.isWellFormed() || replacement.includes('\uFFFC')) throw new TypeError('Replacement text must be well-formed and cannot contain embedded object placeholders.');
  const commands = createWordCommands();
  const value = text.toString();
  return findWordMatches(value, query, options).map(range => ({
    kind: 'replace', target: commands.anchorWordRange(text, range),
    expected: value.slice(range.start, range.end), value: replacement,
  }));
}
