import { expect, test } from 'bun:test';
import { layoutWordDocument, openWordArtifact, wordLineAtPoint, wordTableLinesWithClips, wordVisibleLineBounds } from '../src/index.ts';
import { clipCell, clipParagraph, clipRow, clipTable, tableClippingFixture } from './table-clipping-fixture.ts';

const layout = (body?: string, height?: number) => layoutWordDocument(openWordArtifact(tableClippingFixture(body, height)).document, { measure: text => ({ width: text.length * 5, ascent: 8, descent: 2 }) });

test('exact rows retain text offsets but hidden lines cannot win hit testing outside the table', () => {
  const page = layout().pages[0]!;
  const table = page.columns[0]!.tables[0]!;
  expect(table.cells.map(cell => [cell.y, cell.height])).toEqual([[10, 10], [20, 10]]);
  expect(table.cells[0]!.lines.map(line => line.y)).toEqual([10, 20, 30, 40]);
  expect(wordLineAtPoint(page, 500, 45)).toBe(table.cells[1]!.lines[0]);
  const entries = wordTableLinesWithClips([table]);
  expect(entries.filter(entry => wordVisibleLineBounds(entry))).toHaveLength(2);
  expect(entries.map(entry => entry.line)).toEqual(table.cells.flatMap(cell => cell.lines));
});

test('nested content intersects the outer clip and merged cells use their full span', () => {
  const nested = clipTable(clipRow(clipCell(clipParagraph('INNER1') + clipParagraph('INNER2')), 400));
  const page = layout(clipTable(clipRow(clipCell(nested + clipParagraph('OUTER')), 100) + clipRow(clipCell(clipParagraph('NEXT'))))).pages[0]!;
  const entries = wordTableLinesWithClips(page.columns[0]!.tables);
  expect(entries.filter(entry => wordVisibleLineBounds(entry)).map(entry => entry.line.fragments.map(f => f.text).join(''))).toEqual(['INNER1', 'NEXT']);
  const inner = entries.find(entry => entry.line.fragments[0]?.text === 'INNER1')!;
  expect(wordVisibleLineBounds(inner)?.height).toBe(5);
  expect(wordLineAtPoint(page, 500, 25)?.fragments[0]?.text).toBe('NEXT');

  const merged = layout(clipTable(clipRow(clipCell(['ONE', 'TWO', 'HIDDEN'].map(clipParagraph).join(''), '<w:vMerge w:val="restart"/>')) + clipRow(clipCell(clipParagraph(''), '<w:vMerge/>')))).pages[0]!;
  const cell = merged.columns[0]!.tables[0]!.cells[0]!;
  expect(cell.rowSpan).toBe(2);
  expect(wordTableLinesWithClips(merged.columns[0]!.tables).filter(entry => wordVisibleLineBounds(entry))).toHaveLength(2);
  expect(wordLineAtPoint(merged, cell.x + 1, cell.y + 19)).toBe(cell.lines[1]);
});

test('repeated headers and continuation pages use their placed cell bounds', () => {
  const rows = clipRow(clipCell(clipParagraph('HEADER') + clipParagraph('HIDDEN')), 200, '<w:tblHeader/>') + Array.from({ length: 8 }, () => clipRow(clipCell(clipParagraph('ROW')))).join('');
  const pages = layout(clipTable(rows), 1000).pages;
  expect(pages.length).toBeGreaterThan(1);
  for (const page of pages) {
    const entries = wordTableLinesWithClips(page.columns[0]!.tables);
    const hidden = entries.find(entry => entry.line.fragments[0]?.text === 'HIDDEN')!;
    expect(wordVisibleLineBounds(hidden)).toBeUndefined();
    expect(entries[0]!.clip?.y).toBe(10);
    expect(wordLineAtPoint(page, 11, 15)).toBe(entries[0]!.line);
  }
});
