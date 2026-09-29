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


test('bounds aggregate cells before expanding repeated table content', () => {
  const table: WordContentBlock = { kind: 'table', rows: Array.from({ length: 1000 }, () => Array.from({ length: 10 }, () => ({ blocks: [] }))) };
  expect(() => createWordArtifact({ blocks: [table, table] })).toThrow('10000 table cells');
});

test('an image is already the final paragraph of a cell', () => {
  const artifact = createWordArtifact({ blocks: [{ kind: 'table', rows: [[{ blocks: [blocks[4]!] }]] }] });
  const table = artifact.document.blocks[0]!;
  if (table.kind !== 'table') throw new Error('Missing table');
  expect(table.rows[0]!.cells[0]!.blocks).toHaveLength(1);
});

test('inline images retain surrounding text and logical offsets through packaging', () => {
  const artifact = createWordArtifact({ paragraphs: [{ runs: [{ text: 'Before ' }, { text: '\uFFFC', image: { bytes: png, contentType: 'image/png', width: 20, height: 10, alt: 'inline' } }, { text: ' after' }] }] });
  const paragraph = artifact.document.blocks[0]!;
  if (paragraph.kind !== 'paragraph') throw new Error('Missing paragraph');
  expect(wordParagraphText(artifact.document, paragraph)).toBe('Before \uFFFC after');
  const layout = layoutWordDocument(artifact.document, { measure: text => ({ width: text.length * 6, ascent: 9, descent: 3 }) });
  const image = layout.pages[0]!.columns[0]!.lines.flatMap(line => line.fragments).find(fragment => fragment.kind === 'drawing');
  expect(image).toMatchObject({ startOffset: 7, endOffset: 8, width: 20, height: 10 });
});

test('authored floating images retain positioning and do not displace text', async () => {
  const image = { bytes: png, contentType: 'image/png' as const, width: 80, height: 40 };
  const make = (moveWithText: boolean) => createWordArtifact({ blocks: [paragraph('Before'), { kind: 'paragraph', runs: [{ text: '\uFFFC', image: { ...image, layout: 'front', alignment: 'right', moveWithText, y: 30 } }, { text: 'Alongside' }] }] });
  const measure = { measure: (text: string) => ({ width: text.length * 6, ascent: 9, descent: 3 }) };
  for (const move of [true, false]) {
    const artifact = openWordArtifact(make(move).bytes());
    const column = layoutWordDocument(artifact.document, measure).pages[0]!.columns[0]!;
    const line = column.lines[1]!;
    const drawing = line.fragments[0]!;
    expect(drawing.drawing?.anchor?.verticalRelativeTo).toBe(move ? 'paragraph' : 'page');
    expect(drawing.x).toBeCloseTo(column.x + column.width - 80);
    expect(drawing.y).toBeCloseTo(move ? line.y + 30 : 30);
    expect(line.fragments[1]!.x).toBe(line.x);
    expect(line.height).toBeLessThan(40);
    await Bun.write(`/tmp/tumbler-position-${move}.docx`, artifact.bytes());
  }
});

test('a floating image late in a wrapped paragraph remains anchored to its first line', () => {
  const artifact = createWordArtifact({ blocks: [{ kind: 'paragraph', runs: [{ text: 'word '.repeat(100) }, { text: '\uFFFC', image: { bytes: png, contentType: 'image/png', width: 80, height: 40, layout: 'behind', y: 12 } }] }] });
  const lines = layoutWordDocument(artifact.document, { measure: text => ({ width: text.length * 6, ascent: 9, descent: 3 }) }).pages[0]!.columns[0]!.lines;
  expect(lines.length).toBeGreaterThan(1);
  const fragment = lines.flatMap(line => line.fragments).find(fragment => fragment.kind === 'drawing')!;
  expect(fragment.y).toBe(lines[0]!.y + 12);
  expect(fragment.drawing?.anchor?.behindDocument).toBe(true);
});

test('floating drawings at the line edge do not cause a line break', () => {
  const artifact = createWordArtifact({ page: { width: 120, height: 200, margin: 10 }, blocks: [{ kind: 'paragraph', runs: [{ text: 'abcdefghijklmno' }, { text: '\uFFFC', image: { bytes: png, contentType: 'image/png', width: 80, height: 40, layout: 'front' } }, { text: 'X' }] }] });
  const lines = layoutWordDocument(artifact.document, { measure: text => ({ width: text.length * 6, ascent: 9, descent: 3 }) }).pages[0]!.columns[0]!.lines;
  expect(lines).toHaveLength(1);
  expect(lines[0]!.width).toBe(96);
});
