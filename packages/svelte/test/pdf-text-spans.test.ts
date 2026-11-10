import { expect, test } from "bun:test";
import { openPdfDocument, PdfInterpreter, pdfTextContent } from "@tumblerjs/pdf";
import { pdfTextRuns } from "../src/pdf/text-runs.ts";
import { pdfTextSpans } from "../src/pdf/text-spans.ts";

const document = openPdfDocument(
  await Bun.file(new URL("../../pdf/test/fixtures/basic-text.pdf", import.meta.url)).bytes(),
);
const content = pdfTextContent(new PdfInterpreter(document).page(0));

test("batched native text preserves extraction order, source positions and every selection endpoint", () => {
  const runs = pdfTextRuns(content);
  let count = 0;
  for (const run of runs) {
    const spans = pdfTextSpans(run);
    expect(spans.map((span) => span.text).join("")).toBe(
      run.items.map(({ item }) => item.text).join(""),
    );
    const items = new Map(run.items.map((value) => [value.item.id, value]));
    for (const span of spans) {
      const xs = span.x.split(" ").map(Number),
        ys = span.y.split(" ").map(Number);
      for (const [index, binding] of span.bindings.entries()) {
        const original = items.get(binding.id)!;
        expect(span.text.slice(binding.offset, binding.offset + original.item.text.length)).toBe(
          original.item.text,
        );
        expect(xs[index]).toBe(original.x);
        expect(ys[index]).toBe(original.y);
      }
    }
    count += spans.length;
  }
  expect(count).toBeLessThan(content.items.length);
});

test("surrogate pairs keep UTF-16 offsets and contextual glyphs keep their independent widths", () => {
  const base = pdfTextRuns(content)[0]!;
  const original = base.items[0]!;
  const values = ["A", "🙂", "B", "fi", "א", "ב", "\n", "C"];
  const run = {
    ...base,
    items: values.map((text, index) => ({
      ...original,
      x: index * 10,
      item: { ...original.item, id: String(index), text },
    })),
  };
  const spans = pdfTextSpans(run);
  expect(spans[0]!.text).toBe("A🙂B");
  expect(spans[0]!.bindings.map((binding) => binding.offset)).toEqual([0, 1, 3]);
  expect(spans.slice(1).map((span) => span.text)).toEqual(["fi", "א", "ב", "\n", "C"]);
  expect(spans.slice(1).every((span) => span.width !== undefined)).toBe(true);
});
