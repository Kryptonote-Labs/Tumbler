import * as Y from 'yjs';

interface Part {
  readonly insert: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

/** Immutable text reads updated from deltas rather than the CRDT's formatting history. */
class TextIndex {
  readonly ends: number[] = [];
  private value?: string;
  private boundaries?: { start: number; end: number; attributes?: Part['attributes'] }[];
  constructor(readonly parts: readonly Part[]) {
    let offset = 0;
    for (const part of parts) this.ends.push(offset += part.insert.length);
  }
  string() { return this.value ??= this.parts.map(part => part.insert).join(''); }
  paragraphs() {
    if (this.boundaries) return this.boundaries;
    const result: NonNullable<TextIndex['boundaries']> = [];
    let offset = 0, start = 0;
    for (const part of this.parts) {
      for (let at = part.insert.indexOf('\n'); at >= 0; at = part.insert.indexOf('\n', at + 1)) {
        const end = offset + at + 1;
        result.push({ start, end, ...(part.attributes ? { attributes: part.attributes } : {}) });
        start = end;
      }
      offset += part.insert.length;
    }
    return this.boundaries = result;
  }
  range(start: number, end: number): Part[] {
    if (start >= end) return [];
    let low = 0, high = this.ends.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (this.ends[middle]! <= start) low = middle + 1;
      else high = middle;
    }
    const result: Part[] = [];
    for (let at = low; at < this.parts.length; at++) {
      const offset = this.ends[at - 1] ?? 0;
      if (offset >= end) break;
      const part = this.parts[at]!;
      result.push(start <= offset && end >= this.ends[at]! ? part : {
        insert: part.insert.slice(Math.max(0, start - offset), end - offset),
        ...(part.attributes ? { attributes: part.attributes } : {}),
      });
    }
    return result;
  }
  apply(delta: Y.YTextEvent['delta']) {
    const parts: Part[] = [];
    const append = (runs: readonly Part[]) => {
      const last = parts.at(-1), first = runs[0];
      let from = 0;
      if (last && first) {
        const keys = Object.keys(last.attributes ?? {});
        if (keys.length === Object.keys(first.attributes ?? {}).length &&
          keys.every(key => last.attributes![key] === first.attributes?.[key])) {
          parts[parts.length - 1] = { ...last, insert: last.insert + first.insert };
          from = 1;
        }
      }
      for (let at = from; at < runs.length; at++) parts.push(runs[at]!);
    };
    let offset = 0;
    for (const part of delta) {
      if (part.retain) {
        const retained = this.range(offset, offset + part.retain);
        if (!part.attributes) append(retained);
        else for (const run of retained) {
          const attributes = { ...run.attributes };
          for (const [key, value] of Object.entries(part.attributes)) {
            if (value === null) delete attributes[key];
            else attributes[key] = value;
          }
          append([{ insert: run.insert, attributes }]);
        }
        offset += part.retain;
      }
      if (part.delete) offset += part.delete;
      if (part.insert !== undefined) {
        if (typeof part.insert !== 'string') throw new Error('Only text is supported.');
        append([{ insert: part.insert, ...(part.attributes ? { attributes: { ...part.attributes } } : {}) }]);
      }
    }
    append(this.range(offset, this.ends.at(-1) ?? 0));
    return new TextIndex(parts);
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
  return new TextIndex(parts);
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
  text.observe(event => {
    cached.index = cached.index.apply(event.delta);
    cached.applied.add(event.transaction);
  });
  return entry.index;
}

/** Current plain text, shared by range validation and formatting reads. */
export function wordTextString(text: Y.Text): string { return wordTextIndex(text).string(); }
