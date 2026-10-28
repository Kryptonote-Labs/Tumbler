import { validateText } from './text-validation.ts';
import { wordTextDelta } from './text-events.ts';
import * as Y from 'yjs';

interface Part {
  readonly insert: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

interface Chunk {
  readonly parts: readonly Part[];
  readonly length: number;
}
const chunkSize = 64;
const chunk = (parts: readonly Part[]): Chunk => ({ parts, length: parts.reduce((sum, part) => sum + part.insert.length, 0) });

/** Copy only boundary chunks for an edit; untouched formatting runs retain their storage. */
class TextIndex {
  readonly ends: number[] = [];
  private value?: string;
  private valid?: boolean;
  private boundaries?: { start: number; end: number; attributes?: Part['attributes'] }[];
  constructor(private readonly chunks: readonly Chunk[]) {
    let offset = 0;
    for (const value of chunks) this.ends.push(offset += value.length);
  }
  static from(parts: readonly Part[]) {
    const chunks: Chunk[] = [];
    for (let at = 0; at < parts.length; at += chunkSize) chunks.push(chunk(parts.slice(at, at + chunkSize)));
    return new TextIndex(chunks);
  }
  string() { return this.value ??= this.chunks.flatMap(value => value.parts.map(part => part.insert)).join(''); }
  validateReplacement(start: number, end: number, insert: string) {
    const value = this.string();
    this.valid ??= validText(value);
    // Command range checks already prove the replacement's grapheme boundaries.
    if (this.valid) validateText(insert);
    else validateText(value.slice(0, start) + insert + value.slice(end));
  }
  private boundary(at: number) {
    if (at === 0 || at === (this.ends.at(-1) ?? 0)) return true;
    const value = this.range(at - 1, at + 1).map(part => part.insert).join('');
    return !(value.charCodeAt(0) >= 0xd800 && value.charCodeAt(0) <= 0xdbff &&
      value.charCodeAt(1) >= 0xdc00 && value.charCodeAt(1) <= 0xdfff);
  }
  paragraphs() {
    if (this.boundaries) return this.boundaries;
    const result: NonNullable<TextIndex['boundaries']> = [];
    let offset = 0, start = 0;
    for (const value of this.chunks) for (const part of value.parts) {
      for (let at = part.insert.indexOf('\n'); at >= 0; at = part.insert.indexOf('\n', at + 1)) {
        const end = offset + at + 1;
        result.push({ start, end, ...(part.attributes ? { attributes: part.attributes } : {}) });
        start = end;
      }
      offset += part.insert.length;
    }
    return this.boundaries = result;
  }
  private first(start: number) {
    let low = 0, high = this.ends.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (this.ends[middle]! <= start) low = middle + 1;
      else high = middle;
    }
    return low;
  }
  private *slices(start: number, end: number): Generator<Chunk> {
    if (start >= end) return;
    for (let at = this.first(start); at < this.chunks.length; at++) {
      let offset = this.ends[at - 1] ?? 0;
      if (offset >= end) return;
      const value = this.chunks[at]!;
      if (start <= offset && end >= this.ends[at]!) { yield value; continue; }
      const parts: Part[] = [];
      for (const part of value.parts) {
        const from = Math.max(0, start - offset), to = Math.min(part.insert.length, end - offset);
        if (to > from) parts.push(from === 0 && to === part.insert.length ? part : {
          insert: part.insert.slice(from, to), ...(part.attributes ? { attributes: part.attributes } : {}),
        });
        offset += part.insert.length;
        if (offset >= end) break;
      }
      if (parts.length) yield chunk(parts);
    }
  }
  range(start: number, end: number): Part[] {
    const result: Part[] = [];
    for (const value of this.slices(start, end)) result.push(...value.parts);
    return result;
  }
  apply(delta: Y.YTextEvent['delta']) {
    // Yjs replaces both halves when an item split cuts a surrogate pair. Its
    // event delta omits those retained-character repairs, so read the actual items.
    let position = 0;
    for (const part of delta) {
      if (!this.boundary(position)) return undefined;
      position += (part.retain ?? 0) + (part.delete ?? 0);
      if (!this.boundary(position)) return undefined;
    }
    const chunks: Chunk[] = [];
    const append = (value: Chunk) => {
      const last = chunks.at(-1);
      if (!last || last.parts.length + value.parts.length > chunkSize) { chunks.push(value); return; }
      const parts = [...last.parts], previous = parts.at(-1)!, first = value.parts[0]!;
      const keys = Object.keys(previous.attributes ?? {});
      const merge = keys.length === Object.keys(first.attributes ?? {}).length &&
        keys.every(key => Object.hasOwn(first.attributes ?? {}, key) && previous.attributes![key] === first.attributes?.[key]);
      if (merge) parts[parts.length - 1] = { ...previous, insert: previous.insert + first.insert };
      for (let at = merge ? 1 : 0; at < value.parts.length; at++) parts.push(value.parts[at]!);
      chunks[chunks.length - 1] = chunk(parts);
    };
    let offset = 0;
    for (const part of delta) {
      if (part.retain) {
        for (const value of this.slices(offset, offset + part.retain)) {
          if (!part.attributes) { append(value); continue; }
          append(chunk(value.parts.map(run => {
            const attributes = { ...run.attributes };
            for (const [key, value] of Object.entries(part.attributes!)) {
              if (value === null) delete attributes[key];
              else attributes[key] = value;
            }
            return { insert: run.insert, attributes };
          })));
        }
        offset += part.retain;
      }
      if (part.delete) offset += part.delete;
      if (part.insert !== undefined) {
        if (typeof part.insert !== 'string') throw new Error('Only text is supported.');
        if (part.insert) append(chunk([{ insert: part.insert, ...(part.attributes ? { attributes: { ...part.attributes } } : {}) }]));
      }
    }
    for (const value of this.slices(offset, this.ends.at(-1) ?? 0)) append(value);
    const result = new TextIndex(chunks);
    if (this.valid) {
      let offset = 0;
      result.valid = delta.every(part => {
        if (part.retain) offset += part.retain;
        if (part.insert !== undefined && (typeof part.insert !== 'string' || !this.boundary(offset) || !validText(part.insert))) return false;
        if (part.delete) {
          if (!this.boundary(offset) || !this.boundary(offset + part.delete)) return false;
          offset += part.delete;
        }
        return true;
      });
    }
    if (this.value !== undefined) {
      if (delta.every(part => part.insert === undefined && !part.delete)) result.value = this.value;
      else {
        let offset = 0;
        const values: string[] = [];
        for (const part of delta) {
          if (part.retain) { values.push(this.value.slice(offset, offset + part.retain)); offset += part.retain; }
          if (part.delete) offset += part.delete;
          if (typeof part.insert === 'string') values.push(part.insert);
        }
        values.push(this.value.slice(offset));
        result.value = values.join('');
      }
    }
    return result;
  }
}

function current(text: Y.Text) {
  const parts: Part[] = [];
  const attributes: Record<string, unknown> = {};
  for (let item = text._start; item; item = item.right) {
    if (item.deleted) continue;
    if (item.content instanceof Y.ContentFormat) {
      if (item.content.value === null) delete attributes[item.content.key];
      else attributes[item.content.key] = item.content.value;
    } else if (item.countable) {
      if (!(item.content instanceof Y.ContentString)) throw new Error('Only text is supported.');
      parts.push({ insert: item.content.str, ...(Object.keys(attributes).length ? { attributes: { ...attributes } } : {}) });
    }
  }
  return TextIndex.from(parts);
}

const indexes = new WeakMap<Y.Text, { index: TextIndex; applied: WeakSet<Y.Transaction> }>();

/** Reads inside unfinished writes or before our observer must see the actual current state.
 * Never seed an incremental index midway through a transaction, whose delta includes earlier edits.
 */
export function wordTextIndex(text: Y.Text): TextIndex {
  let entry = indexes.get(text);
  const doc = text.doc;
  if (!doc) return current(text);
  const changing = (transaction: Y.Transaction) =>
    [...transaction.changed.keys()].some(root => root instanceof Y.Text && root === text);
  if (doc._transaction && changing(doc._transaction) || doc._transactionCleanups.some(transaction =>
    changing(transaction) && !entry?.applied.has(transaction))) return current(text);
  if (entry) return entry.index;
  entry = { index: current(text), applied: new WeakSet() };
  indexes.set(text, entry);
  const cached = entry;
  const observe = (event: Y.YTextEvent) => {
    const updated = cached.index.apply(wordTextDelta(event));
    if (!updated) {
      // An earlier observer may already have queued more writes. Seed a fresh
      // index only after those transactions finish, so they cannot apply twice.
      indexes.delete(text);
      text.unobserve(observe);
      return;
    }
    cached.index = updated;
    cached.applied.add(event.transaction);
  };
  text.observe(observe);
  return entry.index;
}

/** Current plain text, shared by range validation and formatting reads. */
export function wordTextString(text: Y.Text): string { return wordTextIndex(text).string(); }

function validText(value: string) {
  try { validateText(value); return true; }
  catch { return false; }
}

/** Validate replacement text without rescanning an already validated unchanged body. */
export function validateWordTextReplacement(text: Y.Text, start: number, end: number, insert: string) {
  wordTextIndex(text).validateReplacement(start, end, insert);
}
