import * as Y from "yjs";
import {
  createWordCommands,
  type WordDelta,
  type WordRange,
} from "../commands.ts";
import {
  activeAxes,
  liveAxes,
  cellKey,
  cellFormatName,
  migrateTable,
  orderedAxes,
  payloadSignature,
  tableName,
  tableRecords,
  WordTableConflict,
  type CellAddress,
  type TableRecord,
} from "./state.ts";
import { resolveCell, structuredGrid } from "./grid.ts";
import { selectionText, checkRange } from "./selection.ts";
import type { WordScopedSelection, WordStructuredChange } from "./types.ts";
const commands = createWordCommands();
export function editDerivedText<T extends { delta: WordDelta }>(
  doc: Y.Doc,
  address: CellAddress,
  text: Y.Text,
  edit: (staged: Y.Text) => T,
): T {
  const temporary = new Y.Doc();
  try {
    const staged = temporary.getText("cell");
    staged.applyDelta(text.toDelta());
    const name = cellFormatName(address);
    const attributes = doc.share.has(name)
      ? Object.fromEntries(doc.getMap<unknown>(name))
      : {};
    staged.insert(staged.length, "\n", attributes);
    const result = edit(staged);
    const content: WordDelta = [];
    let offset = 0;
    for (const [index, part] of result.delta.entries()) {
      if (part.retain) {
        const count = Math.min(part.retain, Math.max(0, text.length - offset));
        if (count) content.push({ ...part, retain: count });
        if (
          offset + part.retain > text.length &&
          result.delta.slice(index + 1).some((next) => next.insert)
        ) {
          // A structural insertion after the virtual terminator needs a real
          // boundary, otherwise the preceding text becomes the first child cell.
          content.push({
            insert: "\n",
            attributes: Object.fromEntries(
              Object.entries({ ...attributes, ...part.attributes }).filter(
                ([, value]) => value !== null,
              ),
            ),
          });
        }
        if (offset + part.retain > text.length && part.attributes) {
          const format = doc.getMap<unknown>(name);
          for (const [key, value] of Object.entries(part.attributes))
            if (value === null) format.delete(key);
            else format.set(key, value);
        }
        offset += part.retain;
      } else if (part.delete) {
        const count = Math.min(part.delete, Math.max(0, text.length - offset));
        if (count) content.push({ delete: count });
        offset += part.delete;
      } else content.push(part);
    }
    text.applyDelta(content);
    return result;
  } finally {
    temporary.destroy();
  }
}
function applyDerivedText(
  doc: Y.Doc,
  address: CellAddress,
  text: Y.Text,
  range: WordRange,
  change: Extract<WordStructuredChange, { kind: "replace" | "format" }>,
) {
  editDerivedText(doc, address, text, (staged) => ({
    delta:
      change.kind === "replace"
        ? commands.replaceWordDelta(staged, range, change.value)
        : commands.formatWordDelta(staged, range, change.patch),
  }));
}
export function applyStructuredChange(
  doc: Y.Doc,
  change: WordStructuredChange,
): WordScopedSelection | undefined {
  if (change.kind === "migrate") {
    migrateTable(doc, change.table);
    return;
  }
  if (change.kind === "replace" || change.kind === "format") {
    const value = selectionText(doc, change.selection, true)!;
    checkRange(change.selection.range, value.end - value.start);
    const range = {
      start: value.start + change.selection.range.start,
      end: value.start + change.selection.range.end,
    };
    if ("cell" in change.selection && !("source" in value))
      applyDerivedText(doc, change.selection.cell, value.text, range, change);
    else if (change.kind === "replace")
      value.text.applyDelta(
        commands.replaceWordDelta(value.text, range, change.value),
      );
    else
      value.text.applyDelta(
        commands.formatWordDelta(value.text, range, change.patch),
      );
    return {
      ...change.selection,
      range:
        change.kind === "replace"
          ? {
              start:
                change.selection.range.start +
                change.value.replace(/\r\n?/g, "\n").length,
              end:
                change.selection.range.start +
                change.value.replace(/\r\n?/g, "\n").length,
            }
          : change.selection.range,
    };
  }
  const address = "table" in change ? change.table : change.cell;
  const records = doc.getMap<TableRecord>(tableName(address));
  if (change.kind === "insert-axis") {
    const axes = activeAxes(doc, address, change.dimension);
    if (
      !Number.isInteger(change.at) ||
      change.at < 0 ||
      change.at > axes.length
    )
      throw new RangeError("Axis position is outside the table.");
    const continuations =
      change.dimension === "row"
        ? (structuredGrid(doc, address)[change.at]?.cells ?? [])
            .filter((cell) => cell.verticalMerge === "continue")
            .map((cell) => ({
              columns: cell.columns,
              group: cell.verticalGroup!,
            }))
        : [];
    const id = crypto.randomUUID();
    records.set("axis:" + id, {
      kind: "axis",
      dimension: change.dimension,
      id,
      left: axes[change.at - 1] ?? null,
      right: axes[change.at] ?? null,
      continuations,
    });
  } else if (change.kind === "delete-table") {
    const witnesses: Record<string, string> = {};
    for (const row of orderedAxes(doc, address, "row"))
      for (const column of orderedAxes(doc, address, "column"))
        witnesses[cellKey(row, column)] = payloadSignature(doc, {
          ...address,
          row,
          column,
        });
    records.set("remove-table", { kind: "remove-table", witnesses });
  } else if (change.kind === "restore-table") {
    records.delete("remove-table");
  } else if (change.kind === "restore-axis") {
    records.delete("remove:" + change.dimension + ":" + change.id);
  } else if (change.kind === "delete-axis") {
    if (!orderedAxes(doc, address, change.dimension).includes(change.id))
      throw new Error("Axis is no longer visible.");
    if (liveAxes(doc, address, change.dimension).length === 1) {
      applyStructuredChange(doc, { kind: "delete-table", table: address });
      return;
    }
    const witnesses: Record<string, string> = {};
    for (const row of orderedAxes(doc, address, "row"))
      for (const column of orderedAxes(doc, address, "column"))
        if ((change.dimension === "row" ? row : column) === change.id)
          witnesses[cellKey(row, column)] = payloadSignature(doc, {
            ...address,
            row,
            column,
          });
    // Retire only merges observed by this deletion. Concurrent merges still conflict.
    for (const { key, value } of tableRecords(doc, address)) {
      if (value.kind !== "merge") continue;
      if (change.dimension === "row" && value.row === change.id)
        records.delete(key);
      else if (
        change.dimension === "column" &&
        value.columns.includes(change.id)
      ) {
        records.delete(key);
        const columns = value.columns.filter((column) => column !== change.id);
        if (columns.length > 1)
          records.set("merge:" + crypto.randomUUID(), {
            ...value,
            columns,
          });
      }
    }
    records.set("remove:" + change.dimension + ":" + change.id, {
      kind: "remove",
      dimension: change.dimension,
      ids: [change.id],
      witnesses,
    });
  } else if (change.kind === "table-format") {
    const grid = structuredGrid(doc, address),
      target = resolveCell(doc, change.cell),
      patch = change.patch;
    if (!["table", "row", "column", "cell"].includes(patch.scope))
      throw new Error("Invalid table format scope.");
    for (const row of grid)
      for (const cell of row.cells) {
        const selected =
          patch.scope === "table" ||
          (patch.scope === "row"
            ? row.id === change.cell.row
            : patch.scope === "column"
              ? cell.columns.some((c) => target.columns.includes(c))
              : row.id === change.cell.row &&
                cell.address.column === target.address.column);
        if (selected && patch.cell) {
          const id = cell.source?.cell ?? cellKey(row.id, cell.address.column),
            key = "format:" + id;
          const old = records.get(key);
          const previous =
            old?.kind === "cell-format" ? old.format : cell.source?.format;
          records.set(key, {
            kind: "cell-format",
            cell: id,
            format: {
              ...previous,
              ...patch.cell,
              ...(patch.cell.borders
                ? { borders: { ...previous?.borders, ...patch.cell.borders } }
                : {}),
            },
          });
        }
        if (
          patch.row &&
          (patch.scope === "table" || row.id === change.cell.row)
        ) {
          const key = "row-format:" + row.id,
            old = records.get(key);
          records.set(key, {
            kind: "row-format",
            row: row.id,
            format: {
              ...(old?.kind === "row-format"
                ? old.format
                : cell.source?.rowFormat),
              ...patch.row,
            },
          });
        }
      }
    if (patch.columnWidths) {
      const columns = activeAxes(doc, address, "column");
      if (patch.columnWidths.length !== columns.length)
        throw new Error("Provide one width per column.");
      columns.forEach((column, i) =>
        records.set("width:" + column, {
          kind: "width",
          column,
          value: patch.columnWidths![i]!,
        }),
      );
    }
  } else if (change.kind === "merge-right") {
    const row = structuredGrid(doc, address).find(
      (row) => row.id === change.cell.row,
    )!;
    const current = resolveCell(doc, change.cell);
    // resolveCell returns a fresh view; use its stable coordinate rather than object identity.
    const at = row.cells.findIndex(
        (cell) => cell.address.column === current.address.column,
      ),
      next = row.cells[at + 1];
    if (!next || current.verticalMerge || next.verticalMerge)
      throw new WordTableConflict(
        address,
        "overlap",
        "No compatible adjacent cell.",
      );
    const coverage = [...current.columns, ...next.columns];
    for (const { key, value } of tableRecords(doc, address))
      if (
        value.kind === "merge" &&
        value.row === change.cell.row &&
        value.columns.some((column) => coverage.includes(column))
      )
        records.delete(key);
    records.set("merge:" + crypto.randomUUID(), {
      kind: "merge",
      row: change.cell.row,
      columns: coverage,
    });
  } else {
    const merges = tableRecords(doc, address).filter(
      (r) =>
        r.value.kind === "merge" &&
        r.value.row === change.cell.row &&
        r.value.columns.includes(change.cell.column),
    );
    if (merges.length) for (const merge of merges) records.delete(merge.key);
    else {
      const cell = resolveCell(doc, change.cell);
      if (!cell.source || (cell.source.span ?? 1) <= 1 || cell.source.merge)
        throw new WordTableConflict(
          address,
          "overlap",
          "Select a horizontally merged cell.",
        );
      records.set("split:" + cell.source.cell, {
        kind: "split",
        cell: cell.source.cell,
      });
    }
  }
}
