import { expect, test } from 'bun:test';
import { openPdfDocument, PdfInterpreter, pdfTextContent } from '@tumblerjs/pdf';
import { pdfTextRuns } from '../src/pdf/text-runs.ts';
const bytes = await Bun.file(
  new URL('../../pdf/test/fixtures/basic-text.pdf', import.meta.url),
).arrayBuffer();
const content = pdfTextContent(new PdfInterpreter(openPdfDocument(new Uint8Array(bytes))).page(0));
test('SVG text runs retain glyph order, affine baselines and per-glyph advances', () => {
  for (const linear of [
    [12, 0, 0, 12],
    [0, 12, -12, 0],
    [12, 3, 5, 14],
    [-12, 0, 0, 12],
    [12, 0, 0, 0],
  ]) {
    const projected = {
      ...content,
      items: content.items.map((item, index) => ({
        ...item,
        transform: [...linear, 20 + index * 9, 45 + index * 2] as [
          number,
          number,
          number,
          number,
          number,
          number,
        ],
      })),
    };
    const runs = pdfTextRuns(projected);
    expect(runs.flatMap((run) => run.items.map(({ item }) => item.id))).toEqual(
      projected.items.map((item) => item.id),
    );
    for (const run of runs) {
      const [a, b, c, d, e, f] = run.transform.slice(7, -1).split(' ').map(Number);
      for (const { item, x, y, size } of run.items) {
        expect(a! * x + c! * y + e!).toBeCloseTo(item.transform[4], 8);
        expect(b! * x + d! * y + f!).toBeCloseTo(item.transform[5], 8);
        expect(a! * size).toBeCloseTo(item.transform[0], 8);
        expect(b! * size).toBeCloseTo(item.transform[1], 8);
        expect(c! * size).toBeCloseTo(item.transform[2], 8);
        expect(d! * size).toBeCloseTo(item.transform[3], 8);
      }
    }
  }
});
test('runs split when font style changes without reordering source glyphs', () => {
  const items = content.items.map((item, index) => ({
    ...item,
    font: { ...item.font, weight: index % 2 ? 'bold' : 'normal' },
  }));
  const runs = pdfTextRuns({ ...content, items });
  expect(runs).toHaveLength(items.length);
  expect(runs.map((run) => run.font.weight)).toEqual(items.map((item) => item.font.weight));
});
