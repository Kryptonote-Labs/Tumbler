import { hasQueuedWordTextChanges, wordTextChanged, wordTextDelta } from './text-events.ts';
import type * as Y from 'yjs';
import { wordParagraphIdentity, wordParagraphIdentityRevision } from './paragraph-identity.ts';

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
  private identityRevision: number | undefined;
  private rebuild = false;
  private readonly applied = new WeakSet<Y.Transaction>();
  private readonly observe = (event: Y.YTextEvent) => {
    if (!this.rebuild) {
      const updated = hasQueuedWordTextChanges(event) ? undefined : this.apply(wordTextDelta(event));
      if (updated) this.slices = updated;
      else this.rebuild = true;
    }
    this.applied.add(event.transaction);
    this.output = undefined;
  };

  constructor(readonly text: Y.Text, private readonly project: (paragraph: WordParagraphSlice) => T) {
    // Register identity tracking before our observer reads the new terminator positions.
    wordParagraphIdentity(text, text.length);
    this.slices = this.apply(text.toDelta())!;
    this.rebuild = this.pending();
    text.observe(this.observe);
  }

  private pending(): boolean {
    const doc = this.text.doc;
    return !!doc && (!!doc._transaction && wordTextChanged(doc._transaction, this.text) ||
      doc._transactionCleanups.some(transaction => wordTextChanged(transaction, this.text) && !this.applied.has(transaction)));
  }

  get paragraphs(): readonly T[] {
    const pending = this.pending();
    if (pending) this.rebuild = true;
    if (this.rebuild) {
      // Yjs omits retained surrogate repairs from its delta. Read the source,
      // including queued observer edits, until the document is quiescent again.
      this.slices = [];
      this.slices = this.apply(this.text.toDelta())!;
      this.output = undefined;
      this.rebuild = pending;
    }
    const revision = wordParagraphIdentityRevision(this.text);
    if (revision !== undefined && revision === this.identityRevision && this.output) return this.output;
    this.identityRevision = revision;
    let offset = 0;
    const slices = this.slices.map(slice => {
      offset += slice.length;
      const id = slice.terminated ? wordParagraphIdentity(this.text, offset - 1) : 'end';
      return id === slice.id ? slice : Object.freeze({ ...slice, id });
    });
    if (slices.some((slice, index) => slice !== this.slices[index])) {
      this.slices = slices;
      this.output = undefined;
    }
    return this.output ??= this.slices.map(slice => {
      if (this.projected.has(slice)) return this.projected.get(slice)!;
      const value = this.project(slice);
      this.projected.set(slice, value);
      return value;
    });
  }

  destroy() { this.text.unobserve(this.observe); }

  private apply(delta: Y.YTextEvent['delta']): readonly WordParagraphSlice[] | undefined {
    const result: WordParagraphSlice[] = [];
    let pending: WordParagraphPart[] = [];
    let pendingLength = 0;
    let outputOffset = 0;
    let index = 0;
    let offset = 0;
    let repaired = false;
    const finish = (terminated: boolean) => {
      const id = terminated ? wordParagraphIdentity(this.text, outputOffset - 1) : 'end';
      const previous = this.slices[index] ?? this.slices[index - 1];
      if (previous?.id === id && previous.length === pendingLength && previous.terminated === terminated &&
          previous.parts.length === pending.length && previous.parts.every((part, at) =>
            part.insert === pending[at]!.insert && equalAttributes(part.attributes, pending[at]!.attributes))) {
        result.push(previous);
      } else result.push(Object.freeze({
        id,
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
        if (retain && offset === 0 && count === paragraph.length && paragraph.terminated && pendingLength === 0 &&
          (!attributes || paragraph.parts.every(part => !attributesChange(part.attributes, attributes)))) {
          result.push(paragraph);
          outputOffset += count;
        } else if (retain) {
          let partOffset = 0;
          for (const part of paragraph.parts) {
            const from = Math.max(offset - partOffset, 0);
            const to = Math.min(offset + count - partOffset, part.insert.length);
            if (to > from) {
              const boundary = (at: number) => !(part.insert.charCodeAt(at - 1) >= 0xd800 &&
                part.insert.charCodeAt(at - 1) <= 0xdbff && part.insert.charCodeAt(at) >= 0xdc00 &&
                part.insert.charCodeAt(at) <= 0xdfff);
              if (!boundary(from) || !boundary(to)) repaired = true;
              let format = part.attributes;
              if (attributes && attributesChange(format, attributes)) {
                const patched = { ...format };
                for (const [key, value] of Object.entries(attributes)) {
                  if (value === null) delete patched[key];
                  else patched[key] = value;
                }
                format = Object.keys(patched).length ? Object.freeze(patched) : undefined;
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
    return repaired ? undefined : Object.freeze(result);
  }
}

function equalAttributes(left?: Readonly<Record<string, unknown>>, right?: Readonly<Record<string, unknown>>) {
  if (left === right) return true;
  const keys = Object.keys(left ?? {});
  return keys.length === Object.keys(right ?? {}).length &&
    keys.every(key => Object.hasOwn(right ?? {}, key) && equalValue(left![key], right?.[key]));
}

/** Removing an absent key and assigning an equal structured value are semantic no-ops. */
function attributesChange(current: Readonly<Record<string, unknown>> | undefined, patch: Readonly<Record<string, unknown>>) {
  return Object.entries(patch).some(([key, value]) => value === null
    ? current !== undefined && Object.hasOwn(current, key)
    : !equalValue(current?.[key], value));
}

function equalValue(left: unknown, right: unknown) {
  if (left === right) return true;
  if (typeof left === typeof right && (typeof left === 'string' || typeof left === 'boolean' ||
    typeof left === 'number' && Number.isFinite(left) && Number.isFinite(right))) return false;
  return JSON.stringify(left) === JSON.stringify(right);
}
