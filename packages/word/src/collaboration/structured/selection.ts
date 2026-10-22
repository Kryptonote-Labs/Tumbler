import * as Y from "yjs";
import { createWordCommands, type WordRange } from "../commands.ts";
import { existingText, cellName, payload } from "./state.ts";
import { resolveCell } from "./grid.ts";
import type { WordScopedSelection, WordScopedAnchor } from "./types.ts";
const commands = createWordCommands();
export function selectionText(
  doc: Y.Doc,
  selection: WordScopedSelection,
  create = false,
) {
  if ("story" in selection) {
    const text = existingText(doc, selection.story);
    if (!text) throw new Error("Missing story.");
    return { text, start: 0, end: commands.bodyLength(text) };
  }
  const cell = resolveCell(doc, selection.cell);
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
  const scope =
    "cell" in anchor ? { cell: anchor.cell } : { story: anchor.story };
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
