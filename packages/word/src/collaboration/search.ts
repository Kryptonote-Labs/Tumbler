import type * as Y from 'yjs';
import { createWordCommands, type WordRange, type WordChange } from './commands.ts';

export interface WordSearchOptions { readonly matchCase?: boolean; readonly wholeWord?: boolean; }
/** Literal, Unicode-aware search. Results never split graphemes or cross object placeholders. */
export function findWordMatches(value: string, query: string, options: WordSearchOptions = {}): WordRange[] {
  if (!query || !query.isWellFormed() || /[\n\r\uFFFC]/u.test(query)) return [];
  const boundaries = new Set<number>([value.length]);
  for (const segment of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value)) boundaries.add(segment.index);
  const words = options.wholeWord ? new Set<number>([value.length]) : undefined;
  if (words) for (const segment of new Intl.Segmenter(undefined, { granularity: 'word' }).segment(value)) { words.add(segment.index); words.add(segment.index + segment.segment.length); }
  const expression = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), options.matchCase ? 'gu' : 'giu');
  const matches: WordRange[] = [];
  for (const match of value.matchAll(expression)) {
    const start = match.index, end = start + match[0].length;
    if (boundaries.has(start) && boundaries.has(end) && (!words || words.has(start) && words.has(end))) matches.push({ start, end });
  }
  return matches;
}

/** Anchor all replacements before mutation. Call wordTransaction once for atomic replace-all. */
export function replaceWordMatches(text: Y.Text, query: string, replacement: string, options: WordSearchOptions = {}): WordChange[] {
  const commands = createWordCommands();
  const value = text.toString();
  return findWordMatches(value, query, options).map(range => ({
    kind: 'replace', target: commands.anchorWordRange(text, range),
    expected: value.slice(range.start, range.end), value: replacement,
  }));
}
