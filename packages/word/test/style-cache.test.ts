import { expect, test } from 'bun:test';
import { openOpcPackage } from '@tumblerjs/opc';
import { openWordDocument } from '../src/index.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';

const w = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function document(body: string) {
  return openWordDocument(openOpcPackage(buildWordDocumentFixture({
    documentXml: `<w:document xmlns:w="${w}"><w:body>${body}</w:body></w:document>`,
  })));
}

function paragraph(doc: ReturnType<typeof document>, index = 0) {
  const block = doc.blocks[index];
  if (block?.kind !== 'paragraph') throw new Error('Expected paragraph');
  return block;
}

function run(block: ReturnType<typeof paragraph>) {
  const inline = block.inlines[0];
  if (inline?.kind !== 'run') throw new Error('Expected run');
  return inline;
}

test('formatting stays separate across source documents with identical element IDs', () => {
  const first = document('<w:p><w:pPr><w:jc w:val="left"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>First</w:t></w:r></w:p>');
  const second = document('<w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:i/></w:rPr><w:t>Second</w:t></w:r></w:p>');
  const p = paragraph(first), r = run(p);
  expect(p.elementId).toBe(paragraph(second).elementId);
  // A shared style set may resolve multiple story sources, whose local IDs overlap.
  for (let i = 0; i < 3; i++) {
    expect(first.styles.paragraphFormat(first, p).alignment).toBe('start');
    expect(first.styles.paragraphFormat(second, p).alignment).toBe('end');
    expect(first.styles.runFormat(first, p, r)).toMatchObject({ bold: true, italic: false });
    expect(first.styles.runFormat(second, p, r)).toMatchObject({ bold: false, italic: true });
  }
});

test('empty paragraph mark formatting stays separate from ordinary runs', () => {
  const doc = document('<w:p><w:pPr><w:rPr><w:b/></w:rPr></w:pPr><w:r><w:rPr><w:i/></w:rPr><w:t>Text</w:t></w:r></w:p>');
  const p = paragraph(doc), r = run(p);
  for (let i = 0; i < 3; i++) {
    expect(doc.styles.runFormat(doc, p)).toMatchObject({ bold: true, italic: false });
    expect(doc.styles.runFormat(doc, p, r)).toMatchObject({ bold: false, italic: true });
  }
});

test('reopening an edited revision resolves its new paragraph and run properties', () => {
  const before = document('<w:p><w:pPr><w:spacing w:after="120"/></w:pPr><w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:t>Text</w:t></w:r></w:p>');
  const after = document('<w:p><w:pPr><w:spacing w:after="240"/></w:pPr><w:r><w:rPr><w:sz w:val="28"/></w:rPr><w:t>Text</w:t></w:r></w:p>');
  for (const doc of [before, after, before, after]) {
    const p = paragraph(doc);
    expect(doc.styles.paragraphFormat(doc, p).spacingAfterTwips).toBe(doc === before ? 120 : 240);
    expect(doc.styles.runFormat(doc, p, run(p)).fontSizePoints).toBe(doc === before ? 10 : 14);
  }
});
