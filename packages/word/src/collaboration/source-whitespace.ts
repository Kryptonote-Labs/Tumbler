import type * as Y from 'yjs';
import type { WordArtifact } from '../artifact.ts';
import { wordLiteralText } from '../literal-text.ts';
import { bindWordSourceText } from './source-text.ts';

/** Bind canonical display for unchanged leaves in older collaborative imports, preserving
 * synchronized characters and offline edit targets. Hosts run this in their durable migration.
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
  const changes: { at: number; count: number; value: string; source: number }[] = [];
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
        changes.push({ at: offset + from, count, value: canonical[to]!, source: group.source });
        from += count;
      }
      offset += part.original.length;
    }
  }
  return bindWordSourceText(text, changes);
}
