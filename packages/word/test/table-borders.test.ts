import { expect, test } from 'bun:test';
import { NativeWordDocument, createWordArtifact, editWordTableBorders, layoutWordDocument, DEFAULT_WORD_BORDER, type WordBorder, type WordContentBlock } from '../src/index.ts';
const red: WordBorder = { color: '#CC1122', width: 2, style: 'dashed' };
const blocks: WordContentBlock[] = [{ kind: 'table', id: 'table', rows: Array.from({ length: 2 }, () => Array.from({ length: 2 }, () => ({ blocks: [{ kind: 'paragraph', runs: [{ text: 'cell' }] }] }))) }];
const measurer = { measure: (text: string) => ({ width: text.length * 6, ascent: 10, descent: 2 }) };
function cells(document: NativeWordDocument) { return document.layout(measurer).pages[0]!.columns[0]!.tables[0]!.cells; }

test('black defaults and explicit borders agree in native and DOCX layouts', () => {
  const document = new NativeWordDocument();
  document.update(blocks);
  expect(cells(document)[0]!.borders.top).toEqual(DEFAULT_WORD_BORDER);
  const table = blocks[0]!;
  if (table.kind !== 'table') throw new Error();
  document.update([{ ...table, borders: { insideV: red }, rows: table.rows.map((row, i) => row.map((cell, j) => ({ ...cell, ...(i === 0 && j === 0 ? { borders: { top: red, left: { ...red, style: 'none' as const, width: 0 } } } : {}) }))) }]);
  const native = cells(document).map(cell => cell.borders);
  const exported = layoutWordDocument(document.artifact().document, measurer).pages[0]!.columns[0]!.tables[0]!.cells.map(cell => cell.borders);
  expect(exported).toEqual(native);
  expect(native[0]!.top).toEqual(red);
  expect(native[0]!.left!.style).toBe('none');
  expect(native[0]!.right).toEqual(red);
});

test('selection outline changes shared neighbours but not unrelated edges', () => {
  const cells = Array.from({ length: 6 }, (_, index) => ({ row: Math.floor(index / 3), column: index % 3, borders: {} }));
  const changed = editWordTableBorders(cells, [0, 1], 'outside', red);
  expect(changed[0]!.borders.top).toEqual(red);
  expect(changed[0]!.borders.right).toBeUndefined();
  expect(changed[1]!.borders.right).toEqual(red);
  expect(changed[2]!.borders.left).toEqual(red);
  expect(changed[3]!.borders.top).toEqual(red);
  expect(changed[5]!.borders).toEqual({});
  const removed = editWordTableBorders(changed, [1], 'right', { style: 'none' });
  expect(removed[1]!.borders.right!.style).toBe('none');
  expect(removed[2]!.borders.left!.style).toBe('none');
});

test('package edits preserve text and roundtrip cell borders', () => {
  const artifact = createWordArtifact({ blocks });
  const table = artifact.document.blocks[0]!;
  if (table.kind !== 'table') throw new Error();
  const next = artifact.formatTableBorders({ tableElementId: table.elementId, cellElementIds: [table.rows[0]!.cells[0]!.elementId], edges: 'all', border: red });
  const changed = next.document.blocks[0]!;
  if (changed.kind !== 'table') throw new Error();
  expect(changed.rows[0]!.cells[0]!.borders!.top).toEqual(red);
  expect(changed.rows[0]!.cells[1]!.borders!.left).toEqual(red);
  expect(changed.rows[1]!.cells[1]!.borders).toEqual({});
  expect(next.document.source.source.match(/>cell</g)?.length).toBe(4);
  expect(artifact.document.source.source).not.toContain('CC1122');
  const again = next.formatTableBorders({ tableElementId: changed.elementId, edges: 'all', border: { color: '#009900' } });
  expect(again.document.source.source).toContain('009900');
});

test('invalid border updates are rejected before native state changes', () => {
  const document = new NativeWordDocument();
  document.update(blocks);
  const before = document.blocks;
  const table = blocks[0]!;
  if (table.kind !== 'table') throw new Error();
  expect(() => document.update([{ ...table, borders: { top: { ...red, width: -1 } } }])).toThrow();
  expect(document.blocks).toBe(before);
  expect(() => editWordTableBorders([{ row: 0, column: 0 }], [1], 'all', red)).toThrow();
});

test('changing colour preserves width and style, including hidden edges', () => {
  const cells = [{ row: 0, column: 0, borders: { top: red, right: { ...red, width: 0, style: 'none' as const } } }];
  const changed = editWordTableBorders(cells, [0], 'all', { color: '#112233' });
  expect(changed[0]!.borders.top).toEqual({ ...red, color: '#112233' });
  expect(changed[0]!.borders.right!.style).toBe('none');
  const visible = editWordTableBorders(changed, [0], 'right', { style: 'single' });
  expect(visible[0]!.borders.right!.width).toBe(0.75);
});

test('inside borders exclude the selection outline', () => {
  const cells = Array.from({ length: 4 }, (_, index) => ({ row: Math.floor(index / 2), column: index % 2 }));
  const changed = editWordTableBorders(cells, [0, 1, 2, 3], 'inside', red);
  expect(changed[0]!.borders.top).toBeUndefined();
  expect(changed[0]!.borders.left).toBeUndefined();
  expect(changed[0]!.borders.right).toEqual(red);
  expect(changed[0]!.borders.bottom).toEqual(red);
  expect(changed[3]!.borders.bottom).toBeUndefined();
});

test('borderless imported tables stay borderless and default namespaces remain editable', async () => {
  const { beginPackageTransaction, openOpcPackage } = await import('@tumblerjs/opc');
  const { openWordArtifact } = await import('../src/index.ts');
  const artifact = createWordArtifact({ blocks });
  const source = artifact.document.source.source
    .replace(/<w:tblBorders>.*?<\/w:tblBorders>/s, '')
    .replace('xmlns:w=', 'xmlns=')
    .replace(/<(\/?)(?:w:)/g, '<$1');
  // Attributes keep a bound w prefix because XML default namespaces do not apply to them.
  const xml = source.replace('<document ', '<document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ');
  const transaction = beginPackageTransaction(openOpcPackage(artifact.bytes()));
  transaction.replacePart(artifact.document.part.name, new TextEncoder().encode(xml));
  const imported = openWordArtifact(transaction.commit());
  const table = imported.document.blocks[0]!;
  if (table.kind !== 'table') throw new Error();
  const layout = layoutWordDocument(imported.document, measurer);
  expect(layout.pages[0]!.columns[0]!.tables[0]!.cells[0]!.borders.top!.style).toBe('none');
  const updated = imported.formatTableBorders({ tableElementId: table.elementId, edges: 'all', border: red });
  const next = updated.document.blocks[0]!;
  if (next.kind !== 'table') throw new Error();
  expect(next.rows[0]!.cells[0]!.borders!.top).toEqual(red);
});
