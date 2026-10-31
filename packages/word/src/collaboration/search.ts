import type * as Y from 'yjs';
import { createWordCommands, type WordChange } from './commands.ts';

import { findTextMatches as findWordMatches } from '@tumblerjs/core';
import type { TextSearchOptions as WordSearchOptions } from '@tumblerjs/core';
export { findWordMatches };
export type { WordSearchOptions };

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
