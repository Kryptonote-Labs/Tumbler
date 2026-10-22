import type * as Y from 'yjs';
import type { WordDocument } from '../document.ts';
import { assertSourcePositioningReset } from '../package-positioning.ts';
import type { WordParagraphPositioning } from '../positioning.ts';
import type { TextAttributes } from './formatting.ts';

const sources = new WeakMap<Y.Text, WordDocument>();

/** Source context is local to the editing session, never serialized into collaborative data. */
export function setWordResetSource(text: Y.Text, source: WordDocument) { sources.set(text, source); }
export function inheritWordResetSource(text: Y.Text, staged: Y.Text) {
  const source = sources.get(text);
  if (source) sources.set(staged, source);
}

/** Reject unsupported resets before a command returns a delta that the caller can persist. */
export function assertWordPositioningReset(text: Y.Text, range: { start: number; end: number }, positioning: WordParagraphPositioning | null | undefined) {
  const source = sources.get(text);
  if (!source || positioning === undefined || (positioning !== null && !Object.keys(positioning).length)) return;
  if (positioning?.tabs?.length) return;
  let offset = 0;
  let paragraphStart = 0;
  const parts: { insert: string; attributes?: TextAttributes }[] = text.toDelta();
  for (const part of parts) {
    for (let at = part.insert.indexOf('\n'); at >= 0; at = part.insert.indexOf('\n', at + 1)) {
      const end = offset + at;
      if (end >= range.start && paragraphStart <= Math.max(range.start, range.end - 1)) {
        const reset = positioning === null ? { reset: true as const }
          : positioning.reset ? positioning : { ...part.attributes?.positioning, ...positioning };
        assertSourcePositioningReset(source, part.attributes?.wordParagraph, reset);
      }
      paragraphStart = end + 1;
    }
    offset += part.insert.length;
    if (paragraphStart > range.end) break;
  }
}
