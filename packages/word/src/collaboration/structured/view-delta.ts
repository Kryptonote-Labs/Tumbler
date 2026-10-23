import * as Y from "yjs";
import type { WordDelta } from "../commands.ts";
import { tableParagraphs } from "../tables.ts";
import { editDerivedText } from "./edits.ts";
import { cellName, migrateTable, type TableAddress } from "./state.ts";
import { removeWordTable } from "./boundaries.ts";
import { selectionText } from "./selection.ts";
import type { WordViewSpan, WordViewTable } from "./view-projection.ts";

type Part = WordDelta[number];
type Edit = {
  span: WordViewSpan;
  offset: number;
  part: Part;
  start: number;
  outsideTable?: boolean;
};

/** Translate a browser delta into payload-local edits without synchronizing the linear view. */
export function applyWordViewDelta(
  doc: Y.Doc,
  story: string,
  text: Y.Text,
  spans: readonly WordViewSpan[],
  delta: WordDelta,
  tables: readonly WordViewTable[],
) {
  const edits: Edit[] = [];
  const removed: { start: number; end: number; table: TableAddress }[] = [];
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
  // Insert/delete runs describe one replacement in either order. Apply deletions first
  // so inserted content targets the surviving boundary outside a removed table.
  const ordered: WordDelta = [];
  let inserted: WordDelta = [];
  for (const part of delta) {
    if (typeof part.insert === "string") inserted.push(part);
    else if (part.delete !== undefined) {
      const previous = ordered.at(-1);
      if (previous?.delete !== undefined) previous.delete += part.delete;
      else ordered.push({ ...part });
    }
    else {
      ordered.push(...inserted, part);
      inserted = [];
    }
  }
  ordered.push(...inserted);
  let paragraphPrefix = 0;
  let replacement: { start: number; end: number } | undefined;
  for (const [index, part] of ordered.entries()) {
    if (part.retain !== undefined) {
      if (part.retain) replacement = undefined;
      if (part.attributes) split(cursor, part.retain, part);
      cursor += part.retain;
    } else if (part.delete !== undefined) {
      const end = cursor + part.delete;
      replacement = { start: cursor, end };
      for (const table of tables)
        if (
          table.end > table.start && cursor <= table.start && end >= table.end &&
          !removed.some(row => row.start <= table.start && row.end >= table.end)
        ) removed.push(table);
      split(cursor, part.delete, part);
      cursor = end;
    } else if (typeof part.insert === "string") {
      const span = spans.find((span) => cursor >= span.start && cursor < span.end) ??
        spans.at(-1) ?? { root: story, offset: 0, start: 0, end: 0 };
      if (typeof ordered[index - 1]?.insert !== "string") {
        let content = "";
        for (let next = index; typeof ordered[next]?.insert === "string"; next++)
          content += ordered[next]!.insert;
        paragraphPrefix = content.lastIndexOf("\n") + 1;
      }
      const boundary = tables.findLast(
        (table) => replacement && table.start >= replacement.start &&
          table.end <= replacement.end && removed.some(
          (row) => row.start === table.start && row.end === table.end &&
            row.table.table === table.table.table && row.table.story === table.table.story,
        ),
      );
      const count = Math.min(paragraphPrefix, part.insert.length);
      paragraphPrefix -= count;
      let insert = part.insert;
      // Complete replacement paragraphs belong to the removed table's container.
      // A suffix without a newline still joins the following paragraph, as in Y.Text.
      if (
        count && boundary && (span.cell ? cellName(span.cell) : undefined) !==
          (boundary.container ? cellName(boundary.container) : undefined)
      ) {
        edits.push({
          span: {
            root: boundary.table.story, offset: boundary.offset, start: cursor, end: cursor,
            ...(boundary.container ? { cell: boundary.container } : {}),
          },
          start: cursor,
          offset: boundary.offset,
          part: { ...part, insert: insert.slice(0, count) },
          outsideTable: true,
        });
        insert = insert.slice(count);
      }
      if (!insert) continue;
      edits.push({
        span,
        start: cursor,
        offset:
          span.offset + (span.virtual ? 0 : Math.min(cursor - span.start, span.end - span.start)),
        part: { ...part, insert },
      });
    } else throw new Error("Only text is supported.");
  }
  // Validate story targets before changing paragraph boundaries in this staged edit.
  const approvedStories = new Set<Edit>();
  for (const edit of edits) {
    if (edit.span.cell || edit.outsideTable) continue;
    selectionText(doc, { story: edit.span.root, range: {
      start: edit.offset, end: edit.offset + (edit.part.delete ?? edit.part.retain ?? 0),
    } }, true);
    approvedStories.add(edit);
  }
  for (const row of removed) {
    const table = tables.find(table => table.table.story === row.table.story && table.table.table === row.table.table)!;
    const before = spans.find(span => table.start - 1 >= span.start && table.start - 1 < span.end);
    const boundaries: Y.ID[] = [];
    if (!before || before.virtual || before.root !== table.table.story ||
      (before.cell ? cellName(before.cell) : undefined) !== (table.container ? cellName(table.container) : undefined)) {
      removeWordTable(doc, row.table);
      continue;
    }
    const at = table.offset - 1, text = doc.getText(before.root);
    const deletion = edits.find(edit => edit.span === before && edit.part.delete && edit.offset + edit.part.delete - 1 === at);
    if (deletion?.part.delete && text.toString()[at] === "\n") {
      boundaries.push(Y.createRelativePositionFromTypeIndex(text, at).item!);
      deletion.part = { delete: deletion.part.delete - 1 };
    }
    removeWordTable(doc, row.table, boundaries);
  }
  for (const edit of edits.reverse()) {
    if (edit.part.delete === 0) continue;
    if (removed.some((row) => edit.start >= row.start && edit.start < row.end)) continue;
    const { span } = edit;
    const value = (edit.outsideTable && !span.cell) || approvedStories.has(edit)
      ? { text: doc.getText(span.root), start: 0, end: doc.getText(span.root).length }
      : selectionText(
          doc,
          span.cell
            ? { cell: span.cell, range: { start: 0, end: 0 } }
            : {
                story: span.root,
                range: {
                  start: edit.offset,
                  end: edit.offset + (edit.part.delete ?? edit.part.retain ?? 0),
                },
              },
          true,
        )!;
    const at = Math.max(0, edit.offset - value.start);
    const attributes = { ...edit.part.attributes };
    if (span.cell) {
      const table: unknown = attributes.table;
      if (table === undefined || (table && typeof table === "object" && "id" in table && table.id === span.cell.table)) {
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
    const part = { ...edit.part, ...(edit.part.attributes || Object.keys(attributes).length ? { attributes } : {}) };
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
