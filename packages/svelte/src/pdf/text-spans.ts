import type { pdfTextRuns } from "./text-runs.ts";

export type PdfTextSpan = {
  id: string;
  text: string;
  x: string;
  y: string;
  width: number | undefined;
  glyph: string | undefined;
  bindings: { id: string; offset: number }[];
};
type Run = ReturnType<typeof pdfTextRuns>[number];
// These scripts can use explicit character positions without contextual shaping across source glyphs.
const positioned =
  /^[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Common}]$/u;

/** Batch positioned glyphs into text nodes while retaining UTF-16 endpoints for every source item.
 * Contextually shaped scripts and multi-character glyphs keep their independent source widths. */
export function pdfTextSpans(run: Run): PdfTextSpan[] {
  const spans: PdfTextSpan[] = [];
  let previous: PdfTextSpan | undefined,
    baseline = 0;
  for (const { item, x, y, size } of run.items) {
    const simple = positioned.test(item.text) && item.text !== "\n";
    if (simple && previous && Math.abs(y - baseline) < 0.01) {
      previous.bindings.push({ id: item.id, offset: previous.text.length });
      previous.text += item.text;
      previous.x += " " + x;
      previous.y += " " + y;
      previous.width = undefined;
      previous.glyph = undefined;
    } else {
      const span: PdfTextSpan = {
        id: item.id,
        text: item.text,
        x: String(x),
        y: String(y),
        width: Math.max(0.00001, item.width * size),
        glyph: item.kind === "glyph" ? item.id : undefined,
        bindings: [{ id: item.id, offset: 0 }],
      };
      spans.push(span);
      previous = simple ? span : undefined;
      baseline = y;
    }
  }
  return spans;
}
