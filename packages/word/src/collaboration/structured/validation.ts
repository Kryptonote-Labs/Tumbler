import * as Y from "yjs";
import * as z from 'zod';
import { validateAttributes } from "../formatting.ts";
import { tableParagraphs } from "../tables.ts";
import { structuredGrid } from "./grid.ts";
import { id, WordTableConflict } from "./schema.ts";
import {
  tableAddresses,
  tableBase,
  tableRecords,
  activeAxes,
  orderedAxes,
  existingText,
  cellKey,
  tableName,
  cellFormatName,
  cellAddressFromName,
} from "./state.ts";
import { payload, sourceCell, payloadDelta, payloadSignature, cellFormatting, stableStringify, rowFormatting, columnFormatting } from "./payload.ts";
import { structuredReadCache } from "./read-cache.ts";
import { retainedParagraphBoundaries } from "./boundaries.ts";
import { migratedRemovalSignature } from './migration.ts';
/** Check hidden content too: deletion and structural undo must not silently detach edits. */
export function validateStructuredTables(doc: Y.Doc) {
  const cache = structuredReadCache(doc);
  if (!cache.active && cache.valid) return;
  for (const name of doc.share.keys())
    if (name.startsWith("word-cell-format-v2:")) {
      const attributes = Object.fromEntries(doc.getMap<unknown>(name));
      validateAttributes(attributes);
      if (
        ["table", "image", "field", "ink", "shape", "tab", "breakType"].some(
          (key) => key in attributes,
        )
      )
        throw new Error("Object formatting cannot belong to a virtual paragraph boundary.");
    }
  // A format-only root is retained content too, even if no Y.Text was encoded.
  const retained = [...doc.share.keys()].flatMap((name) => {
    const format = name.startsWith("word-cell-format-v2:");
    if (!format && !name.startsWith("word-cell-v2:")) return [];
    const address = cellAddressFromName(name);
    const occupied = format ? doc.getMap(name).size > 0 : existingText(doc, name)!.length > 0;
    return occupied ? [address] : [];
  });
  for (const address of tableAddresses(doc)) {
    const base = tableBase(doc, address);
    for (const { value } of tableRecords(doc, address)) {
      if (value.kind !== "cell-format") continue;
      const source = base.cells.find(cell => cell.cell === value.cell);
      if (source) retained.push({ ...address, row: source.row, column: base.columns[source.column]! });
      else {
        const [row, column] = z.tuple([id, id]).parse(JSON.parse(value.cell));
        retained.push({ ...address, row, column });
      }
    }
  }
  // Yjs leaves empty named maps after undo. Ignore them only if nothing is retained.
  for (const address of retained) {
    if (!doc.share.has(tableName(address)) || doc.getMap(tableName(address)).size === 0)
      throw new WordTableConflict(
        address,
        "deleted-content",
        "Undo would detach retained cell content or formatting.",
      );
  }
  for (const address of tableAddresses(doc)) {
    const base = tableBase(doc, address),
      rows = activeAxes(doc, address, "row"),
      columns = activeAxes(doc, address, "column"),
      allRows = orderedAxes(doc, address, "row"),
      allColumns = orderedAxes(doc, address, "column");
    for (const { value } of tableRecords(doc, address))
      if ((value.kind === "row-format" && !allRows.includes(value.row)) ||
          (value.kind === "width" && !allColumns.includes(value.column)))
        throw new WordTableConflict(address, "deleted-content", "Undo would detach retained row or column formatting.");
    for (const { key: removal, value } of tableRecords(doc, address))
      if (value.kind === "remove" || value.kind === "remove-table") {
        const witnessed = Object.keys(value.witnesses).map(key => z.tuple([id, id]).parse(JSON.parse(key)));
        const witnessedRows = new Set(witnessed.map(([row]) => row));
        const witnessedColumns = new Set(witnessed.map(([, column]) => column));
        for (const [key, original] of Object.entries(value.witnesses)) {
          const signature = migratedRemovalSignature(doc, address, removal, key, original);
          const [row, column] = z.tuple([id, id]).parse(JSON.parse(key));
          const source = sourceCell(doc, { ...address, row, column });
          if (
            value.kind === "remove" &&
            source &&
            rows.includes(row) &&
            columns.some(
              (column) => sourceCell(doc, { ...address, row, column })?.cell === source.cell,
            )
          ) {
            // A span keeps its shared payload, but the deleted column still loses its width.
            const previous = z.object({ columnWidth: z.unknown().optional() }).parse(JSON.parse(signature));
            const width = columnFormatting(doc, { ...address, row, column });
            if (stableStringify(previous.columnWidth) !== stableStringify(width))
              throw new WordTableConflict(address, "deleted-content", "Deleted axis contains edits not observed by the deletion.");
            continue;
          }
          if (payloadSignature(doc, { ...address, row, column }, value.kind === "remove" ? value.dimension : "table") !== signature)
            throw new WordTableConflict(
              address,
              "deleted-content",
              "Deleted axis contains edits not observed by the deletion.",
            );
        }
        // New intersections on a removed axis were not observed by the deleting peer.
        for (const row of allRows)
          for (const column of allColumns) {
            if (
              (value.kind === "remove" &&
                !value.ids.includes(value.dimension === "row" ? row : column)) ||
              cellKey(row, column) in value.witnesses
            )
              continue;
            if (
              payloadDelta(doc, { ...address, row, column }).length ||
              cellFormatting(doc, { ...address, row, column }) !== undefined ||
              (value.kind === "remove-table" && (
                (!witnessedRows.has(row) && rowFormatting(doc, { ...address, row, column }) !== undefined) ||
                (!witnessedColumns.has(column) && columnFormatting(doc, { ...address, row, column }) !== undefined)
              )) ||
              (doc.share.has(cellFormatName({ ...address, row, column })) &&
                doc.getMap(cellFormatName({ ...address, row, column })).size > 0)
            )
              throw new WordTableConflict(
                address,
                "deleted-content",
                "Deleted axis contains concurrent content.",
              );
          }
      }
    const visible = new Set(
      structuredGrid(doc, address).flatMap((row) =>
        row.cells
          .filter((cell) => cell.verticalMerge !== "continue")
          .flatMap((cell) => cell.payloads.map((p) => cellKey(p.row, p.column))),
      ),
    );
    for (const { story, table, row, column } of retained) {
      if (story !== address.story || table !== address.table) continue;
      if (!allRows.includes(row) || !allColumns.includes(column))
        throw new WordTableConflict(
          address,
          "deleted-content",
          "Undo would detach retained cell content or formatting.",
        );
      if (rows.includes(row) && columns.includes(column) && !visible.has(cellKey(row, column)))
        throw new WordTableConflict(
          address,
          "overlap",
          "Merge coverage would hide retained cell content or formatting.",
        );
    }
    // A merge has explicit coverage. Concurrent interior insertions are ambiguous.
    const occupied = new Set<string>();
    const equivalent = new Set<string>();
    for (const { value } of tableRecords(doc, address))
      if (value.kind === "merge") {
        const identity = JSON.stringify([value.row, value.columns]);
        if (equivalent.has(identity)) continue;
        equivalent.add(identity);
        const indexes = value.columns.map((column) => columns.indexOf(column));
        if (
          !rows.includes(value.row) ||
          indexes.some((n, i) => n < 0 || (i > 0 && n !== indexes[i - 1]! + 1))
        )
          throw new WordTableConflict(address, "overlap", "Merge coverage changed concurrently.");
        for (const column of value.columns) {
          const key = cellKey(value.row, column);
          if (occupied.has(key))
            throw new WordTableConflict(address, "overlap", "Overlapping merges.");
          occupied.add(key);
        }
      }
    const body = existingText(doc, address.story)!;
    for (const p of tableParagraphs(body))
      for (const cell of [...(p.table?.parents ?? []), ...(p.table ? [p.table] : [])])
        if (cell.id === address.table) {
          const original = base.cells.find((c) => c.cell === cell.cell);
          if (
            !original ||
            cell.schema !== 2 ||
            cell.row !== original.row ||
            cell.column !== original.column ||
            cell.columns !== original.columns ||
            cell.span !== original.span
          )
            throw new WordTableConflict(
              address,
              "legacy-writer",
              "An incompatible writer changed the migrated table structure.",
            );
        }
    // Keep source structure available even if all of its axes are hidden.
    for (const cell of base.cells) {
      const split = tableRecords(doc, address).find(
        (r) => r.value.kind === "split" && r.value.cell === cell.cell,
      )?.value;
      payload(doc, {
        ...address,
        row: cell.row,
        column: split?.kind === "split" ? split.column : base.columns[cell.column]!,
      });
    }
  }
  retainedParagraphBoundaries(doc);
  if (!cache.active) cache.valid = true;
}
