import type * as Y from "yjs";
import {
  activeAxes,
  tableBase,
  tableRecords,
  type TableAddress,
} from "./state.ts";

/** Shared by projection and fit-table so implicit columns use the same default width. */
export function structuredColumnWidths(doc: Y.Doc, address: TableAddress) {
  const base = tableBase(doc, address),
    records = tableRecords(doc, address);
  const original = base.cells[0]?.widths?.length
    ? base.cells[0].widths
    : records.some((record) => record.value.kind === "width")
      ? base.columns.map(() => 72)
      : undefined;
  if (!original) return undefined;
  const average = original.reduce((a, b) => a + b, 0) / original.length;
  return activeAxes(doc, address, "column").map((column) => {
    const record = records.find(
      (record) =>
        record.value.kind === "width" && record.value.column === column,
    )?.value;
    return record?.kind === "width"
      ? record.value
      : (original[base.columns.indexOf(column)] ?? average);
  });
}
