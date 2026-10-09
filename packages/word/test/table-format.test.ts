import { expect, test } from 'bun:test';
import * as Y from 'yjs';
import { NativeWordDocument, openWordArtifact, importWordContent, layoutWordDocument, createWordArtifact, type WordContentBlock } from '../src/index.ts';
import { createWordCommands, formatTableDelta, insertTableDelta, tableParagraphs, groupTableParagraphs } from '../src/collaboration/index.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';
const measure = { measure: (text: string) => ({ width: text.length * 5, ascent: 8, descent: 2 }) };
const border = { style: 'single' as const, widthPoints: 1, color: '#FFFFFF' };
const source = () => openWordArtifact(buildWordDocumentFixture({ documentXml: `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:tbl><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="8" w:color="000000"/><w:insideV w:val="single" w:sz="8" w:color="000000"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/></w:tblGrid><w:tr><w:trPr><w:trHeight w:val="800"/></w:trPr><w:tc><w:tcPr><w:tcBorders><w:top w:val="single" w:sz="8" w:color="FFFFFF"/><w:right w:val="single" w:sz="8" w:color="FFFFFF"/></w:tcBorders><w:shd w:fill="F3F3F3"/><w:tcMar><w:top w:w="100" w:type="dxa"/><w:bottom w:w="100" w:type="dxa"/></w:tcMar><w:noWrap/></w:tcPr><w:p><w:r><w:t>Left</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Right</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>` }));
const table = (layout: ReturnType<typeof layoutWordDocument>) => layout.pages[0]!.columns[0]!.tables[0]!;

test('cell overrides determine shared borders and fills in direct and native layouts', () => {
  const artifact = source();
  const model = new NativeWordDocument({ source: artifact }); model.update(importWordContent(artifact));
  for (const result of [layoutWordDocument(artifact.document, measure), model.layout(measure)]) {
    const t = table(result);
    expect(t.cells[0]!.shading).toBe('#F3F3F3');
    expect(t.height).toBe(40);
    const shared = t.borders!.filter(b => b.orientation === 'vertical');
    expect(shared).toHaveLength(1);
    expect(shared[0]!.border).toEqual(border);
  }
});

test('native cell and row edits survive export/reopen and retain unrelated source properties', () => {
  const artifact = source(); const blocks = importWordContent(artifact); const t = blocks[0]!;
  if (t.kind !== 'table') throw Error('table');
  const model = new NativeWordDocument({ source: artifact });
  model.update([{ ...t, rowFormats: [{ heightTwips: 1600, heightRule: 'atLeast' }], rows: t.rows.map(row => row.map(cell => ({ ...cell, format: { shading: '#FFFF00', verticalAlignment: 'bottom', borders: { bottom: { ...border, color: '#FF0000' } } } }))) }]);
  const native = table(model.layout(measure));
  const exported = model.artifact(); const reopened = table(layoutWordDocument(openWordArtifact(exported.bytes()).document, measure));
  expect(reopened.height).toBe(80);
  expect(native.height).toBe(reopened.height);
  expect(reopened.cells[0]!.shading).toBe('#FFFF00');
  expect(reopened.cells[0]!.lines[0]!.y).toBe(native.cells[0]!.lines[0]!.y);
  expect(reopened.cells[0]!.lines[0]!.y).toBeGreaterThan(reopened.y + 60);
  expect(reopened.borders).toEqual(native.borders);
  expect(exported.document.source.source).toContain('noWrap');
});

test('authored table geometry and appearance round trip', () => {
  const blocks: WordContentBlock[] = [{ kind: 'table', columnWidths: [100, 100], rowFormats: [{ heightTwips: 1200, heightRule: 'exact' }], rows: [[{ gridSpan: 2, format: { shading: '#112233', margins: { topTwips: 100, bottomTwips: 100, startTwips: 200, endTwips: 200 }, borders: { top: border } }, blocks: [{ kind: 'paragraph', runs: [{ text: 'Merged' }] }] }]] }];
  const artifact = createWordArtifact({ blocks }); const model = new NativeWordDocument(); model.update(blocks);
  const a = table(layoutWordDocument(artifact.document, measure)), b = table(model.layout(measure));
  expect(a.height).toBe(b.height); expect(a.cells[0]!.shading).toBe(b.cells[0]!.shading); expect(a.borders).toEqual(b.borders);
});

test('table formatting preserves collaborative text, exports metadata and supports undo', () => {
  const doc = new Y.Doc(), text = doc.getText('body'); text.insert(0, '\n'); text.applyDelta(insertTableDelta(text, 0, [['A', 'B'], ['C', 'D']]).delta);
  const p = tableParagraphs(text).find(p => p.table)!; const cell = p.table!; const undo = new Y.UndoManager(text); const before = text.toString();
  text.applyDelta(formatTableDelta(text, p.start, cell.id, cell.cell, { scope: 'row', cell: { shading: '#FF0000' }, row: { heightTwips: 900, heightRule: 'atLeast' } }));
  expect(text.toString()).toBe(before);
  const rows = tableParagraphs(text).filter(p => p.table); expect(rows.map(p => p.table!.format?.shading)).toEqual(['#FF0000', '#FF0000', undefined, undefined]);
  const grouped = groupTableParagraphs(rows.map(p => ({ kind: 'paragraph' as const, runs: [{ text: text.toString().slice(p.start, p.end-1) }], table: p.table! })));
  expect(grouped.find(b => b.kind === 'table')).toMatchObject({ rowFormats: [{ heightTwips: 900, heightRule: 'atLeast' }, undefined] });
  const replica = new Y.Doc(); Y.applyUpdate(replica, Y.encodeStateAsUpdate(doc)); expect(replica.getText('body').toDelta()).toEqual(text.toDelta());
  undo.undo(); expect(tableParagraphs(text).filter(p => p.table).every(p => !p.table!.format)).toBe(true);
  const commands = createWordCommands(); const target = commands.anchorWordRange(text, { start:p.start, end:p.start });
  expect(() => commands.wordTransaction(text, [{ kind:'table-format', target, tableId:cell.id, cellId:cell.cell, patch:{scope:'cell',cell:{shading:'invalid'}} }])).toThrow();
  expect(text.toString()).toBe(before);
});

test('shared borders split beside merged cells without double painting', () => {
  const blocks: WordContentBlock[] = [{ kind: 'table', columnWidths: [60, 60], rows: [
    [{ gridSpan: 2, blocks: [{ kind: 'paragraph', runs: [{ text: 'Both' }] }] }],
    [{ blocks: [{ kind: 'paragraph', runs: [{ text: 'A' }] }] }, { blocks: [{ kind: 'paragraph', runs: [{ text: 'B' }] }] }],
  ] }];
  const t = table(layoutWordDocument(createWordArtifact({ blocks }).document, measure));
  const boundary = t.cells[1]!.y;
  const shared = t.borders!.filter(edge => edge.orientation === 'horizontal' && edge.y === boundary);
  expect(shared.map(edge => edge.length)).toEqual([60, 60]);
  expect(shared[0]!.x + shared[0]!.length).toBe(shared[1]!.x);
});
