import { expect, test } from 'bun:test';
import { importWordContent, layoutWordDocument, NativeWordDocument, openWordArtifact, wordParagraphText } from '../src/index.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';
const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const arrow = '\u{1f868}';
const measure = { measure: (text: string) => ({ width: [...text].length * 6, ascent: 9, descent: 3 }) };
function fixture(symbol = '<w:sym w:font="Wingdings" w:char="F0DF"/>') {
  return openWordArtifact(buildWordDocumentFixture({ documentXml: `<w:document xmlns:w="${ns}"><w:body><w:p><w:r><w:t>Before</w:t>${symbol}<w:t>After</w:t></w:r></w:p></w:body></w:document>` }));
}
function paragraph(source: ReturnType<typeof fixture>) {
  const p = source.document.blocks[0]!;
  if (p.kind !== 'paragraph') throw Error('Expected paragraph');
  return p;
}

test.each(['F0DF', '00DF'])('maps Wingdings %s to Unicode without leaking the symbol font into adjacent text', char => {
  const source = fixture(`<w:sym w:font="Wingdings" w:char="${char}"/>`);
  expect(wordParagraphText(source.document, paragraph(source))).toBe(`Before${arrow}After`);
  const layout = layoutWordDocument(source.document, measure);
  expect(layout.pages[0]!.columns[0]!.lines[0]!.fragments.map(f => f.text).join('')).toBe(`Before${arrow}After`);
  const block = importWordContent(source)[0]!;
  if (block.kind !== 'paragraph') throw Error('Expected paragraph');
  expect(block.runs.map(r => r.text)).toEqual(['Before', arrow, 'After']);
  const model = new NativeWordDocument({ source });
  expect(model.layout(measure).pages[0]!.columns[0]!.lines[0]!.fragments.map(f => f.text).join('')).toBe(`Before${arrow}After`);
  model.update([{ ...block, runs: block.runs.map(r => r.text === 'After' ? { ...r, text: 'Edited' } : r) }]);
  const exported = model.artifact();
  expect(exported.document.source.source).toContain(`<w:sym w:font="Wingdings" w:char="${char}"/>`);
  expect(wordParagraphText(exported.document, paragraph(exported))).toBe(`Before${arrow}Edited`);
});

test('unmapped symbols retain their font and code while ordinary Unicode symbols render literally', () => {
  for (const [font, char, expected] of [['Custom Symbol', 'F041', '\uf041'], ['Arial', '03A9', '\u03a9']]) {
    const source = fixture(`<w:sym w:font="${font}" w:char="${char}"/>`);
    const fragments = layoutWordDocument(source.document, measure).pages[0]!.columns[0]!.lines[0]!.fragments;
    expect(fragments.find(f => f.text === expected)?.format.fontFamily).toBe(font!);
    expect(fragments.find(f => f.text === 'Before')?.format.fontFamily).not.toBe(font!);
    const block = importWordContent(source)[0]!;
    if (block.kind !== 'paragraph') throw Error('Expected paragraph');
    expect(block.runs[1]!.format?.fontFamily).toBe(font!);
  }
});

test('can delete, replace and insert beside symbols without producing invalid sym elements', () => {
  const source = fixture();
  const p = paragraph(source);
  const select = (start: number, end: number) => ({ anchor: { paragraphElementId: p.elementId, offset: start }, focus: { paragraphElementId: p.elementId, offset: end } });
  const deleted = source.replaceText(select(6, 8), '');
  expect(wordParagraphText(deleted.document, paragraph(deleted))).toBe('BeforeAfter');
  expect(deleted.document.source.source).not.toContain('<w:sym');
  const replaced = source.replaceText(select(6, 8), 'X');
  expect(wordParagraphText(replaced.document, paragraph(replaced))).toBe('BeforeXAfter');
  const inserted = source.replaceText(select(8, 8), 'X');
  expect(wordParagraphText(inserted.document, paragraph(inserted))).toBe(`Before${arrow}XAfter`);
  expect(inserted.document.source.source).toContain('<w:sym w:font="Wingdings" w:char="F0DF"/>');
});

test('invalid symbol codes remain preserved and do not inject malformed text', () => {
  for (const char of ['XXXX', 'D800', 'FFFF', '000000']) {
    const source = fixture(`<w:sym w:font="Wingdings" w:char="${char}"/>`);
    expect(wordParagraphText(source.document, paragraph(source))).toBe('BeforeAfter');
    expect(source.document.source.source).toContain(`w:char="${char}"`);
  }
});
