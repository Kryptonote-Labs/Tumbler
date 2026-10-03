import type * as Y from 'yjs';
import { wordParagraphIdentity } from './paragraph-identity.ts';

export interface WordParagraphPart {
  readonly insert: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

/** A paragraph includes its terminating newline and its formatting when present. */
export interface WordParagraphSlice {
  readonly id: string;
  readonly length: number;
  readonly terminated: boolean;
  readonly parts: readonly WordParagraphPart[];
}

/** Apply CRDT deltas to paragraph slices, retaining objects outside the changed range.
 * Hosts project Office content only for new slices. Destroy the projection when its editor closes.
 */
export class WordParagraphProjection<T> {
  private slices: readonly WordParagraphSlice[] = [];
  private readonly projected = new WeakMap<WordParagraphSlice, T>();
  private output: readonly T[] | undefined;
  private readonly observe = (event: Y.YTextEvent) => {
    this.slices = this.apply(event.delta);
    this.output = undefined;
  };

  constructor(readonly text: Y.Text, private readonly project: (paragraph: WordParagraphSlice) => T) {
    // Register identity tracking before our observer reads the new terminator positions.
    wordParagraphIdentity(text, text.length);
    this.slices = this.apply(text.toDelta());
    text.observe(this.observe);
  }

  get paragraphs(): readonly T[] {
    return this.output ??= this.slices.map(slice => {
      if (this.projected.has(slice)) return this.projected.get(slice)!;
      const value = this.project(slice);
      this.projected.set(slice, value);
      return value;
    });
  }

  destroy() { this.text.unobserve(this.observe); }

  private apply(delta: Y.YTextEvent['delta']): readonly WordParagraphSlice[] {
    const result: WordParagraphSlice[] = [];
    let pending: WordParagraphPart[] = [];
    let pendingLength = 0;
    let outputOffset = 0;
    let index = 0;
    let offset = 0;
    const finish = (terminated: boolean) => {
      result.push(Object.freeze({
        id: terminated ? wordParagraphIdentity(this.text, outputOffset - 1) : 'end',
        length: pendingLength,
        terminated,
        parts: Object.freeze(pending),
      }));
      pending = [];
      pendingLength = 0;
    };
    const append = (insert: string, attributes?: Readonly<Record<string, unknown>>) => {
      let start = 0;
      while (start < insert.length) {
        const newline = insert.indexOf('\n', start);
        const end = newline < 0 ? insert.length : newline + 1;
        const value = insert.slice(start, end);
        const previous = pending.at(-1);
        if (previous && equalAttributes(previous.attributes, attributes))
          pending[pending.length - 1] = Object.freeze({ ...previous, insert: previous.insert + value });
        else pending.push(Object.freeze({ insert: value, ...(attributes ? { attributes } : {}) }));
        pendingLength += value.length;
        outputOffset += value.length;
        if (newline >= 0) finish(true);
        start = end;
      }
    };
    const consume = (length: number, retain: boolean, attributes?: Record<string, unknown>) => {
      while (length > 0 && index < this.slices.length) {
        const paragraph = this.slices[index]!;
        const count = Math.min(length, paragraph.length - offset);
        if (!count) { index++; offset = 0; continue; }
        if (retain && !attributes && offset === 0 && count === paragraph.length && paragraph.terminated && pendingLength === 0) {
          result.push(paragraph);
          outputOffset += count;
        } else if (retain) {
          let partOffset = 0;
          for (const part of paragraph.parts) {
            const from = Math.max(offset - partOffset, 0);
            const to = Math.min(offset + count - partOffset, part.insert.length);
            if (to > from) {
              let format = part.attributes;
              if (attributes) {
                const patched = { ...format };
                for (const [key, value] of Object.entries(attributes)) {
                  if (value === null) delete patched[key];
                  else patched[key] = value;
                }
                format = Object.freeze(patched);
              }
              append(part.insert.slice(from, to), format);
            }
            partOffset += part.insert.length;
            if (partOffset >= offset + count) break;
          }
        }
        offset += count;
        length -= count;
        if (offset === paragraph.length) { index++; offset = 0; }
      }
      if (length) throw new Error('Paragraph delta exceeds the document.');
    };
    for (const part of delta) {
      if (part.retain) consume(part.retain, true, part.attributes);
      if (part.delete) consume(part.delete, false);
      if (part.insert !== undefined) {
        if (typeof part.insert !== 'string') throw new Error('Unsupported document content.');
        append(part.insert, part.attributes && Object.freeze({ ...part.attributes }));
      }
    }
    while (index < this.slices.length) {
      const remaining = this.slices[index]!.length - offset;
      if (remaining) consume(remaining, true);
      else { index++; offset = 0; }
    }
    if (pendingLength || !result.length) finish(false);
    return Object.freeze(result);
  }
}

function equalAttributes(left?: Readonly<Record<string, unknown>>, right?: Readonly<Record<string, unknown>>) {
  if (left === right) return true;
  const keys = Object.keys(left ?? {});
  return keys.length === Object.keys(right ?? {}).length &&
    keys.every(key => JSON.stringify(left![key]) === JSON.stringify(right?.[key]));
}
