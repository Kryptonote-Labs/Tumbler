import * as Y from "yjs";
import type { WordDelta } from "../commands.ts";
import { tableParagraphs } from "../tables.ts";
import { applyStructuredChange, editDerivedText } from "./edits.ts";
import { migrateTable, type TableAddress } from "./state.ts";
import { selectionText } from "./selection.ts";
import type { WordViewSpan } from "./view-projection.ts";

type Part = WordDelta[number];
type Edit = { span: WordViewSpan; offset: number; part: Part; start: number };

/** Translate a browser delta into payload-local edits without synchronizing the linear view. */
export function applyWordViewDelta(
  doc: Y.Doc,
  story: string,
  text: Y.Text,
  spans: readonly WordViewSpan[],
  delta: WordDelta,
) {
  const edits: Edit[] = [];
  const removed: { start: number; end: number; table: TableAddress }[] = [];
  const paragraphs = tableParagraphs(text);
  let cursor = 0;
  const split = (start: number, count: number, part: Part) => {
    if (start < 0 || count < 0 || start + count > text.length)
      throw new RangeError("Edit is outside the document.");
    for (const span of spans) {
      const from = Math.max(start, span.start),
        to = Math.min(start + count, span.end);
      if (to <= from) continue;
      edits.push({
        span,
        offset: span.offset + (span.virtual ? 0 : from - span.start),
        start: from,
        part: part.delete
          ? { delete: to - from }
          : { retain: to - from, ...(part.attributes ? { attributes: part.attributes } : {}) },
      });
    }
  };
  for (const part of delta) {
    if (part.retain !== undefined) {
      if (part.attributes) split(cursor, part.retain, part);
      cursor += part.retain;
    } else if (part.delete !== undefined) {
      const end = cursor + part.delete;
      for (const p of paragraphs)
        for (const ref of [...(p.table?.parents ?? []), ...(p.table ? [p.table] : [])]) {
          const members = paragraphs.filter(
            (p) =>
              p.table?.id === ref.id || p.table?.parents?.some((parent) => parent.id === ref.id),
          );
          const start = members[0]!.start,
            finish = members.at(-1)!.end;
          if (
            cursor <= start &&
            end >= finish &&
            !removed.some((row) => row.start <= start && row.end >= finish)
          ) {
            const span = spans.find(
              (span) => span.start >= start && span.start < finish && span.cell?.table === ref.id,
            );
            if (span?.cell)
              removed.push({
                start,
                end: finish,
                table: { story: span.cell.story, table: ref.id },
              });
          }
        }
      split(cursor, part.delete, part);
      cursor = end;
    } else if (typeof part.insert === "string") {
      const span = spans.find((span) => cursor >= span.start && cursor < span.end) ??
        spans.at(-1) ?? { root: story, offset: 0, start: 0, end: 0 };
      edits.push({
        span,
        start: cursor,
        offset:
          span.offset + (span.virtual ? 0 : Math.min(cursor - span.start, span.end - span.start)),
        part,
      });
    } else throw new Error("Only text is supported.");
  }
  for (const row of removed) applyStructuredChange(doc, { kind: "delete-table", table: row.table });
  for (const edit of edits.reverse()) {
    if (removed.some((row) => edit.start >= row.start && edit.start < row.end)) continue;
    const { span } = edit;
    const value = selectionText(
      doc,
      span.cell
        ? { cell: span.cell, range: { start: 0, end: 0 } }
        : { story: span.root, range: { start: 0, end: 0 } },
      true,
    )!;
    const at = Math.max(0, edit.offset - value.start);
    const attributes = { ...edit.part.attributes };
    if (span.cell && attributes.table) {
      const table: unknown = attributes.table;
      if (table && typeof table === "object" && "id" in table && table.id === span.cell.table) {
        delete attributes.table;
        if (typeof edit.part.insert === "string" && "source" in value) {
          let offset = 0;
          for (const part of value.text.toDelta()) {
            const size = typeof part.insert === "string" ? part.insert.length : 0;
            if (offset <= value.end && offset + size > value.end && part.attributes?.table)
              attributes.table = part.attributes.table;
            offset += size;
          }
        }
      }
    }
    const part = { ...edit.part, ...(edit.part.attributes ? { attributes } : {}) };
    // The final source-cell boundary remains owned by its retained baseline.
    if (part.delete && span.cell) {
      part.delete = Math.min(part.delete, Math.max(0, value.end - value.start - at));
      if (!part.delete) continue;
    }
    if (part.retain && edit.part.attributes && !Object.keys(attributes).length) continue;
    const local: WordDelta = [...(at ? [{ retain: at }] : []), part];
    if (span.cell && !("source" in value))
      editDerivedText(doc, span.cell, value.text, () => ({ delta: local }));
    else value.text.applyDelta([...(value.start ? [{ retain: value.start }] : []), ...local]);
  }
  // Pasted tables join the same protocol as tables inserted through the operation registry.
  for (const [story, value] of doc.share)
    if (value instanceof Y.Text) {
      const body = doc.getText(story),
        seen = new Set<string>();
      for (const p of tableParagraphs(body))
        for (const ref of [...(p.table?.parents ?? []), ...(p.table ? [p.table] : [])])
          if (ref.schema !== 2 && !seen.has(ref.id)) {
            migrateTable(doc, { story, table: ref.id });
            seen.add(ref.id);
          }
    }
}
