import * as Y from 'yjs';
import * as z from 'zod';
import { sourceFormattingKey } from './source-formatting.ts';
import { retainSourceTableBoundaries } from './source-text-tables.ts';
import type { TableCell } from './tables.ts';
import { sourceReplacements, projectWordSourceReplacements } from './source-replacement.ts';

export const wordSourceTextRoot = 'word-source-text-v1';
export const wordSourceTextRedoneRoot = 'word-source-text-redone-v1';
const sourceItemIdentity = z.tuple([
  z.number().int().nonnegative(),
  z.number().int().nonnegative(),
]);
const identity = (client: number, clock: number) => JSON.stringify([client, clock]);
const bindingSchema = z
  .object({
    root: z.string(),
    source: z.number().int(),
    before: z.enum(['\r', '\n']),
    after: z.enum([' ', '\u2028']),
    pair: z.string().optional(),
  })
  .strict();
type Binding = z.infer<typeof bindingSchema>;
const bindings = new WeakMap<Y.Doc, Map<string, Binding>>();
const observed = new WeakSet<Y.Map<unknown>>();

export function sourceBindings(doc: Y.Doc) {
  if (!doc.share.has(wordSourceTextRoot)) return undefined;
  let found = bindings.get(doc);
  if (!found) {
    const root = doc.getMap<unknown>(wordSourceTextRoot);
    found = new Map([...root].map(([key, value]) => [key, bindingSchema.parse(value)]));
    bindings.set(doc, found);
    if (!observed.has(root)) {
      observed.add(root);
      root.observe(() => bindings.delete(doc));
    }
  }
  return found;
}

/** Bind a verified source spelling without replacing synchronized character identities. */
export function bindWordSourceText(
  text: Y.Text,
  changes: readonly {
    at: number;
    count: number;
    value: string;
    source: number;
  }[],
) {
  const doc = text.doc;
  if (!doc || !changes.length) return 0;
  const root = Y.createRelativePositionFromTypeIndex(text, 0).tname;
  if (root === null) throw new Error('Source text must belong to a named root.');
  const entries: [string, Binding][] = [];
  const ordered = changes.toSorted((a, b) => a.at - b.at);
  let first = 0;
  let offset = 0;
  for (let item = text._start; item; item = item.right) {
    if (item.deleted || !item.countable) continue;
    if (!(item.content instanceof Y.ContentString)) throw new Error('Only text is supported.');
    for (
      let index = first;
      index < ordered.length && ordered[index]!.at < offset + item.length;
      index++
    ) {
      const change = ordered[index]!;
      const from = Math.max(change.at, offset),
        to = Math.min(change.at + change.count, offset + item.length);
      for (let at = from; at < to; at++) {
        const before = item.content.str[at - offset];
        if (
          (before !== '\r' && before !== '\n') ||
          (change.value !== ' ' && change.value !== '\u2028')
        )
          throw new Error('Invalid source whitespace binding.');
        entries.push([
          identity(item.id.client, item.id.clock + at - offset),
          {
            root,
            source: change.source,
            before,
            after: change.value,
            ...(change.count === 2 ? { pair: JSON.stringify([root, change.at]) } : {}),
          },
        ]);
      }
    }
    offset += item.length;
    while (first < ordered.length && ordered[first]!.at + ordered[first]!.count <= offset) first++;
  }
  const pairs = new Map<string, string[]>();
  for (const [name, value] of entries)
    if (value.pair) {
      const members = pairs.get(value.pair) ?? [];
      members.push(name);
      pairs.set(value.pair, members);
    }
  for (const [, value] of entries)
    if (value.pair) value.pair = JSON.stringify([root, pairs.get(value.pair)]);
  const added = new Set<string>();
  doc.transact(() => {
    const map = doc.getMap<unknown>(wordSourceTextRoot);
    for (const [key, value] of entries)
      if (!map.has(key)) {
        map.set(key, value);
        added.add(value.pair ?? key);
      }
  });
  return added.size;
}

export function hasWordSourceText(doc: Y.Doc, story: string) {
  return (
    [...(sourceBindings(doc)?.values() ?? [])].some((value) => value.root === story) ||
    sourceReplacements(doc).some((value) => value.root === story)
  );
}

export interface WordSourceTextPart {
  insert: string;
  attributes?: Record<string, unknown>;
  offset: number;
  end: number;
  normalized?: boolean;
  pair?: string;
  raw?: string;
  fallback?: 'field' | 'line-break';
}

function resolveBinding(doc: Y.Doc, map: ReadonlyMap<string, Binding>, item: Y.Item, at: number) {
  let client = item.id.client,
    clock = item.id.clock + at;
  const seen = new Set<string>();
  for (;;) {
    const key = identity(client, clock),
      binding = map.get(key);
    if (binding) return binding;
    if (seen.has(key)) return undefined;
    seen.add(key);
    if (!doc.share.has(wordSourceTextRedoneRoot)) return undefined;
    const parent = doc.getMap<unknown>(wordSourceTextRedoneRoot).get(key);
    if (parent === undefined) return undefined;
    [client, clock] = sourceItemIdentity.parse(parent);
  }
}

/** Physical source ranges paired with canonical display text. Raw payloads stay untouched. */
export function wordSourceTextParts(text: Y.Text): WordSourceTextPart[] | undefined {
  const doc = text.doc;
  if (!doc) return undefined;
  const map = sourceBindings(doc);
  const root = Y.createRelativePositionFromTypeIndex(text, 0).tname;
  if (
    (!map || ![...map.values()].some((value) => value.root === root)) &&
    !sourceReplacements(doc).some((value) => value.root === root)
  )
    return undefined;
  const result: WordSourceTextPart[] = [];
  const attributes: Record<string, unknown> = {};
  let offset = 0;
  const append = (part: WordSourceTextPart) => {
    const previous = result.at(-1);
    if (
      part.pair &&
      previous?.pair === part.pair &&
      previous.raw === '\r' &&
      part.raw === '\n' &&
      previous.end === part.offset &&
      previous.end - previous.offset === 1 &&
      previous.insert === part.insert &&
      sourceFormattingKey(previous.attributes ?? {}) === sourceFormattingKey(part.attributes ?? {})
    ) {
      previous.end = part.end;
      previous.raw = (previous.raw ?? '') + (part.raw ?? '');
    } else result.push(part);
  };
  for (let item = text._start; item; item = item.right) {
    if (item.deleted) continue;
    if (item.content instanceof Y.ContentFormat) {
      if (item.content.value === null) delete attributes[item.content.key];
      else attributes[item.content.key] = item.content.value;
    } else if (item.countable) {
      if (!(item.content instanceof Y.ContentString)) throw new Error('Only text is supported.');
      const value = item.content.str;
      let from = 0;
      const plain = (to: number) => {
        if (to > from)
          append({
            insert: value.slice(from, to),
            attributes: { ...attributes },
            offset: offset + from,
            end: offset + to,
          });
        from = to;
      };
      for (const match of value.matchAll(/[\r\n]/g)) {
        const binding = map && resolveBinding(doc, map, item, match.index);
        if (
          !binding ||
          binding.root !== root ||
          binding.source !== attributes.wordSource ||
          binding.before !== match[0]
        ) {
          if (match[0] !== '\r') continue;
          plain(match.index);
          const changedMeaning = [...(map?.values() ?? [])].some(
            (entry) =>
              entry.root === root &&
              entry.source === attributes.wordSource &&
              entry.before === '\r' &&
              entry.after === ' ',
          );
          append({
            insert: '\u2028',
            attributes: { ...attributes },
            offset: offset + from,
            end: offset + from + 1,
            normalized: true,
            raw: match[0],
            ...(changedMeaning ? { fallback: 'line-break' as const } : {}),
          });
          from++;
          continue;
        }
        plain(match.index);
        append({
          insert: binding.after,
          attributes: { ...attributes },
          offset: offset + from,
          end: offset + from + 1,
          normalized: true,
          raw: match[0],
          ...(binding.pair ? { pair: binding.pair } : {}),
        });
        from++;
      }
      plain(value.length);
      offset += value.length;
    }
  }
  return projectWordSourceReplacements(
    text,
    retainSourceTableBoundaries(text, result, sourceTextParagraphs(result)),
  );
}

/** Semantic paragraph ranges for display only; deletion witnesses keep their raw ranges. */
export function sourceTextParagraphs(parts: readonly WordSourceTextPart[]) {
  const result: { start: number; end: number; attributes?: Record<string, unknown> }[] = [];
  let start = 0;
  for (const part of parts)
    for (let at = part.insert.indexOf('\n'); at >= 0; at = part.insert.indexOf('\n', at + 1)) {
      const end = part.offset + at + 1;
      result.push({ start, end, ...(part.attributes ? { attributes: part.attributes } : {}) });
      start = end;
    }
  return result;
}

export function sourceTableParagraphs(text: Y.Text) {
  const parts = wordSourceTextParts(text);
  return parts
    ? sourceTextParagraphs(parts).map(({ start, end, attributes }) => ({
        start,
        end,
        ...(attributes?.table ? { table: attributes.table as TableCell } : {}),
      }))
    : undefined;
}
