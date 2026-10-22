import { expect, test } from 'bun:test';
import { layoutWordDocument } from '../src/index.ts';
import { lineDocument, fixedMeasurer } from './line-layout-fixture.ts';

test('non-breaking spaces move their word group to the next line and retain painted width', () => {
  for (const space of ['\u00a0', '\u202f', '\u2007']) {
    const lines = layoutWordDocument(lineDocument(`aa bbbb${space}cccc`, '', 50), fixedMeasurer).pages[0]!.columns[0]!.lines;
    expect(lines.map(line => line.fragments.map(fragment => fragment.text).join(''))).toEqual(['aa', `bbbb${space}cccc`]);
    expect(lines.map(line => [line.startOffset, line.endOffset, line.width])).toEqual([[0, 3, 10], [3, 12, 45]]);
    const trailing = layoutWordDocument(lineDocument(`x${space}`), fixedMeasurer).pages[0]!.columns[0]!.lines[0]!;
    expect(trailing.width).toBe(10);
    expect(trailing.fragments[0]!.text).toBe(`x${space}`);
  }
});

test('terminal explicit line breaks preserve the final empty line and its caret offset', () => {
  for (const count of [1, 2, 3]) {
    const layout = layoutWordDocument(lineDocument(`<w:t>abc</w:t>${'<w:br/>'.repeat(count)}`, '', 100, true), fixedMeasurer);
    const lines = layout.pages.flatMap(page => page.columns.flatMap(column => column.lines));
    expect(lines).toHaveLength(count + 1);
    expect(lines.at(-1)).toMatchObject({ startOffset: 3 + count, endOffset: 3 + count, height: 10, fragments: [] });
  }
});
