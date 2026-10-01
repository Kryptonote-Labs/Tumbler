import { expect, test } from 'bun:test';
import {
  createWordArtifact,
  importWordContent,
  openWordArtifact,
  reconcileWordContent,
  WordPackageDocument,
  wordContentParagraphs,
} from '../src/index.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';
const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const fixture = () =>
  openWordArtifact(
    buildWordDocumentFixture({
      documentXml: `<x:document xmlns:x="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><x:body><x:p><x:pPr><x:keepNext/></x:pPr><x:bookmarkStart x:id="1" x:name="a"/><x:hyperlink r:id="link"><x:r><x:rPr><x:b/><x:strike/></x:rPr><x:t>Hello</x:t></x:r></x:hyperlink><x:bookmarkEnd x:id="1"/></x:p><x:tbl><x:tblGrid><x:gridCol x:w="2000"/><x:gridCol x:w="2000"/></x:tblGrid><x:tr><x:tc><x:tcPr><x:gridSpan x:val="2"/></x:tcPr><x:p><x:r><x:t>Merged</x:t></x:r></x:p><x:tbl><x:tr><x:tc><x:p><x:r><x:t>Nested</x:t></x:r></x:p></x:tc></x:tr></x:tbl><x:p/></x:tc></x:tr></x:tbl><x:sectPr><x:pgSz x:w="16838" x:h="11906" x:orient="landscape"/></x:sectPr></x:body></x:document>`,
      relationships: [
        {
          id: 'link',
          type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink',
          target: 'https://example.com',
          targetMode: 'External',
        },
      ],
      parts: [
        {
          itemName: 'customXml/item1.xml',
          contentType: 'application/xml',
          xml: '<custom>Keep me</custom>',
        },
      ],
    }),
  );

test('imports merged and nested tables and preserves unexposed properties while editing', () => {
  const source = fixture();
  const blocks = importWordContent(source);
  const first = blocks[0]!;
  if (first.kind !== 'paragraph') throw new Error('Expected paragraph');
  const output = reconcileWordContent(source, [
    {
      ...first,
      runs: [
        {
          ...first.runs[0]!,
          text: 'Edited',
          format: { ...first.runs[0]!.format, italic: true },
        },
      ],
    },
    ...blocks.slice(1),
  ]);
  expect(
    wordContentParagraphs(importWordContent(output)).map((p) =>
      p.runs.map((r) => r.text).join(''),
    ),
  ).toEqual(['Edited', 'Merged', 'Nested', '']);
  const p = output.document.blocks[0]!;
  if (p.kind !== 'paragraph') throw new Error('Expected paragraph');
  const inline = p.inlines.find((i) => i.kind === 'hyperlink');
  expect(inline?.kind === 'hyperlink' && inline.target).toBe('https://example.com');
  if (inline?.kind !== 'hyperlink') throw new Error('Expected hyperlink');
  expect(output.document.styles.runFormat(output.document, p, inline.runs[0])).toMatchObject({
    bold: true,
    italic: true,
    strike: true,
  });
  expect(output.document.finalSection.orientation).toBe('landscape');
  const table = output.document.blocks[1]!;
  expect(table.kind === 'table' && table.rows[0]!.cells[0]!.gridSpan).toBe(2);
  expect(output.document.source.elements(ns, 'bookmarkStart')).toHaveLength(1);
  expect(output.document.source.elements(ns, 'bookmarkEnd')).toHaveLength(1);
  const custom = source.document.package.getPart('/customXml/item1.xml')!;
  expect(
    output.document.package.readPart(output.document.package.getPart('/customXml/item1.xml')!),
  ).toEqual(source.document.package.readPart(custom));
});

test('split and join styled paragraphs retain character formatting and hyperlinks', () => {
  const source = fixture();
  const blocks = importWordContent(source);
  const p = blocks[0]!;
  if (p.kind !== 'paragraph') throw new Error('Expected paragraph');
  const first = { ...p, runs: [{ ...p.runs[0]!, text: 'He' }] };
  const second = { ...p, runs: [{ ...p.runs[0]!, text: 'llo' }] };
  const output = reconcileWordContent(source, [first, second, ...blocks.slice(1)]);
  expect(
    wordContentParagraphs(importWordContent(output))
      .slice(0, 2)
      .map((p) => p.runs.map((r) => r.text).join('')),
  ).toEqual(['He', 'llo']);
  expect(output.document.source.elements(ns, 'bookmarkStart')).toHaveLength(1);
  expect(output.document.source.elements(ns, 'bookmarkEnd')).toHaveLength(1);
});

test('model accepts unchanged content without rewriting source bytes', () => {
  const source = fixture();
  const model = new WordPackageDocument(source);
  model.update(model.original);
  expect(model.artifact().bytes()).toBe(source.bytes());
});

test('plain files do not require an existing main-document relationships part', () => {
  const source = openWordArtifact(
    buildWordDocumentFixture({
      documentXml: `<w:document xmlns:w="${ns}"><w:body><w:p><w:r><w:t>A</w:t></w:r></w:p></w:body></w:document>`,
    }),
  );
  const original = wordContentParagraphs(importWordContent(source))[0]!;
  const output = reconcileWordContent(source, [
    {
      ...original,
      kind: 'paragraph',
      runs: [{ ...original.runs[0]!, text: 'B' }],
    },
  ]);
  expect(wordContentParagraphs(importWordContent(output))[0]!.runs[0]!.text).toBe('B');
});

test('adds and removes list formatting using the same editable content', () => {
  const source = createWordArtifact({
    paragraphs: [{ runs: [{ text: 'One' }] }],
  });
  const p = wordContentParagraphs(importWordContent(source))[0]!;
  const output = reconcileWordContent(source, [
    {
      ...p,
      kind: 'paragraph',
      list: { id: 'list', kind: 'decimal', level: 0 },
    },
  ]);
  expect(
    [...output.document.numbering.markers(output.document).values()].map((m) => m.text),
  ).toEqual(['1.']);
});

const png = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=',
  ),
  (c) => c.charCodeAt(0),
);
test('inserts an image into Strict DOCX with matching relationship and drawing namespaces', () => {
  const source = openWordArtifact(buildWordDocumentFixture({ conformance: 'strict' }));
  const p = wordContentParagraphs(importWordContent(source))[0]!;
  const output = reconcileWordContent(source, [
    {
      ...p,
      kind: 'paragraph',
      runs: [
        {
          text: '\uFFFC',
          image: {
            bytes: png,
            contentType: 'image/png',
            width: 30,
            height: 20,
          },
        },
      ],
    },
  ]);
  const drawing = [...output.document.drawings.values()][0]!;
  expect(drawing.kind).toBe('image');
  expect(drawing.widthPoints).toBe(30);
  expect(drawing.kind === 'image' && drawing.bytes).toEqual(png);
});

test('editing an imported image preserves its image bytes and updates geometry', () => {
  const source = createWordArtifact({
    blocks: [
      {
        kind: 'image',
        bytes: png,
        contentType: 'image/png',
        width: 30,
        height: 20,
      },
    ],
  });
  const p = wordContentParagraphs(importWordContent(source))[0]!;
  const image = {
    bytes: png,
    contentType: 'image/png' as const,
    width: 60,
    height: 40,
  };
  const output = reconcileWordContent(source, [
    { ...p, kind: 'paragraph', runs: [{ ...p.runs[0]!, image }] },
  ]);
  const drawing = [...output.document.drawings.values()][0]!;
  expect(drawing).toMatchObject({
    kind: 'image',
    widthPoints: 60,
    heightPoints: 40,
  });
  expect(drawing.kind === 'image' && drawing.bytes).toEqual(png);
  expect(
    output.document.package.parts.filter((part) => part.contentType === 'image/png'),
  ).toHaveLength(1);
});

test('opaque blocks keep their reading order and formatting properties keep schema order', () => {
  const source = openWordArtifact(
    buildWordDocumentFixture({
      documentXml: `<w:document xmlns:w="${ns}"><w:body><w:p><w:r><w:rPr><w:strike/></w:rPr><w:t>A</w:t></w:r></w:p><w:customXml><w:p><w:r><w:t>Opaque</w:t></w:r></w:p></w:customXml><w:p><w:r><w:t>B</w:t></w:r></w:p></w:body></w:document>`,
    }),
  );
  const [first, ...rest] = importWordContent(source);
  if (first?.kind !== 'paragraph') throw new Error('Expected paragraph');
  const output = reconcileWordContent(source, [
    { ...first, runs: [{ ...first.runs[0]!, format: { italic: true } }] },
    ...rest,
  ]);
  const xml = output.document.source.source;
  expect(xml.indexOf('Opaque')).toBeGreaterThan(xml.indexOf('>A<'));
  expect(xml.indexOf('Opaque')).toBeLessThan(xml.indexOf('>B<'));
  const properties = output.document.source.elements(ns, 'rPr')[0]!;
  expect(
    properties.children.filter((n) => n.kind === 'element').map((n) => n.localName),
  ).toEqual(['i', 'strike']);
});

test('table grid and merge edits materialize instead of reverting to source properties', () => {
  const source = fixture();
  const blocks = importWordContent(source);
  const table = blocks[1]!;
  if (table.kind !== 'table') throw new Error('Expected table');
  const output = reconcileWordContent(source, [
    blocks[0]!,
    {
      ...table,
      columnWidths: [150, 250],
      rows: [
        [
          { ...table.rows[0]![0]!, gridSpan: 1 },
          {
            blocks: [{ kind: 'paragraph', runs: [{ text: 'New cell' }] }],
            verticalMerge: 'restart',
          },
        ],
      ],
    },
  ]);
  const result = output.document.blocks[1]!;
  if (result.kind !== 'table') throw new Error('Expected table');
  expect(result.gridColumnWidthsTwips).toEqual([3000, 5000]);
  expect(result.rows[0]!.cells.map((cell) => cell.gridSpan)).toEqual([1, 1]);
  expect(result.rows[0]!.cells[1]!.verticalMerge).toBe('restart');
});

test('merged content can also be authored without an original package', () => {
  const table = {
    kind: 'table' as const,
    columnWidths: [100, 100],
    rows: [
      [
        {
          gridSpan: 2,
          blocks: [{ kind: 'paragraph' as const, runs: [{ text: 'Merged' }] }],
        },
      ],
      [
        { blocks: [{ kind: 'paragraph' as const, runs: [{ text: 'Left' }] }] },
        { blocks: [{ kind: 'paragraph' as const, runs: [{ text: 'Right' }] }] },
      ],
    ],
  };
  const artifact = createWordArtifact({ blocks: [table] });
  const block = artifact.document.blocks[0]!;
  expect(block.kind === 'table' && block.rows[0]!.cells[0]!.gridSpan).toBe(2);
});

test('copied source tables keep independent bookmark ranges', () => {
  const source = openWordArtifact(
    buildWordDocumentFixture({
      documentXml: `<w:document xmlns:w="${ns}"><w:body><w:tbl><w:tr><w:tc><w:p><w:bookmarkStart w:id="1" w:name="Cell"/><w:r><w:t>Cell</w:t></w:r><w:bookmarkEnd w:id="1"/></w:p></w:tc></w:tr></w:tbl></w:body></w:document>`,
    }),
  );
  const [table] = importWordContent(source);
  const output = reconcileWordContent(source, [table!, table!]);
  const paragraphs = output.document.source.elements(ns, 'p');
  expect(paragraphs).toHaveLength(2);
  const ids = paragraphs.map((p) => {
    const markers = p.children.filter(
      (node) => node.kind === 'element' && node.localName.startsWith('bookmark'),
    );
    expect(markers).toHaveLength(2);
    const values = markers.map(
      (node) =>
        node.kind === 'element' && node.attributes.find((a) => a.localName === 'id')?.value,
    );
    expect(values[0]).toBe(values[1]);
    return values[0];
  });
  expect(ids[0]).not.toBe(ids[1]);
});

test('row grid edits survive package materialization', () => {
  const source = openWordArtifact(
    buildWordDocumentFixture({
      documentXml: `<w:document xmlns:w="${ns}"><w:body><w:tbl><w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/></w:tblGrid><w:tr><w:trPr><w:gridAfter w:val="1"/></w:trPr><w:tc><w:p><w:r><w:t>Cell</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>`,
    }),
  );
  const [table] = importWordContent(source);
  if (table?.kind !== 'table') throw new Error('Expected table');
  const output = reconcileWordContent(source, [
    { ...table, rowGrids: [{ before: 1, after: 0 }] },
  ]);
  const result = output.document.blocks[0]!;
  if (result.kind !== 'table') throw new Error('Expected table');
  expect(result.rows[0]).toMatchObject({ gridBefore: 1, gridAfter: 0 });
});

test('replacing one source image leaves other uses of its media unchanged', () => {
  const source = createWordArtifact({
    blocks: [
      {
        kind: 'image',
        bytes: png,
        contentType: 'image/png',
        width: 30,
        height: 20,
      },
    ],
  });
  const p = wordContentParagraphs(importWordContent(source))[0]!;
  const replacement = new Uint8Array([...png, 0]);
  const output = reconcileWordContent(source, [
    { ...p, kind: 'paragraph' },
    {
      ...p,
      kind: 'paragraph',
      runs: [
        {
          ...p.runs[0]!,
          image: {
            bytes: replacement,
            contentType: 'image/png',
            width: 30,
            height: 20,
          },
        },
      ],
    },
  ]);
  const images = [...output.document.drawings.values()];
  expect(images).toHaveLength(2);
  expect(images[0]?.kind === 'image' && images[0].bytes).toEqual(png);
  expect(images[1]?.kind === 'image' && images[1].bytes).toEqual(replacement);
});

test('resizing a source table reconciles preferred table and merged cell widths', () => {
  const source = openWordArtifact(
    buildWordDocumentFixture({
      documentXml: `<w:document xmlns:w="${ns}"><w:body><w:tbl><w:tblPr><w:tblW w:w="4000" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/><w:gridSpan w:val="2"/></w:tcPr><w:p/></w:tc></w:tr></w:tbl></w:body></w:document>`,
    }),
  );
  const [table] = importWordContent(source);
  if (table?.kind !== 'table') throw new Error('Expected table');
  const output = reconcileWordContent(source, [{ ...table, columnWidths: [150, 250] }]);
  for (const name of ['tcW', 'tblW'])
    expect(
      output.document.source
        .elements(ns, name)[0]
        ?.attributes.find((a) => a.localName === 'w' && a.namespaceUri === ns)?.value,
    ).toBe('8000');
});
