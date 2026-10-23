import * as Y from "yjs";
import { z } from "zod";
import { id, storyId } from "./schema.ts";
import { createWordCommands, type WordRange } from "../commands.ts";
import {
  existingText,
  cellName,
  payload,
  sourceCell,
  WordTableConflict,
} from "./state.ts";
import { tableParagraphs } from "../tables.ts";
import { resolveCell } from "./grid.ts";
import type { WordScopedSelection, WordScopedAnchor } from "./types.ts";
const commands = createWordCommands();
export function selectionText(
  doc: Y.Doc,
  selection: WordScopedSelection,
  create = false,
) {
  if ("story" in selection) {
    if (selection.story.startsWith("word-cell-v2:")) {
      const [story, table] = z
        .tuple([storyId, id, id, id])
        .parse(JSON.parse(selection.story.slice("word-cell-v2:".length)));
      throw new WordTableConflict(
        { story, table },
        "legacy-writer",
        "Use a scoped cell selection to edit a migrated table.",
      );
    }
    const text = existingText(doc, selection.story);
    if (!text) throw new Error("Missing story.");
    const touched = tableParagraphs(text).find(
      (p) =>
        (p.table?.schema === 2 ||
          p.table?.parents?.some((parent) => parent.schema === 2)) &&
        (selection.range.start === selection.range.end
          ? selection.range.start >= p.start && selection.range.start < p.end
          : selection.range.start < p.end && selection.range.end > p.start),
    );
    if (touched?.table)
      throw new WordTableConflict(
        { story: selection.story, table: touched.table.id },
        "legacy-writer",
        "Use a scoped cell selection to edit a migrated table.",
      );
    return { text, start: 0, end: commands.bodyLength(text) };
  }
  const cell = resolveCell(doc, selection.cell);
  if (cell.verticalMerge === "continue")
    throw new WordTableConflict(
      selection.cell,
      "overlap",
      "Select the restart cell to edit a vertical merge.",
    );
  const source = sourceCell(doc, selection.cell);
  if (
    !cell.payloads.some(
      (candidate) =>
        candidate.column === selection.cell.column ||
        (source && sourceCell(doc, candidate)?.cell === source.cell),
    )
  )
    throw new WordTableConflict(
      selection.cell,
      "overlap",
      "Select a visible merged-cell payload from the logical grid.",
    );
  const value = payload(doc, selection.cell);
  if (value) return value;
  return create
    ? { text: doc.getText(cellName(selection.cell)), start: 0, end: 0 }
    : undefined;
}
export function checkRange(range: WordRange, length: number) {
  if (
    !Number.isInteger(range.start) ||
    !Number.isInteger(range.end) ||
    range.start < 0 ||
    range.end < range.start ||
    range.end > length
  )
    throw new RangeError("Selection is outside the cell.");
}
export function anchorScopedSelection(
  doc: Y.Doc,
  selection: WordScopedSelection,
): WordScopedAnchor {
  const value = selectionText(doc, selection);
  checkRange(selection.range, value ? value.end - value.start : 0);
  const positions = value
    ? {
        start: Y.createRelativePositionFromTypeIndex(
          value.text,
          value.start + selection.range.start,
        ),
        end: Y.createRelativePositionFromTypeIndex(
          value.text,
          value.start + selection.range.end,
        ),
      }
    : { start: null, end: null };
  if ("cell" in selection) return { cell: selection.cell, ...positions };
  return {
    story: selection.story,
    start: positions.start!,
    end: positions.end!,
  };
}
export function resolveScopedAnchor(
  doc: Y.Doc,
  anchor: WordScopedAnchor,
): WordScopedSelection {
  if ("story" in anchor) {
    const text = existingText(doc, anchor.story);
    const start = Y.createAbsolutePositionFromRelativePosition(anchor.start, doc);
    const end = Y.createAbsolutePositionFromRelativePosition(anchor.end, doc);
    if (!text || !start || !end || start.type !== text || end.type !== text)
      throw new Error("Selection no longer resolves.");
    const limit = commands.bodyLength(text);
    const selection = {
      story: anchor.story,
      range: {
        start: Math.min(limit, start.index, end.index),
        end: Math.min(limit, Math.max(start.index, end.index)),
      },
    };
    selectionText(doc, selection);
    return selection;
  }
  const scope = { cell: anchor.cell };
  const value = selectionText(doc, { ...scope, range: { start: 0, end: 0 } });
  const position = (relative: Y.RelativePosition | null) => {
    if (relative === null) return 0;
    const absolute = Y.createAbsolutePositionFromRelativePosition(
      relative,
      doc,
    );
    if (!absolute || !value || absolute.type !== value.text)
      throw new Error("Selection no longer resolves.");
    return Math.max(
      0,
      Math.min(value.end - value.start, absolute.index - value.start),
    );
  };
  const start = position(anchor.start),
    end = position(anchor.end);
  return {
    ...scope,
    range: { start: Math.min(start, end), end: Math.max(start, end) },
  };
}
