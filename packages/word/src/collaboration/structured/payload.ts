import * as Y from "yjs";
import { isTableCell, tableParagraphs, type TableCell } from "../tables.ts";
import {
  tableBase,
  tableRecords,
  existingText,
  cellName,
  cellFormatName,
} from "./state.ts";
import {
  WordTableConflict,
  type CellAddress,
  type TableAddress,
} from "./schema.ts";
export function sourceCell(doc: Y.Doc, address: CellAddress) {
  const base = tableBase(doc, address),
    index = base.columns.indexOf(address.column);
  const cell = base.cells.find(
    (cell) =>
      cell.row === address.row &&
      cell.column <= index &&
      cell.column + (cell.span ?? 1) > index,
  );
  if (
    cell &&
    index !== cell.column &&
    tableRecords(doc, address).some(
      (r) => r.value.kind === "split" && r.value.cell === cell.cell,
    )
  )
    return undefined;
  return cell;
}
export function payload(
  doc: Y.Doc,
  address: CellAddress,
):
  { text: Y.Text; start: number; end: number; source?: TableCell } | undefined {
  const source = sourceCell(doc, address);
  if (source) {
    const text = existingText(doc, address.story)!;
    const members = tableParagraphs(text).filter(
      (p) =>
        (p.table?.id === address.table && p.table.cell === source.cell) ||
        p.table?.parents?.some(
          (c) => c.id === address.table && c.cell === source.cell,
        ),
    );
    if (!members.length)
      throw new WordTableConflict(
        address,
        "legacy-writer",
        "Migrated source cell was removed by an incompatible writer.",
      );
    return {
      text,
      start: members[0]!.start,
      end: members.at(-1)!.end - 1,
      source,
    };
  }
  const text = existingText(doc, cellName(address));
  return text ? { text, start: 0, end: text.length } : undefined;
}
export function payloadDelta(
  doc: Y.Doc,
  address: CellAddress,
  projection = false,
) {
  const value = payload(doc, address);
  if (!value) return [];
  let offset = 0;
  return value.text
    .toDelta()
    .flatMap(
      (part: { insert: string; attributes?: Record<string, unknown> }) => {
        const from = Math.max(value.start - offset, 0),
          to = Math.min(
            value.end + (projection && value.source ? 1 : 0) - offset,
            part.insert.length,
          );
        offset += part.insert.length;
        if (to <= from) return [];
        const { table: rawTable, ...attributes } = part.attributes ?? {};
        if (
          projection &&
          isTableCell(rawTable) &&
          rawTable.id !== address.table
        ) {
          const parents = rawTable.parents ?? [];
          const index = parents.findIndex(
            (parent) => parent.id === address.table,
          );
          const { parents: _parents, ...nested } = rawTable;
          Object.assign(attributes, {
            table: {
              ...nested,
              ...(index >= 0 && parents.length > index + 1
                ? { parents: parents.slice(index + 1) }
                : {}),
            },
          });
        }
        return [
          {
            insert: part.insert.slice(from, to),
            ...(Object.keys(attributes).length ? { attributes } : {}),
          },
        ];
      },
    )
    .concat(
      projection && !value.source
        ? [
            {
              insert: "\n",
              attributes: doc.share.has(cellFormatName(address))
                ? Object.fromEntries(
                    doc.getMap<unknown>(cellFormatName(address)),
                  )
                : {},
            },
          ]
        : [],
    );
}
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, part: unknown) =>
    part && typeof part === "object" && !Array.isArray(part)
      ? Object.fromEntries(
          Object.entries(part).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
        )
      : part,
  );
}
export function isTableRemoved(doc: Y.Doc, address: TableAddress) {
  return tableRecords(doc, address).some(
    (r) => r.value.kind === "remove-table",
  );
}
export function payloadSignature(doc: Y.Doc, address: CellAddress) {
  const value = payload(doc, address);
  const descendants = new Map<string, unknown>();
  const visit = (text: Y.Text, start: number, end: number) => {
    const story = Y.createRelativePositionFromTypeIndex(text, 0).tname!;
    for (const p of tableParagraphs(text)) {
      if (p.start < start || p.end > end || !p.table) continue;
      const lineage = [...(p.table.parents ?? []), p.table];
      const owner =
        story === address.story
          ? lineage.findIndex((cell) => cell.id === address.table)
          : -1;
      for (const nested of lineage.slice(owner + 1)) {
        if (story === address.story && nested.id === address.table) continue;
        const key = JSON.stringify([story, nested.id]);
        if (descendants.has(key)) continue;
        const records = tableRecords(doc, { story, table: nested.id }).sort(
          (a, b) => (a.key < b.key ? -1 : 1),
        );
        const roots: { name: string; value: unknown }[] = [];
        descendants.set(key, { records, roots });
        for (const name of [...doc.share.keys()].sort()) {
          if (
            !name.startsWith("word-cell-v2:") &&
            !name.startsWith("word-cell-format-v2:")
          )
            continue;
          const tuple: unknown = JSON.parse(name.slice(name.indexOf(":") + 1));
          if (
            !Array.isArray(tuple) ||
            tuple[0] !== story ||
            tuple[1] !== nested.id
          )
            continue;
          if (name.startsWith("word-cell-v2:")) {
            const root = existingText(doc, name)!;
            roots.push({ name, value: root.toDelta() });
            visit(root, 0, root.length);
          } else
            roots.push({
              name,
              value: Object.fromEntries(doc.getMap<unknown>(name)),
            });
        }
      }
    }
  };
  if (value) visit(value.text, value.start, value.end + (value.source ? 1 : 0));
  let terminal: Record<string, unknown> = {};
  if (value?.source) {
    let offset = 0;
    for (const part of value.text.toDelta()) {
      if (typeof part.insert !== "string") continue;
      if (offset <= value.end && offset + part.insert.length > value.end) {
        terminal = part.attributes ?? {};
        break;
      }
      offset += part.insert.length;
    }
  } else if (doc.share.has(cellFormatName(address)))
    terminal = Object.fromEntries(doc.getMap<unknown>(cellFormatName(address)));
  return stableStringify({
    content: payloadDelta(doc, address),
    terminal,
    descendants: Object.fromEntries(
      [...descendants].sort(([a], [b]) => (a < b ? -1 : 1)),
    ),
  });
}
