import * as Y from "yjs";
import type { WordAnchor, WordRange } from "../commands.ts";
import type { WordViewSpan } from "./view-projection.ts";

export function anchorWordView(
  doc: Y.Doc,
  spans: readonly WordViewSpan[],
  range: WordRange,
): WordAnchor {
  const position = (at: number) => {
    const span = spans.find((span) => at >= span.start && at < span.end) ?? spans.at(-1);
    if (!span) return Y.createRelativePositionFromTypeIndex(doc.getText("body"), 0);
    const index =
      span.offset + (span.virtual ? 0 : Math.min(span.end - span.start, at - span.start));
    if (!doc.share.has(span.root))
      return Y.createRelativePositionFromJSON({ tname: span.root, assoc: 0 });
    return Y.createRelativePositionFromTypeIndex(doc.getText(span.root), index);
  };
  const start = position(range.start);
  const end = range.end === range.start
    ? Y.createRelativePositionFromJSON(start)
    : position(range.end);
  return { start, end };
}

export function resolveWordView(
  doc: Y.Doc,
  spans: readonly WordViewSpan[],
  anchor: WordAnchor,
): WordRange {
  const position = (relative: Y.RelativePosition) => {
    const absolute = Y.createAbsolutePositionFromRelativePosition(relative, doc);
    const root =
      relative.tname ??
      (absolute && Y.createRelativePositionFromTypeIndex(absolute.type as Y.Text, 0).tname);
    const index = absolute?.index ?? (relative.item === null ? 0 : undefined);
    if (!root || index === undefined) throw new Error("The edit target no longer exists.");
    const span =
      spans.find(
        (span) =>
          span.root === root &&
          index >= span.offset &&
          index < span.offset + (span.virtual ? 1 : span.end - span.start),
      ) ??
      spans.findLast(
        (span) =>
          span.root === root && index === span.offset + (span.virtual ? 0 : span.end - span.start),
      );
    if (!span) throw new Error("The edit target is no longer visible.");
    return span.start + (span.virtual ? 0 : index - span.offset);
  };
  const start = position(anchor.start),
    end = Y.compareRelativePositions(anchor.start, anchor.end) ? start : position(anchor.end);
  return { start: Math.min(start, end), end: Math.max(start, end) };
}
