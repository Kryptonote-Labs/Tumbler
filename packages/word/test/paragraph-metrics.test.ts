import { expect, test } from 'bun:test';
import { importWordContent, layoutWordDocument, NativeWordDocument, openWordArtifact, type ComputedWordTextFormat } from '../src/index.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';

const word = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const measure = { measure: (text: string, f: ComputedWordTextFormat) => ({ width: text.length * f.fontSizePoints / 2, ascent: f.fontSizePoints * .8, descent: f.fontSizePoints * .2 }) };
function artifact(spacing = '<w:spacing w:line="276" w:lineRule="auto"/>') {
  return openWordArtifact(buildWordDocumentFixture({ documentXml: `<w:document xmlns:w="${word}"><w:body>
    <w:p><w:pPr>${spacing}<w:rPr><w:rFonts w:ascii="Times New Roman"/><w:sz w:val="36"/></w:rPr></w:pPr></w:p>
    <w:p><w:pPr>${spacing}</w:pPr><w:r><w:rPr><w:sz w:val="48"/></w:rPr><w:t>Title</w:t></w:r></w:p>
    <w:sectPr><w:pgSz w:w="4000" w:h="1400"/><w:pgMar w:top="200" w:bottom="200" w:left="200" w:right="200"/></w:sectPr>
    </w:body></w:document>` }));
}

test('paragraph marks preserve blank-line sizing through import and native pagination', () => {
  const source = artifact();
  const content = importWordContent(source);
  expect(content[0]).toMatchObject({ runs: [{ text: '', format: { fontFamily: 'Times New Roman', fontSizePoints: 18 } }] });
  const native = new NativeWordDocument({ source });
  native.update(content);
  for (const layout of [layoutWordDocument(source.document, measure), native.layout(measure)]) {
    const lines = layout.pages[0]!.columns[0]!.lines;
    expect(lines[0]!.height).toBeCloseTo(18 * 1.15);
    expect(lines[1]!.height).toBeCloseTo(24 * 1.15);
  }
});

test('actual text size and line spacing determine page breaks', () => {
  const source = artifact('<w:spacing w:line="480" w:lineRule="auto"/>');
  const layout = layoutWordDocument(source.document, measure);
  expect(layout.pages).toHaveLength(2);
  expect(layout.pages[0]!.columns[0]!.lines[0]!.height).toBeCloseTo(36);
  expect(layout.pages[1]!.columns[0]!.lines[0]!.height).toBeCloseTo(48);
});

test('changing the size of an empty native paragraph changes its line height', () => {
  const native = new NativeWordDocument();
  native.update([{ kind: 'paragraph', runs: [{ text: '', format: { fontSizePoints: 30 } }] }]);
  expect(native.layout(measure).pages[0]!.columns[0]!.lines[0]!.height).toBeCloseTo(30);
});

test('exact line spacing can be smaller than the text; at-least spacing cannot', () => {
  for (const [rule, expected] of [['exact', 10], ['atLeast', 24]] as const) {
    const source = artifact(`<w:spacing w:line="200" w:lineRule="${rule}"/>`);
    expect(layoutWordDocument(source.document, measure).pages[0]!.columns[0]!.lines[1]!.height).toBeCloseTo(expected);
  }
});
