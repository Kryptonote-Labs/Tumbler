import { expect, test } from 'bun:test';
import { createWordArtifact, layoutWordDocument, NativeWordDocument, importWordContent } from '../src/index.ts';

const measurer = { measure: (text: string) => ({ width: text.length * 6, ascent: 9, descent: 3 }) };

for (const kind of ['decimal', 'bullet'] as const) test(`${kind} text aligns with continuation lines and markers hang to its left`, () => {
  const source = createWordArtifact({ blocks: [{ kind: 'paragraph', list: { id: 'list', kind }, runs: [{ text: 'word '.repeat(40) }] }] });
  const native = new NativeWordDocument({ source });
  native.update(importWordContent(source));
  for (const layout of [layoutWordDocument(source.document, measurer), native.layout(measurer)]) {
    const column = layout.pages[0]!.columns[0]!;
    expect(column.lines.length).toBeGreaterThan(1);
    expect(column.lines[0]!.marker!.x).toBe(column.x + 18);
    for (const line of column.lines) expect(line.x).toBe(column.x + 36);
  }
});

test('first-line indentation reduces only the first line wrapping width', () => {
  const source = createWordArtifact({ blocks: [{ kind: 'paragraph', positioning: { firstLineTwips: 1440 }, runs: [{ text: 'word '.repeat(60) }] }] });
  const column = layoutWordDocument(source.document, measurer).pages[0]!.columns[0]!;
  expect(column.lines.length).toBeGreaterThan(1);
  expect(column.lines[0]!.x).toBe(column.x + 72);
  expect(column.lines[1]!.x).toBe(column.x);
  expect(column.lines[0]!.width).toBeLessThan(column.lines[1]!.width);
  for (const line of column.lines) expect(line.x + line.width).toBeLessThanOrEqual(column.x + column.width);
});
