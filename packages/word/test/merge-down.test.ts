import { expect, test } from 'bun:test';
import { fixture, cell, apply, exported, texts } from './structured-table-fixtures.ts';
import { structuredGrid } from '../src/collaboration/structured/index.ts';
test('merge down keeps both cells visible and split restores their content', () => {
  const { session, table, doc } = fixture([[cell('A'), cell('B')], [cell('C'), cell('D')]]);
  try {
    const target = structuredGrid(doc, table)[0]!.cells[0]!.address;
    apply(doc, { kind: 'merge-down', cell: target });
    const merged = exported(session);
    expect(merged.rows[0]![0]!.verticalMerge).toBe('restart');
    expect(merged.rows[1]![0]!.verticalMerge).toBe('continue');
    expect(texts(merged.rows[0]![0]!.blocks)).toEqual(['A', 'C']);
    const lower = structuredGrid(doc, table)[1]!.cells[0]!.address;
    apply(doc, { kind: 'replace', selection: { cell: lower, range: { start: 0, end: 1 } }, value: 'Edited C' });
    expect(texts(exported(session).rows[0]![0]!.blocks)).toEqual(['A', 'Edited C']);
    apply(doc, { kind: 'split-cell', cell: target });
    const split = exported(session);
    expect(texts(split.rows[0]![0]!.blocks)).toEqual(['A']);
    expect(texts(split.rows[1]![0]!.blocks)).toEqual(['Edited C']);
  } finally { session.destroy(); }
});

test('legacy merge down moves content out of the hidden continuation', async () => {
  const Y = await import('yjs');
  const { insertTableDelta, editTableDelta, tableParagraphs } = await import('../src/collaboration/index.ts');
  const doc = new Y.Doc(); const text = doc.getText('body'); text.insert(0, '\n');
  text.applyDelta(insertTableDelta(text, 0, [['A', 'B'], ['C', 'D']]).delta);
  const first = tableParagraphs(text).find(p => p.table)!;
  text.applyDelta(editTableDelta(text, first.start, 'merge-down', first.table!.id, first.table!.cell));
  const paragraphs = tableParagraphs(text);
  const visible = paragraphs.filter(p => p.table?.cell === first.table!.cell).map(p => text.toString().slice(p.start, p.end - 1));
  expect(visible).toEqual(['A', 'C']);
  expect(text.toString()).toContain('D');
  doc.destroy();
});
