import * as Y from "yjs";
import { z } from "zod";
import { validateAttributes } from "../formatting.ts";
import { tableParagraphs } from "../tables.ts";
import { structuredGrid } from "./grid.ts";
import { id, storyId, WordTableConflict } from "./schema.ts";
import {
  tableAddresses,
  tableBase,
  tableRecords,
  activeAxes,
  orderedAxes,
  existingText,
  cellKey,
  tableName,
} from "./state.ts";
import {
  payload,
  sourceCell,
  payloadDelta,
  payloadSignature,
} from "./payload.ts";
/** Check hidden content too: deletion and structural undo must not silently detach edits. */
export function validateStructuredTables(doc: Y.Doc) {
  for (const name of doc.share.keys())
    if (name.startsWith("word-cell-format-v2:")) {
      const attributes = Object.fromEntries(doc.getMap<unknown>(name));
      validateAttributes(attributes);
      if (
        ["table", "image", "field", "ink", "shape", "tab", "breakType"].some(
          (key) => key in attributes,
        )
      )
        throw new Error(
          "Object formatting cannot belong to a virtual paragraph boundary.",
        );
    }
  // Yjs keeps named roots after undo. Empty table maps are inert unless content
  // remains attached to them, in which case undo must refuse to hide that content.
  for (const name of doc.share.keys()) {
    if (!name.startsWith("word-cell-v2:")) continue;
    const [story, table] = z
      .tuple([storyId, id, id, id])
      .parse(JSON.parse(name.slice("word-cell-v2:".length)));
    const address = { story, table };
    if (
      existingText(doc, name)!.length &&
      (!doc.share.has(tableName(address)) ||
        doc.getMap(tableName(address)).size === 0)
    )
      throw new WordTableConflict(
        address,
        "deleted-content",
        "Undo would detach retained cell content.",
      );
  }
  for (const address of tableAddresses(doc)) {
    const base = tableBase(doc, address),
      rows = activeAxes(doc, address, "row"),
      columns = activeAxes(doc, address, "column");
    for (const { value } of tableRecords(doc, address))
      if (value.kind === "remove" || value.kind === "remove-table") {
        for (const [key, signature] of Object.entries(value.witnesses)) {
          const [row, column] = z.tuple([id, id]).parse(JSON.parse(key));
          const source = sourceCell(doc, { ...address, row, column });
          if (
            value.kind === "remove" &&
            source &&
            rows.includes(row) &&
            columns.some(
              (column) =>
                sourceCell(doc, { ...address, row, column })?.cell ===
                source.cell,
            )
          )
            continue;
          if (payloadSignature(doc, { ...address, row, column }) !== signature)
            throw new WordTableConflict(
              address,
              "deleted-content",
              "Deleted axis contains edits not observed by the deletion.",
            );
        }
        // New intersections on a removed axis were not observed by the deleting peer.
        for (const row of orderedAxes(doc, address, "row"))
          for (const column of orderedAxes(doc, address, "column")) {
            if (
              (value.kind === "remove" &&
                !value.ids.includes(
                  value.dimension === "row" ? row : column,
                )) ||
              cellKey(row, column) in value.witnesses
            )
              continue;
            if (payloadDelta(doc, { ...address, row, column }).length)
              throw new WordTableConflict(
                address,
                "deleted-content",
                "Deleted axis contains concurrent content.",
              );
          }
      }
    const visible = new Set(
      structuredGrid(doc, address).flatMap((row) =>
        row.cells.flatMap((cell) =>
          cell.payloads.map((p) => cellKey(p.row, p.column)),
        ),
      ),
    );
    for (const name of doc.share.keys())
      if (name.startsWith("word-cell-v2:")) {
        const [story, table, row, column] = z
          .tuple([storyId, id, id, id])
          .parse(JSON.parse(name.slice("word-cell-v2:".length)));
        if (story !== address.story || table !== address.table) continue;
        const text = existingText(doc, name)!;
        const allRows = orderedAxes(doc, address, "row"),
          allColumns = orderedAxes(doc, address, "column");
        if (
          text.length &&
          (!allRows.includes(row) || !allColumns.includes(column))
        )
          throw new WordTableConflict(
            address,
            "deleted-content",
            "Undo would detach retained cell content.",
          );
        if (
          text.length &&
          rows.includes(row) &&
          columns.includes(column) &&
          !visible.has(cellKey(row, column))
        )
          throw new WordTableConflict(
            address,
            "overlap",
            "Merge coverage would hide retained cell content.",
          );
      }
    // A merge has explicit coverage. Concurrent interior insertions are ambiguous.
    const occupied = new Set<string>();
    for (const { value } of tableRecords(doc, address))
      if (value.kind === "merge") {
        const indexes = value.columns.map((column) => columns.indexOf(column));
        if (
          !rows.includes(value.row) ||
          indexes.some((n, i) => n < 0 || (i > 0 && n !== indexes[i - 1]! + 1))
        )
          throw new WordTableConflict(
            address,
            "overlap",
            "Merge coverage changed concurrently.",
          );
        for (const column of value.columns) {
          const key = cellKey(value.row, column);
          if (occupied.has(key))
            throw new WordTableConflict(
              address,
              "overlap",
              "Overlapping merges.",
            );
          occupied.add(key);
        }
      }
    const body = existingText(doc, address.story)!;
    for (const p of tableParagraphs(body))
      for (const cell of [
        ...(p.table?.parents ?? []),
        ...(p.table ? [p.table] : []),
      ])
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
    for (const cell of base.cells)
      payload(doc, {
        ...address,
        row: cell.row,
        column: base.columns[cell.column]!,
      });
  }
}
