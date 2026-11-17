import type * as Y from 'yjs';
import type { WordDelta, WordRange } from './commands.ts';
import { isParagraphPropertyAttribute } from './paragraph-attributes.ts';
import { wordTextRange } from './text-range.ts';

const paragraphKeys = new Set([
  'wordParagraph', 'wordCopy', 'styleId', 'paragraph', 'align', 'positioning', 'list',
]);

/** A surviving paragraph prefix keeps its paragraph formatting when its end mark is deleted.
 * Whole-paragraph removals keep the following paragraph's formatting instead. Table and
 * section boundaries stay on their surviving marks; they are not paragraph formatting.
 */
export function paragraphJoinDelta(text: Y.Text, range: WordRange, replacement: string): WordDelta {
  if (range.start === range.end || replacement.includes('\n')) return [];
  const value = text.toString();
  const start = range.start === 0 ? 0 : value.lastIndexOf('\n', range.start - 1) + 1;
  const first = value.indexOf('\n', range.start);
  if (range.start === start || first < 0 || first >= range.end) return [];
  const last = value.indexOf('\n', range.end);
  if (last < 0) return [];
  const before = wordTextRange(text, first, first + 1)[0]?.attributes ?? {};
  const after = wordTextRange(text, last, last + 1)[0]?.attributes ?? {};
  const patch = Object.fromEntries(
    [...new Set([...Object.keys(before), ...Object.keys(after)])]
      .filter(key => paragraphKeys.has(key) || isParagraphPropertyAttribute(key))
      .map(key => [key, before[key] ?? null]),
  );
  // Changing the paragraph template must not restore its deleted section break.
  // Imported boundaries on the surviving mark remain explicit and keep their geometry.
  if (before.wordParagraph !== after.wordParagraph)
    patch.wordSection = after.wordSection ?? { remove: true };
  if (!Object.keys(patch).length) return [];
  return [
    ...(last > range.end ? [{ retain: last - range.end }] : []),
    { retain: 1, attributes: patch },
  ];
}
