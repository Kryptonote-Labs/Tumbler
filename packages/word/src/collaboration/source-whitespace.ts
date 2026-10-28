import type * as Y from 'yjs';
import type { WordArtifact } from '../artifact.ts';
import { wordLiteralText } from '../literal-text.ts';
import { wordTextRange } from './text-range.ts';

/** Repair unchanged source leaves in older collaborative imports. User edits and copied
 * source leaves are left alone. Hosts run this once in their durable migration path.
 */
export function restoreWordSourceWhitespace(text: Y.Text, artifact: WordArtifact): number {
  const groups: { source: number; start: number; value: string }[] = [];
  const parts: { insert: string; attributes?: Record<string, unknown> }[] = text.toDelta();
  let offset = 0;
  for (const part of parts) {
    const source = part.attributes?.wordSource;
    if (typeof source === 'number' && part.attributes?.wordParagraph === undefined && part.attributes?.wordCopy === undefined) {
      const previous = groups.at(-1);
      if (previous?.source === source && previous.start + previous.value.length === offset) previous.value += part.insert;
      else groups.push({ source, start: offset, value: part.insert });
    }
    offset += part.insert.length;
  }
  const changes: { at: number; count: number; value: string }[] = [];
  for (const group of groups) {
    if (!/[\r\n]/.test(group.value)) continue;
    const element = artifact.document.source.element(group.source);
    if (element?.localName !== 't') continue;
    const origins = artifact.document.source.textContentOrigins(element);
    const before = origins.map(part => part.original).join('');
    const after = origins.map(part => wordLiteralText(part.value)).join('');
    if (group.value !== before || before === after) continue;
    let offset = group.start;
    for (const part of origins) {
      const canonical = wordLiteralText(part.value);
      for (let from = 0, to = 0; from < part.original.length; to++) {
        if (part.original[from] === canonical[to]) { from++; continue; }
        const count = part.original.slice(from, from + 2) === '\r\n' && canonical[to] === ' ' ? 2 : 1;
        if (!/[\r\n]/.test(part.original[from]!) || ![' ', '\u2028'].includes(canonical[to]!))
          throw new Error('Unexpected source whitespace migration.');
        changes.push({ at: offset + from, count, value: canonical[to]! });
        from += count;
      }
      offset += part.original.length;
    }
  }
  text.doc?.transact(() => {
    for (const change of changes.toReversed()) {
      const attributes = wordTextRange(text, change.at, change.at + 1)[0]?.attributes;
      text.applyDelta([...(change.at ? [{ retain: change.at }] : []), { delete: change.count }, { insert: change.value, attributes }]);
    }
  });
  return changes.length;
}
