import { expect, test } from 'bun:test';
import { createWordArtifact, layoutWordDocument, openWordArtifact, wordParagraphText, type WordContentBlock } from '../src/index.ts';

const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64'));
const paragraph = (text: string): WordContentBlock => ({ kind: 'paragraph', runs: [{ text }] });
const blocks: WordContentBlock[] = [
  { kind: 'paragraph', runs: [{ text: 'First' }], list: { id: 'steps', kind: 'decimal', start: 3 } },
  { kind: 'paragraph', runs: [{ text: 'Nested' }], list: { id: 'steps', kind: 'decimal', start: 3, level: 1 } },
  { kind: 'paragraph', runs: [{ text: 'Second' }], list: { id: 'steps', kind: 'decimal', start: 3 } },
  { kind: 'table', rows: [[{ blocks: [paragraph('A')] }, { blocks: [paragraph('B')] }], [{ blocks: [paragraph('C')] }, { blocks: [] }]] },
  { kind: 'image', bytes: png, contentType: 'image/png', width: 80, height: 40, alt: 'A < picture' },
];

test('structured content survives packaging and produces native list, table and image layout', async () => {
  const artifact = openWordArtifact(createWordArtifact({ blocks }).bytes());
  const document = artifact.document;
  const layout = layoutWordDocument(document, { measure: text => ({ width: text.length * 6, ascent: 9, descent: 3 }) });
  const column = layout.pages[0]!.columns[0]!;
  expect(column.lines.slice(0, 3).map(line => line.marker?.text.trim())).toEqual(['3.', '3.', '4.']);
  const table = document.blocks[3]!;
  expect(table.kind).toBe('table');
  if (table.kind !== 'table') throw new Error('Missing table');
  expect(table.rows).toHaveLength(2);
  expect(table.rows[0]!.cells.map(cell => cell.blocks[0]?.kind === 'paragraph' ? wordParagraphText(document, cell.blocks[0]) : '')).toEqual(['A', 'B']);
  expect(column.tables[0]!.cells).toHaveLength(4);
  const image = column.lines.flatMap(line => line.fragments).find(fragment => fragment.kind === 'drawing')?.drawing;
  expect(image).toMatchObject({ kind: 'image', widthPoints: 80, heightPoints: 40, altText: 'A < picture' });
  if (image?.kind !== 'image') throw new Error('Missing image');
  expect(image.bytes).toEqual(png);
  await Bun.write('/tmp/tumbler-rich-content.docx', artifact.bytes());
});

test('rejects contradictory lists, malformed tables and invalid dimensions', () => {
  expect(() => createWordArtifact({ blocks: [...blocks, { kind: 'paragraph', runs: [], list: { id: 'steps', kind: 'bullet' } }] })).toThrow('consistent');
  expect(() => createWordArtifact({ blocks: [{ kind: 'table', rows: [[{ blocks: [] }], []] }] })).toThrow('cells');
  expect(() => createWordArtifact({ blocks: [{ kind: 'image', bytes: png, contentType: 'image/png', width: NaN, height: 10 }] })).toThrow('dimensions');
  expect(() => createWordArtifact({ blocks, paragraphs: [] })).toThrow('both');
});
