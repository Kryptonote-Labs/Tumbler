import * as Y from 'yjs';
import * as z from 'zod';
import { sourceFormattingKey, stableSourceValue } from './source-formatting.ts';
import { wordSourceTextRedoneRoot, type WordSourceTextPart } from './source-text.ts';

export const wordSourceReplacementRoot = 'word-source-replacements-v1';
const id = z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]);
const schema = z
  .object({
    root: z.string(),
    value: z.string().length(1),
    attributes: z.record(z.string(), z.unknown()),
    ranges: z
      .array(
        z
          .object({
            client: z.number().int().nonnegative(),
            clock: z.number().int().nonnegative(),
            before: z.string().min(1),
            source: z.number().int(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();
type Replacement = z.infer<typeof schema>;
const caches = new WeakMap<Y.Doc, Replacement[]>();
const observed = new WeakSet<Y.Map<unknown>>();

export function sourceReplacements(doc: Y.Doc) {
  if (!doc.share.has(wordSourceReplacementRoot)) return [];
  let found = caches.get(doc);
  if (!found) {
    const root = doc.getMap<unknown>(wordSourceReplacementRoot);
    found = [...root.values()].map((value) => schema.parse(value));
    caches.set(doc, found);
    if (!observed.has(root)) {
      observed.add(root);
      root.observe(() => caches.delete(doc));
    }
  }
  return found;
}

/** Project a complete cached source result as one object, retaining its editable character IDs. */
export function bindWordSourceReplacement(
  text: Y.Text,
  start: number,
  count: number,
  value: string,
  attributes: Record<string, unknown>,
) {
  const doc = text.doc;
  if (
    !doc ||
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(count) ||
    start < 0 ||
    count < 1 ||
    start + count > text.length
  )
    throw new RangeError('Invalid source replacement range.');
  const root = Y.createRelativePositionFromTypeIndex(text, 0).tname;
  if (root === null) throw new Error('Source replacement needs a named root.');
  const ranges: Replacement['ranges'] = [],
    format: Record<string, unknown> = {};
  let offset = 0;
  for (let item = text._start; item; item = item.right) {
    if (item.deleted) continue;
    if (item.content instanceof Y.ContentFormat) {
      if (item.content.value === null) delete format[item.content.key];
      else format[item.content.key] = item.content.value;
    } else if (item.countable) {
      if (!(item.content instanceof Y.ContentString)) throw new Error('Only text is supported.');
      const from = Math.max(start, offset),
        to = Math.min(start + count, offset + item.length);
      if (to > from) {
        if (typeof format.wordSource !== 'number')
          throw new Error('Replacement characters need source provenance.');
        ranges.push({
          client: item.id.client,
          clock: item.id.clock + from - offset,
          before: item.content.str.slice(from - offset, to - offset),
          source: format.wordSource,
        });
      }
      offset += item.length;
    }
  }
  const replacement = schema.parse({ root, ranges, value, attributes });
  const key = JSON.stringify([
    root,
    ranges.map((range) => [range.client, range.clock, range.before.length]),
  ]);
  const map = doc.getMap<unknown>(wordSourceReplacementRoot);
  if (map.has(key)) {
    if (stableSourceValue(map.get(key)) !== stableSourceValue(replacement))
      throw new Error('Conflicting source replacements.');
    return false;
  }
  map.set(key, replacement);
  return true;
}

export function hasWordSourceReplacement(text: Y.Text, source: number) {
  const doc = text.doc;
  if (!doc) return false;
  const root = Y.createRelativePositionFromTypeIndex(text, 0).tname;
  return sourceReplacements(doc).some(
    (value) => value.root === root && value.attributes.wordSource === source,
  );
}

export function* sourceReplacementReferences(doc: Y.Doc) {
  for (const replacement of sourceReplacements(doc))
    for (const range of replacement.ranges)
      for (let at = 0; at < range.before.length; at++)
        yield [
          JSON.stringify([range.client, range.clock + at]),
          { root: replacement.root, before: range.before[at]! },
        ] as const;
}

function ancestors(doc: Y.Doc, item: Y.Item, at: number) {
  const result: string[] = [],
    seen = new Set<string>();
  let key = JSON.stringify([item.id.client, item.id.clock + at]);
  const links = doc.share.has(wordSourceTextRedoneRoot)
    ? doc.getMap<unknown>(wordSourceTextRedoneRoot)
    : undefined;
  while (!seen.has(key)) {
    result.push(key);
    seen.add(key);
    const parent = links?.get(key);
    if (!parent) break;
    key = JSON.stringify(id.parse(parent));
  }
  return result;
}

/** Partial or edited cached results stay literal; only a complete, contiguous source group becomes an object. */
export function projectWordSourceReplacements(text: Y.Text, parts: readonly WordSourceTextPart[]) {
  const doc = text.doc!,
    root = Y.createRelativePositionFromTypeIndex(text, 0).tname;
  const replacements = sourceReplacements(doc).filter((value) => value.root === root);
  if (!replacements.length) return [...parts];
  const overlays: {
    start: number;
    end: number;
    value: string;
    attributes: Record<string, unknown>;
  }[] = [];
  const fallbacks: { start: number; end: number }[] = [];
  for (const replacement of replacements) {
    const expected = new Map<string, { index: number; before: string; source: number }>();
    let length = 0;
    for (const range of replacement.ranges)
      for (let at = 0; at < range.before.length; at++)
        expected.set(JSON.stringify([range.client, range.clock + at]), {
          index: length++,
          before: range.before[at]!,
          source: range.source,
        });
    const matches: { index: number; offset: number; attributes: Record<string, unknown> }[] = [];
    const sources = new Set(replacement.ranges.map((range) => range.source));
    const candidates: { start: number; end: number; value: string }[] = [];
    const attributes: Record<string, unknown> = {};
    let offset = 0;
    for (let item = text._start; item; item = item.right) {
      if (item.deleted) continue;
      if (item.content instanceof Y.ContentFormat) {
        if (item.content.value === null) delete attributes[item.content.key];
        else attributes[item.content.key] = item.content.value;
      } else if (item.countable) {
        if (!(item.content instanceof Y.ContentString)) throw new Error('Only text is supported.');
        if (typeof attributes.wordSource === 'number' && sources.has(attributes.wordSource)) {
          const previous = candidates.at(-1);
          if (previous?.end === offset) {
            previous.end += item.length;
            previous.value += item.content.str;
          } else
            candidates.push({ start: offset, end: offset + item.length, value: item.content.str });
          for (let at = 0; at < item.length; at++) {
            const source = ancestors(doc, item, at)
              .map((key) => expected.get(key))
              .find((value) => value !== undefined);
            if (
              source &&
              source.source === attributes.wordSource &&
              source.before === item.content.str[at]
            )
              matches.push({
                index: source.index,
                offset: offset + at,
                attributes: { ...attributes },
              });
          }
        }
        offset += item.length;
      }
    }
    if (
      matches.length !== length ||
      matches.some(
        (value, index) => value.index !== index || value.offset !== matches[0]!.offset + index,
      )
    ) {
      const cached = replacement.ranges.map((range) => range.before).join('');
      fallbacks.push(...candidates.filter((candidate) => candidate.value === cached));
      continue;
    }
    // A field object has one style. Keep partial offline formatting as literal runs.
    const style = sourceFormattingKey(matches[0]!.attributes);
    if (matches.some((match) => sourceFormattingKey(match.attributes) !== style)) continue;
    const start = matches[0]!.offset,
      end = start + length;
    // A historical table baseline can retain a paragraph boundary inside this cache.
    if (parts.some((part) => part.offset < end && part.end > start && part.insert.includes('\n')))
      continue;
    overlays.push({
      start,
      end,
      value: replacement.value,
      attributes: { ...matches[0]!.attributes, ...replacement.attributes },
    });
  }
  const marked = parts.map((part) =>
    fallbacks.some((range) => part.offset >= range.start && part.end <= range.end)
      ? { ...part, fallback: 'field' as const }
      : part,
  );
  if (!overlays.length) return marked;
  overlays.sort((a, b) => a.start - b.start);
  if (overlays.some((value, index) => index > 0 && value.start < overlays[index - 1]!.end))
    throw new Error('Source replacements overlap.');
  const result: WordSourceTextPart[] = [];
  let index = 0;
  for (const part of marked) {
    let at = part.offset;
    while (index < overlays.length && overlays[index]!.end <= at) index++;
    while (at < part.end) {
      const overlay = overlays[index];
      if (!overlay || overlay.start >= part.end) {
        result.push({
          ...part,
          offset: at,
          insert: part.normalized ? part.insert : part.insert.slice(at - part.offset),
        });
        break;
      }
      if (at < overlay.start) {
        result.push({
          ...part,
          offset: at,
          end: overlay.start,
          insert: part.normalized
            ? part.insert
            : part.insert.slice(at - part.offset, overlay.start - part.offset),
        });
        at = overlay.start;
      }
      if (at === overlay.start)
        result.push({
          insert: overlay.value,
          attributes: overlay.attributes,
          offset: overlay.start,
          end: overlay.end,
          normalized: true,
        });
      at = Math.min(part.end, overlay.end);
      if (at >= overlay.end) index++;
    }
  }
  return result;
}
