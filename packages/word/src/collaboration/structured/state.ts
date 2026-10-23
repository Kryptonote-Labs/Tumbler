import * as Y from "yjs";
import { z } from "zod";
import {
  tableParagraphs,
  groupTableParagraphs,
  MAX_TABLE_COLUMNS,
  type TableCell,
} from "../tables.ts";
import {
  id,
  storyId,
  recordSchema,
  WordTableConflict,
  type TableAddress,
  type CellAddress,
  type TableRecord,
  type TableBase,
} from "./schema.ts";
import { stableStringify } from "./payload.ts";
import { structuredReadCache } from "./read-cache.ts";
export {
  WordTableConflict,
  type TableAddress,
  type CellAddress,
  type TableRecord,
  type TableBase,
} from "./schema.ts";
export {
  sourceCell,
  payload,
  payloadDelta,
  payloadSignature,
  stableStringify,
  isTableRemoved,
} from "./payload.ts";
export { validateStructuredTables } from "./validation.ts";
const prefix = "word-table-v2:";
export const tableName = (address: TableAddress) =>
  prefix + JSON.stringify([address.story, address.table]);
export { cellName, cellFormatName, cellAddressFromName } from "./names.ts";
export const cellKey = (row: string, column: string) => JSON.stringify([row, column]);
export function existingText(doc: Y.Doc, name: string) {
  return doc.share.has(name) ? doc.getText(name) : undefined;
}
const parsedRecords = new WeakMap<object, TableRecord>();
function freezeRecord(value: unknown): void {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) freezeRecord(child);
  }
}
export function tableRecords(doc: Y.Doc, address: TableAddress) {
  const cache = structuredReadCache(doc),
    name = tableName(address);
  const cached = !cache.active && cache.records.get(name);
  if (cached) return cached;
  if (!doc.share.has(tableName(address))) return [];
  const result = [...doc.getMap<unknown>(tableName(address)).entries()].map(([key, value]) => {
    if (value && typeof value === "object") {
      const cached = parsedRecords.get(value);
      if (cached) return { key, value: cached };
    }
    const parsed = recordSchema.safeParse(value);
    if (!parsed.success)
      throw new WordTableConflict(address, "schema", "Invalid structured table record.");
    freezeRecord(parsed.data);
    if (value && typeof value === "object") parsedRecords.set(value, parsed.data);
    return { key, value: parsed.data };
  });
  if (!cache.active) cache.records.set(name, result);
  return result;
}
export function tableAddresses(doc: Y.Doc): TableAddress[] {
  return [...doc.share.keys()]
    .filter((name) => name.startsWith(prefix) && doc.getMap(name).size > 0)
    .map((name) => {
      const parsed: unknown = JSON.parse(name.slice(prefix.length));
      const [story, table] = z.tuple([storyId, id]).parse(parsed);
      return { story, table };
    });
}
export function tableBase(doc: Y.Doc, address: TableAddress): TableBase {
  const bases = tableRecords(doc, address).flatMap((r) =>
    r.value.kind === "base" ? [r.value] : [],
  );
  if (bases.length !== 1)
    throw new WordTableConflict(
      address,
      "migration",
      "Missing or conflicting table migration baselines.",
    );
  return bases[0]!;
}
/** Baseline cells remain in the body so simultaneous migration never seeds duplicate text. */
export function migrateTable(doc: Y.Doc, address: TableAddress) {
  const text = existingText(doc, address.story);
  if (!text) throw new WordTableConflict(address, "migration", "Missing source story.");
  const paragraphs = tableParagraphs(text);
  groupTableParagraphs(paragraphs, { retainedBaseline: true });
  const cells = new Map<string, TableCell>();
  for (const p of paragraphs)
    for (const cell of [...(p.table?.parents ?? []), ...(p.table ? [p.table] : [])])
      if (cell.id === address.table) {
        const { schema: _schema, parents: _parents, ...base } = cell;
        cells.set(cell.cell, base);
      }
  if (!cells.size) throw new WordTableConflict(address, "migration", "Missing source table.");
  const values = [...cells.values()];
  const base: TableBase = {
    kind: "base",
    rows: [...new Set(values.map((c) => c.row))],
    columns: Array.from({ length: values[0]!.columns }, (_, i) => `base-${i}`),
    cells: values,
  };
  const records = doc.getMap<TableRecord>(tableName(address));
  // The complete canonical baseline is the key: no hash collision or competing text seed.
  records.set("base:" + stableStringify(base), base);
  for (const p of paragraphs)
    if (p.table) {
      const mark = (cell: TableCell): TableCell =>
        cell.id === address.table ? { ...cell, schema: 2 } : cell;
      text.format(p.end - 1, 1, {
        table: {
          ...mark(p.table),
          ...(p.table.parents ? { parents: p.table.parents.map(mark) } : {}),
        },
      });
    }
  tableBase(doc, address);
}
export function orderedAxes(doc: Y.Doc, address: TableAddress, dimension: "row" | "column") {
  const base = tableBase(doc, address);
  const initial = dimension === "row" ? base.rows : base.columns;
  const inserts = tableRecords(doc, address).flatMap((r) =>
    r.value.kind === "axis" && r.value.dimension === dimension ? [r.value] : [],
  );
  const ids = new Set([...initial, ...inserts.map((a) => a.id)]);
  if (ids.size !== initial.length + inserts.length)
    throw new WordTableConflict(address, "order", "Duplicate axis identity.");
  const edges = new Map([...ids].map((value) => [value, new Set<string>()]));
  const add = (left: string | null, right: string | null) => {
    if (left === null || right === null) return;
    if (!ids.has(left) || !ids.has(right))
      throw new WordTableConflict(address, "order", "Missing axis ordering witness.");
    edges.get(left)!.add(right);
  };
  initial.slice(1).forEach((right, i) => add(initial[i]!, right));
  for (const axis of inserts) {
    add(axis.left, axis.id);
    add(axis.id, axis.right);
  }
  const incoming = new Map([...ids].map((value) => [value, 0]));
  for (const rights of edges.values())
    for (const right of rights) incoming.set(right, incoming.get(right)! + 1);
  const ready = [...ids].filter((value) => incoming.get(value) === 0).sort();
  const ordered: string[] = [];
  while (ready.length) {
    const next = ready.shift()!;
    ordered.push(next);
    for (const right of edges.get(next)!) {
      incoming.set(right, incoming.get(right)! - 1);
      if (!incoming.get(right)) {
        ready.push(right);
        ready.sort();
      }
    }
  }
  if (ordered.length !== ids.size)
    throw new WordTableConflict(address, "order", "Contradictory axis order.");
  return ordered;
}
export function liveAxes(doc: Y.Doc, address: TableAddress, dimension: "row" | "column") {
  const removed = new Set(
    tableRecords(doc, address).flatMap((r) =>
      r.value.kind === "remove" && r.value.dimension === dimension ? r.value.ids : [],
    ),
  );
  return orderedAxes(doc, address, dimension).filter((value) => !removed.has(value));
}
export function activeAxes(doc: Y.Doc, address: TableAddress, dimension: "row" | "column") {
  const result = liveAxes(doc, address, dimension);
  if (!result.length || (dimension === "column" && result.length > MAX_TABLE_COLUMNS))
    throw new WordTableConflict(
      address,
      "capacity",
      "A structured table requires rows and 1 to 63 grid columns.",
    );
  return result;
}
/** Inspect retained structure even when projection/export reports a recoverable conflict. */
export function inspectWordTableState(doc: Y.Doc, address: TableAddress) {
  return {
    rows: liveAxes(doc, address, "row"),
    columns: liveAxes(doc, address, "column"),
    records: tableRecords(doc, address),
  };
}
