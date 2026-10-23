import type * as Y from "yjs";
import { tableParagraphs, type TableCell } from "../tables.ts";
import type { WordDelta } from "../commands.ts";
import { structuredGrid } from "./grid.ts";
import { structuredColumnWidths } from "./widths.ts";
import {
  activeAxes,
  cellFormatName,
  cellName,
  existingText,
  isTableRemoved,
  payload,
  tableName,
  tableRecords,
  validateStructuredTables,
  type CellAddress,
  type TableAddress,
} from "./state.ts";

export type WordViewSpan = {
  start: number;
  end: number;
  root: string;
  offset: number;
  cell?: CellAddress;
  virtual?: boolean;
};
export type WordViewTable = {
  table: TableAddress;
  start: number;
  end: number;
  offset: number;
  container?: CellAddress;
};

/** A local linear view for existing editors. Only the source document is synchronized. */
export function projectWordSharedText(doc: Y.Doc, story: string) {
  validateStructuredTables(doc);
  const delta: WordDelta = [];
  const spans: WordViewSpan[] = [];
  const tables: WordViewTable[] = [];
  const paragraphs = new Map<string, ReturnType<typeof tableParagraphs>>();
  const rootParts = new WeakMap<
    Y.Text,
    { insert: string; attributes?: Record<string, unknown>; offset: number; end: number }[]
  >();
  let length = 0;
  const append = (
    insert: string,
    attributes: Record<string, unknown> | undefined,
    span: Omit<WordViewSpan, "start" | "end">,
  ) => {
    if (!insert) return;
    delta.push({ insert, ...(attributes && Object.keys(attributes).length ? { attributes } : {}) });
    spans.push({ ...span, start: length, end: length + insert.length });
    length += insert.length;
  };
  const parts = (text: Y.Text, start: number, end: number) => {
    let indexed = rootParts.get(text);
    if (!indexed) {
      let offset = 0;
      indexed = (text.toDelta() as { insert: string; attributes?: Record<string, unknown> }[]).map(
        (part) => {
          const start = offset;
          offset += part.insert.length;
          return { ...part, offset: start, end: offset };
        },
      );
      rootParts.set(text, indexed);
    }
    let low = 0,
      high = indexed.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (indexed[middle]!.end <= start) low = middle + 1;
      else high = middle;
    }
    const result: { insert: string; attributes?: Record<string, unknown>; offset: number }[] = [];
    for (let index = low; index < indexed.length && indexed[index]!.offset < end; index++) {
      const part = indexed[index]!,
        from = Math.max(start, part.offset),
        to = Math.min(end, part.end);
      if (to > from)
        result.push({
          ...part,
          insert: part.insert.slice(from - part.offset, to - part.offset),
          offset: from,
        });
    }
    return result;
  };
  const visit = (
    root: string,
    start: number,
    end: number,
    parents: TableCell[] = [],
    cell?: CellAddress,
  ) => {
    const text = existingText(doc, root);
    if (!text) return;
    let rows = paragraphs.get(root);
    if (!rows) paragraphs.set(root, (rows = tableParagraphs(text)));
    let cursor = start;
    for (const p of rows) {
      if (p.end <= cursor || p.start >= end) continue;
      const lineage = [...(p.table?.parents ?? []), ...(p.table ? [p.table] : [])];
      const nested = lineage.find((ref) => !parents.some((parent) => parent.id === ref.id));
      const address = nested && { story: root, table: nested.id };
      if (address && doc.share.has(tableName(address)) && doc.getMap(tableName(address)).size) {
        const members = rows.filter(
          (row) =>
            row.table?.id === address.table ||
            row.table?.parents?.some((ref) => ref.id === address.table),
        );
        const boundary: WordViewTable = {
          table: address,
          start: length,
          end: length,
          offset: members[0]!.start,
          ...(cell ? { container: cell } : {}),
        };
        tables.push(boundary);
        emitTable(address, parents);
        boundary.end = length;
        cursor = members.at(-1)!.end;
        continue;
      }
      const from = Math.max(cursor, p.start),
        to = Math.min(end, p.end);
      for (const part of parts(text, from, to)) {
        const attributes = { ...part.attributes };
        if (part.insert.includes("\n") && parents.length) {
          const own = parents.at(-1)!;
          const raw = p.table;
          attributes.table =
            raw && raw.id !== own.id
              ? {
                  ...raw,
                  parents: [
                    ...parents,
                    ...(raw.parents ?? []).filter(
                      (ref) => !parents.some((parent) => parent.id === ref.id),
                    ),
                  ],
                }
              : { ...own, ...(parents.length > 1 ? { parents: parents.slice(0, -1) } : {}) };
        }
        const legacy =
          !cell && p.table
            ? {
                story: root,
                table: p.table.id,
                row: p.table.row,
                column: `base-${p.table.column}`,
              }
            : undefined;
        append(part.insert, attributes, {
          root,
          offset: part.offset,
          ...(cell || legacy ? { cell: cell ?? legacy! } : {}),
        });
      }
      cursor = to;
    }
    if (cursor < end)
      for (const part of parts(text, cursor, end))
        append(part.insert, part.attributes, {
          root,
          offset: part.offset,
          ...(cell ? { cell } : {}),
        });
  };
  const emitTable = (address: TableAddress, parents: TableCell[]) => {
    if (isTableRemoved(doc, address)) return;
    const grid = structuredGrid(doc, address);
    const columns = activeAxes(doc, address, "column");
    const widths = structuredColumnWidths(doc, address);
    const records = tableRecords(doc, address);
    for (const row of grid)
      for (const cell of row.cells) {
        const format = records.find(
          (r) =>
            r.value.kind === "cell-format" &&
            r.value.cell === (cell.source?.cell ?? JSON.stringify([row.id, cell.address.column])),
        )?.value;
        const rowFormat = records.find(
          (r) => r.value.kind === "row-format" && r.value.row === row.id,
        )?.value;
        const reference: TableCell = {
          id: address.table,
          row: row.id,
          cell: cell.source?.cell ?? `cell-${row.id}-${cell.address.column}`,
          column: columns.indexOf(cell.columns[0]!),
          columns: columns.length,
          ...(widths ? { widths } : {}),
          ...(row.before ? { before: row.before } : {}),
          ...(row.after ? { after: row.after } : {}),
          ...(cell.columns.length > 1 ? { span: cell.columns.length } : {}),
          ...(cell.verticalMerge ? { merge: cell.verticalMerge } : {}),
          ...(cell.source?.source ? { source: cell.source.source } : {}),
          ...(format?.kind === "cell-format"
            ? { format: format.format }
            : cell.source?.format
              ? { format: cell.source.format }
              : {}),
          ...(rowFormat?.kind === "row-format"
            ? { rowFormat: rowFormat.format }
            : cell.source?.rowFormat
              ? { rowFormat: cell.source.rowFormat }
              : {}),
        };
        for (const owner of cell.payloads) {
          const value = payload(doc, owner);
          const root = value?.source ? address.story : cellName(owner);
          if (value)
            visit(
              root,
              value.start,
              value.end + (value.source ? 1 : 0),
              [...parents, reference],
              owner,
            );
          if (!value?.source) {
            const attributes = doc.share.has(cellFormatName(owner))
              ? Object.fromEntries(doc.getMap(cellFormatName(owner)))
              : {};
            append(
              "\n",
              { ...attributes, table: { ...reference, ...(parents.length ? { parents } : {}) } },
              {
                root,
                offset: value?.end ?? 0,
                cell: owner,
                virtual: true,
              },
            );
          }
        }
      }
  };
  const text = existingText(doc, story);
  if (!text) throw new Error("Missing document story.");
  visit(story, 0, text.length);
  return { delta, spans, tables, length };
}
