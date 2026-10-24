import type * as Y from "yjs";
import type { TableCell } from "../tables.ts";
import type { TableRecord } from "./schema.ts";

type ReadCache = {
  active: boolean;
  valid: boolean;
  records: Map<string, { key: string; value: TableRecord }[]>;
  sourceCells: Map<string, TableCell | undefined>;
  paragraphs: WeakMap<Y.Text, { start: number; end: number; table?: TableCell }[]>;
};
const caches = new WeakMap<Y.Doc, ReadCache>();

/** Reuse immutable reads between transactions. Reads during a write never reuse cached state. */
export function structuredReadCache(doc: Y.Doc): ReadCache {
  let cache = caches.get(doc);
  if (cache) return cache;
  cache = {
    active: doc._transaction !== null,
    valid: false,
    records: new Map(),
    sourceCells: new Map(),
    paragraphs: new WeakMap(),
  };
  caches.set(doc, cache);
  const current = cache;
  const clear = () => {
    current.valid = false;
    current.records.clear();
    current.sourceCells.clear();
    current.paragraphs = new WeakMap();
  };
  doc.on("beforeTransaction", () => {
    current.active = true;
    clear();
  });
  doc.on("afterTransaction", () => {
    current.active = false;
    clear();
  });
  return cache;
}
