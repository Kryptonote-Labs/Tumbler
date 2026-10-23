import type * as Y from "yjs";
import { tableParagraphs } from "../tables.ts";
import { applyStructuredChange } from "./edits.ts";
import { selectionText } from "./selection.ts";
import { cellName, isTableRemoved, migrateTable, payload, type CellAddress } from "./state.ts";

/** Clear visible cell content while retaining the baselines of migrated nested tables. */
export function clearWordCell(doc: Y.Doc, cell: CellAddress) {
  const value = selectionText(doc, { cell, range: { start: 0, end: 0 } });
  if (!value) return 0;
  const story = value.source ? cell.story : cellName(cell);
  const paragraphs = tableParagraphs(value.text);
  const retained: { start: number; end: number; table: string }[] = [];
  for (const p of paragraphs) {
    for (const ref of [...(p.table?.parents ?? []), ...(p.table ? [p.table] : [])]) {
      if (ref.id === cell.table) continue;
      const members = paragraphs.filter(
        p => p.table?.id === ref.id || p.table?.parents?.some(parent => parent.id === ref.id),
      );
      const start = members[0]!.start, end = members.at(-1)!.end;
      if (
        start < value.start || end > value.end ||
        retained.some(range => start >= range.start && end <= range.end)
      ) continue;
      retained.push({ start, end, table: ref.id });
    }
  }
  retained.sort((a, b) => a.start - b.start);
  for (const range of retained) {
    migrateTable(doc, { story, table: range.table });
    const table = { story, table: range.table };
    if (!isTableRemoved(doc, table)) applyStructuredChange(doc, { kind: "delete-table", table });
  }
  let end = value.end;
  for (const range of retained.toReversed()) {
    if (end > range.end) value.text.delete(range.end, end - range.end);
    end = range.start;
  }
  if (end > value.start) value.text.delete(value.start, end - value.start);
  const remaining = payload(doc, cell);
  return remaining ? remaining.end - remaining.start : 0;
}
