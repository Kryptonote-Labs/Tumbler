import * as Y from "yjs";
import { isTableCell, tableParagraphs, type TableCell } from "../tables.ts";
import {
  tableBase,
  liveAxes,
  tableRecords,
  existingText,
  cellName,
  cellFormatName,
  cellAddressFromName,
} from "./state.ts";
import { WordTableConflict, type CellAddress, type TableAddress } from "./schema.ts";
import { structuredReadCache } from "./read-cache.ts";
import { wordSourceTextParts, sourceTextParagraphs } from '../source-text.ts';
export function sourceCell(doc: Y.Doc, address: CellAddress) {
  const cache = structuredReadCache(doc),
    key = JSON.stringify(address);
  if (!cache.active && cache.sourceCells.has(key)) return cache.sourceCells.get(key);
  const base = tableBase(doc, address),
    index = base.columns.indexOf(address.column);
  const cell = base.cells.find(
    (cell) =>
      cell.row === address.row && cell.column <= index && cell.column + (cell.span ?? 1) > index,
  );
  if (cell) {
    const splits = tableRecords(doc, address).flatMap((r) =>
      r.value.kind === "split" && r.value.cell === cell.cell ? [r.value] : [],
    );
    if (new Set(splits.map((split) => split.column)).size > 1)
      throw new WordTableConflict(
        address,
        "overlap",
        "Concurrent split ownership conflicts. Split at the chosen surviving coordinate to resolve.",
      );
    const split = splits[0];
    if (split?.kind === "split" && address.column !== split.column) {
      // Keep the original deleted coordinate as a witness alias. Visible content
      // stays attached to the coordinate selected at split time, including undo.
      if (index !== cell.column || liveAxes(doc, address, "column").includes(address.column))
        return undefined;
    }
  }
  if (!cache.active) cache.sourceCells.set(key, cell);
  return cell;
}
export function payload(
  doc: Y.Doc,
  address: CellAddress,
  raw = false,
): { text: Y.Text; start: number; end: number; source?: TableCell } | undefined {
  const source = sourceCell(doc, address);
  if (source) {
    const text = existingText(doc, address.story)!;
    const cache = structuredReadCache(doc);
    const projected = !raw && tableBase(doc, address).sourceText && wordSourceTextParts(text);
    let paragraphs = projected ? sourceTextParagraphs(projected).map(({ start, end, attributes }) => ({
      start, end, ...(attributes?.table ? { table: attributes.table as TableCell } : {}),
    })) : !cache.active && cache.paragraphs.get(text);
    if (!paragraphs) {
      paragraphs = tableParagraphs(text);
      if (!cache.active) cache.paragraphs.set(text, paragraphs);
    }
    const members = paragraphs.filter(
      (p) =>
        (p.table?.id === address.table && p.table.cell === source.cell) ||
        p.table?.parents?.some((c) => c.id === address.table && c.cell === source.cell),
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
export function payloadDelta(doc: Y.Doc, address: CellAddress, projection = false, raw = false) {
  const value = payload(doc, address, raw);
  if (!value)
    return projection
      ? [
          {
            insert: "\n",
            attributes: doc.share.has(cellFormatName(address))
              ? Object.fromEntries(doc.getMap<unknown>(cellFormatName(address)))
              : {},
          },
        ]
      : [];
  let offset = 0;
  return value.text
    .toDelta()
    .flatMap((part: { insert: string; attributes?: Record<string, unknown> }) => {
      const from = Math.max(value.start - offset, 0),
        to = Math.min(
          value.end + (projection && value.source ? 1 : 0) - offset,
          part.insert.length,
        );
      offset += part.insert.length;
      if (to <= from) return [];
      const { table: rawTable, ...attributes } = part.attributes ?? {};
      if (projection && isTableCell(rawTable) && rawTable.id !== address.table) {
        const parents = rawTable.parents ?? [];
        const index = parents.findIndex((parent) => parent.id === address.table);
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
    })
    .concat(
      projection && !value.source
        ? [
            {
              insert: "\n",
              attributes: doc.share.has(cellFormatName(address))
                ? Object.fromEntries(doc.getMap<unknown>(cellFormatName(address)))
                : {},
            },
          ]
        : [],
    );
}
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, part: unknown) =>
    part && typeof part === "object" && !Array.isArray(part)
      ? Object.fromEntries(Object.entries(part).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : part,
  );
}

function sourceProjectionSignature(text: Y.Text, start: number, end: number) {
  const parts = wordSourceTextParts(text)?.filter(part => part.fallback && part.offset < end && part.end > start);
  return parts?.length ? parts.map(part => ({ start: Math.max(start, part.offset) - start,
    end: Math.min(end, part.end) - start, kind: part.fallback })) : undefined;
}
export function isTableRemoved(doc: Y.Doc, address: TableAddress) {
  return tableRecords(doc, address).some((r) => r.value.kind === "remove-table");
}
export function cellFormatting(doc: Y.Doc, address: CellAddress) {
  const key = sourceCell(doc, address)?.cell ?? JSON.stringify([address.row, address.column]);
  const record = tableRecords(doc, address).find(({ value }) => value.kind === "cell-format" && value.cell === key)?.value;
  return record?.kind === "cell-format" ? record.format : undefined;
}
function changedFormat(current: unknown, baseline: unknown) {
  return stableStringify(current ?? {}) === stableStringify(baseline ?? {}) ? undefined : current;
}
export function rowFormatting(doc: Y.Doc, address: CellAddress) {
  const record = tableRecords(doc, address).find(({ value }) => value.kind === "row-format" && value.row === address.row)?.value;
  return record?.kind === "row-format"
    ? changedFormat(record.format, tableBase(doc, address).cells.find(cell => cell.row === address.row)?.rowFormat)
    : undefined;
}
export function columnFormatting(doc: Y.Doc, address: CellAddress) {
  const base = tableBase(doc, address), widths = base.cells[0]?.widths;
  const original = widths?.length ? widths[base.columns.indexOf(address.column)] ?? widths.reduce((sum, width) => sum + width, 0) / widths.length : undefined;
  const record = tableRecords(doc, address).find(({ value }) => value.kind === "width" && value.column === address.column)?.value;
  return record?.kind === "width" && record.value !== original ? record.value : undefined;
}
export function payloadSignature(doc: Y.Doc, address: CellAddress, removed?: "row" | "column" | "table") {
  const value = payload(doc, address);
  const descendants = new Map<string, unknown>();
  const visit = (text: Y.Text, start: number, end: number) => {
    const story = Y.createRelativePositionFromTypeIndex(text, 0).tname!;
    for (const p of tableParagraphs(text)) {
      if (p.start < start || p.end > end || !p.table) continue;
      const lineage = [...(p.table.parents ?? []), p.table];
      const owner =
        story === address.story ? lineage.findIndex((cell) => cell.id === address.table) : -1;
      for (const nested of lineage.slice(owner + 1)) {
        if (story === address.story && nested.id === address.table) continue;
        const key = JSON.stringify([story, nested.id]);
        if (descendants.has(key)) continue;
        const records = tableRecords(doc, { story, table: nested.id }).sort((a, b) =>
          a.key < b.key ? -1 : 1,
        );
        const roots: { name: string; value: unknown; sourceProjection?: ReturnType<typeof sourceProjectionSignature> }[] = [];
        descendants.set(key, { records, roots });
        for (const name of [...doc.share.keys()].sort()) {
          if (!name.startsWith("word-cell-v2:") && !name.startsWith("word-cell-format-v2:"))
            continue;
          const owner = cellAddressFromName(name);
          if (owner.story !== story || owner.table !== nested.id) continue;
          if (name.startsWith("word-cell-v2:")) {
            const root = existingText(doc, name)!;
            const sourceProjection = sourceProjectionSignature(root, 0, root.length);
            roots.push({ name, value: root.toDelta(), ...(sourceProjection ? { sourceProjection } : {}) });
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
  const sourceProjection = value && sourceProjectionSignature(value.text, value.start, value.end);
  return stableStringify({
    content: payloadDelta(doc, address),
    terminal,
    cellFormat: changedFormat(cellFormatting(doc, address), value?.source?.format),
    rowFormat: removed === "row" || removed === "table"
      ? rowFormatting(doc, address)
      : undefined,
    columnWidth: removed === "column" || removed === "table"
      ? columnFormatting(doc, address)
      : undefined,
    descendants: Object.fromEntries([...descendants].sort(([a], [b]) => (a < b ? -1 : 1))),
    ...(sourceProjection ? { sourceProjection } : {}),
  });
}
