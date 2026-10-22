import { expect, test } from 'bun:test';
import { openWordArtifact, layoutWordDocument, wordDrawingCellClip } from '../src/index.ts';
import { tableDrawingOptOutFixture } from './table-drawing-opt-out-fixture.ts';

for (const [value, enabled] of [['0', false], ['false', false], ['1', true], ['true', true], ['omitted', true]] as const) {
  test(`imported layoutInCell=${value} preserves its cell clipping policy`, () => {
    const source = tableDrawingOptOutFixture(value);
    const drawing = [...source.document.drawings.values()][0]!;
    expect(drawing.anchor?.layoutInCell).toBe(enabled);
    const page = layoutWordDocument(source.document, { measure: text => ({ width: text.length * 5, ascent: 8, descent: 2 }) }).pages[0]!;
    const cell = page.columns[0]!.tables[0]!.cells[0]!;
    const fragment = cell.lines.flatMap(line => line.fragments).find(fragment => fragment.drawing)!;
    expect(fragment.y).toBeGreaterThanOrEqual(cell.y + cell.height);
    expect(wordDrawingCellClip(drawing, cell)).toBe(enabled ? cell : undefined);
    expect([...openWordArtifact(source.bytes()).document.drawings.values()][0]!.anchor?.layoutInCell).toBe(enabled);
  });
}

test('wrap-none ignores the layoutInCell opt-out as Word does', () => {
  const drawing = [...tableDrawingOptOutFixture('0', 'none').document.drawings.values()][0]!;
  const clip = { x: 0, y: 0, width: 10, height: 10 };
  expect(wordDrawingCellClip(drawing, clip)).toBe(clip);
});
