import * as Y from 'yjs';
import * as z from 'zod';
import { sourceBindings, wordSourceTextRedoneRoot } from './source-text.ts';
import { sourceReplacementReferences } from './source-replacement.ts';

function references(doc: Y.Doc) {
  return new Map<string, { root: string; before: string }>([
    ...(sourceBindings(doc) ?? []),
    ...sourceReplacementReferences(doc),
  ]);
}

const id = z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]);
const key = (client: number, clock: number) => JSON.stringify([client, clock]);
const provenance = Symbol('source text provenance');

function itemAt(doc: Y.Doc, client: number, clock: number) {
  const structs = doc.store.clients.get(client);
  if (!structs?.length || clock >= structs.at(-1)!.id.clock + structs.at(-1)!.length)
    return undefined;
  const value = structs[Y.findIndexSS(structs, clock)];
  return value instanceof Y.Item ? value : undefined;
}

/** Undo's local redone links must become explicit wire provenance, never guessed from insertion anchors. */
export function retainWordSourceTextUndo(doc: Y.Doc) {
  const original = references(doc);
  if (!original.size) return;
  const links = doc.share.has(wordSourceTextRedoneRoot)
    ? doc.getMap<unknown>(wordSourceTextRedoneRoot)
    : undefined;
  const additions: [string, [number, number]][] = [];
  for (const source of [...original.keys(), ...(links?.keys() ?? [])]) {
    const [client, clock] = id.parse(JSON.parse(source)),
      item = itemAt(doc, client, clock);
    if (!item?.redone) continue;
    const nextClock = item.redone.clock + clock - item.id.clock;
    const target = key(item.redone.client, nextClock);
    if (!original.has(target) && !links?.has(target)) additions.push([target, [client, clock]]);
  }
  if (additions.length)
    doc.transact(() => {
      const map = doc.getMap<unknown>(wordSourceTextRedoneRoot);
      for (const [name, value] of additions) map.set(name, value);
    }, provenance);
}

/** A client can append provenance for a copied, deleted source Item, but cannot rewrite existing links. */
export function validateWordSourceTextUndo(candidate: Y.Doc, previous: Y.Doc) {
  const before = previous.share.has(wordSourceTextRedoneRoot)
    ? previous.getMap<unknown>(wordSourceTextRedoneRoot)
    : undefined;
  const after = candidate.share.has(wordSourceTextRedoneRoot)
    ? candidate.getMap<unknown>(wordSourceTextRedoneRoot)
    : undefined;
  for (const [name, value] of before ?? [])
    if (JSON.stringify(after?.get(name)) !== JSON.stringify(value))
      throw new Error('Source undo provenance cannot be edited.');
  const additions = [...(after ?? [])].filter(([name]) => !before?.has(name));
  validateAmbiguousSourceReplacements(candidate, previous);
  if (!additions.length) return;
  const original = references(previous);
  for (const [name, value] of additions) {
    if (original.has(name)) throw new Error('Original source provenance cannot be replaced.');
    const [client, clock] = id.parse(JSON.parse(name)),
      parent = id.parse(value);
    const old = itemAt(candidate, ...parent),
      restored = itemAt(candidate, client, clock);
    if (
      !old?.deleted ||
      !restored ||
      !(restored.content instanceof Y.ContentString) ||
      restored.rightOrigin?.client !== parent[0] ||
      restored.rightOrigin.clock + clock - restored.id.clock !== parent[1]
    )
      throw new Error('Invalid source undo provenance.');
    let ancestor = key(...parent),
      binding = original?.get(ancestor);
    const seen = new Set<string>();
    while (!binding && !seen.has(ancestor)) {
      seen.add(ancestor);
      const link = after?.get(ancestor);
      if (!link) break;
      ancestor = key(...id.parse(link));
      binding = original?.get(ancestor);
    }
    const parentName =
      restored.parent instanceof Y.Text
        ? Y.createRelativePositionFromTypeIndex(restored.parent, 0).tname
        : undefined;
    if (
      !binding ||
      binding.root !== parentName ||
      restored.content.str[clock - restored.id.clock] !== binding.before
    )
      throw new Error('Invalid source undo provenance.');
  }
}

/** Old clients send no undo provenance. Keep ambiguous raw replacements unacknowledged. */
function validateAmbiguousSourceReplacements(candidate: Y.Doc, previous: Y.Doc) {
  const original = sourceBindings(previous);
  if (!original?.size) return;
  const ambiguous = new Map<string, Set<string>>();
  for (const [name, binding] of original) {
    if (binding.after !== ' ') continue;
    const item = itemAt(candidate, ...id.parse(JSON.parse(name)));
    if (!item?.deleted) continue;
    const values = ambiguous.get(binding.root) ?? new Set<string>();
    values.add(JSON.stringify([binding.source, binding.before]));
    ambiguous.set(binding.root, values);
  }
  if (!ambiguous.size) return;
  const clocks = Y.decodeStateVector(Y.encodeStateVector(previous));
  const links = candidate.share.has(wordSourceTextRedoneRoot)
    ? candidate.getMap<unknown>(wordSourceTextRedoneRoot)
    : undefined;
  for (const [root, values] of ambiguous) {
    const text = candidate.getText(root),
      attributes: Record<string, unknown> = {};
    for (let item = text._start; item; item = item.right) {
      if (item.deleted) continue;
      if (item.content instanceof Y.ContentFormat) {
        if (item.content.value === null) delete attributes[item.content.key];
        else attributes[item.content.key] = item.content.value;
      } else if (item.content instanceof Y.ContentString) {
        const first = Math.max(0, (clocks.get(item.id.client) ?? 0) - item.id.clock);
        for (const match of item.content.str.slice(first).matchAll(/[\r\n]/g)) {
          const name = key(item.id.client, item.id.clock + first + match.index);
          if (
            !original.has(name) &&
            !links?.has(name) &&
            values.has(JSON.stringify([attributes.wordSource, match[0]]))
          )
            throw new Error('Ambiguous legacy source edit. Keep the pending edit for recovery.');
        }
      }
    }
  }
}
