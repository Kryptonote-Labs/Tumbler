import type { PdfTextContent, PdfTextItem } from "./text-content.ts";

export interface PdfTextCaret {
  readonly id: string;
  /** UTF-16 offset in the item's extraction text, always at a grapheme boundary. */
  readonly offset: number;
}
interface Line {
  items: PdfTextItem[];
  dx: number;
  dy: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}
const distance = (value: number, min: number, max: number) => Math.max(min - value, 0, value - max);

/** Resolve carets from PDF line geometry, including the whitespace between lines.
 * Line distance takes priority over distance along a line, so short lines retain their end caret. */
export class PdfTextSelectionIndex {
  private readonly lines: Line[] = [];
  private readonly segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  constructor(content: PdfTextContent) {
    let line: Line | undefined;
    for (const item of content.items) {
      if (item.kind === "separator" && item.text === "\n") {
        line = undefined;
        continue;
      }
      const [a, b, c, d, e, f] = item.transform,
        length = Math.hypot(a, b);
      if (!length || !item.text) continue;
      if (!line) {
        line = {
          items: [],
          dx: a / length,
          dy: b / length,
          left: Infinity,
          right: -Infinity,
          top: Infinity,
          bottom: -Infinity,
        };
        this.lines.push(line);
      }
      line.items.push(item);
      for (const x of [0, item.width])
        for (const y of [-item.ascent, item.height - item.ascent]) {
          const px = a * x + c * y + e,
            py = b * x + d * y + f;
          const along = px * line.dx + py * line.dy,
            across = -px * line.dy + py * line.dx;
          line.left = Math.min(line.left, along);
          line.right = Math.max(line.right, along);
          line.top = Math.min(line.top, across);
          line.bottom = Math.max(line.bottom, across);
        }
    }
  }
  caretAt(x: number, y: number): PdfTextCaret | undefined {
    let closest: Line | undefined,
      acrossDistance = Infinity,
      alongDistance = Infinity;
    for (const line of this.lines) {
      const across = distance(-x * line.dy + y * line.dx, line.top, line.bottom);
      const along = distance(x * line.dx + y * line.dy, line.left, line.right);
      if (
        across < acrossDistance - 1e-6 ||
        (Math.abs(across - acrossDistance) < 1e-6 && along < alongDistance)
      ) {
        closest = line;
        acrossDistance = across;
        alongDistance = along;
      }
    }
    if (!closest) return;
    let caret: PdfTextCaret | undefined,
      best = Infinity;
    const along = x * closest.dx + y * closest.dy;
    for (const item of closest.items) {
      const [a, b, , , e, f] = item.transform,
        origin = e * closest.dx + f * closest.dy;
      const width = (a * closest.dx + b * closest.dy) * item.width;
      const segments = Array.from(this.segmenter.segment(item.text));
      for (let i = 0; i <= segments.length; i++) {
        const point = origin + (width * i) / segments.length,
          delta = Math.abs(along - point);
        if (delta < best) {
          best = delta;
          caret = {
            id: item.id,
            offset: i === segments.length ? item.text.length : segments[i]!.index,
          };
        }
      }
    }
    return caret;
  }
}
