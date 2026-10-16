import { expect, test } from 'bun:test';
import { OOXML_NAMESPACES, ThemeColorScheme } from '@tumblerjs/ooxml';
import { importWordContent, layoutWordDocument, NativeWordDocument, openWordArtifact } from '../src/index.ts';
import { wordThemeXml } from '../src/theme-colour-xml.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';

const measurer = { measure: (text: string) => ({ width: text.length * 6, ascent: 9, descent: 3 }) };
function fixture(background: string, conformance: 'strict' | 'transitional' = 'transitional') {
  const ns = OOXML_NAMESPACES[conformance].wordprocessing;
  return openWordArtifact(buildWordDocumentFixture({
    conformance,
    documentXml: `<w:document xmlns:w="${ns}">${background}<w:body><w:p><w:r><w:t>Light Blue</w:t><w:br w:type="page"/><w:t>Second page</w:t></w:r></w:p></w:body></w:document>`,
    relationships: [{ id: 'theme', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme', target: 'theme/theme1.xml' }],
    parts: [{ itemName: 'word/theme/theme1.xml', contentType: 'application/vnd.openxmlformats-officedocument.theme+xml', xml: wordThemeXml(new ThemeColorScheme('Custom', new Map([['accent1', '4F81BD']]))) }],
  }));
}

for (const conformance of ['strict', 'transitional'] as const) {
  test(`${conformance} page colour reaches package and native layouts and survives editing/export`, () => {
    const source = fixture('<w:background w:color="C1E4F5"/>', conformance);
    expect(source.document.background).toBe('#C1E4F5');
    const layout = layoutWordDocument(source.document, measurer);
    expect(layout.pages).toHaveLength(2);
    expect(layout.background).toBe('#C1E4F5');
    const model = new NativeWordDocument({ source });
    const blocks = importWordContent(source);
    const first = blocks[0]!;
    if (first.kind !== 'paragraph') throw new Error('Expected paragraph');
    model.update([{ ...first, runs: [{ text: 'Edited' }] }, ...blocks.slice(1)]);
    expect(model.layout(measurer).background).toBe('#C1E4F5');
    expect(openWordArtifact(model.artifact().bytes()).document.background).toBe('#C1E4F5');
  });
}

test('theme colour and tint override RGB and retain their identity', () => {
  const source = fixture('<w:background w:color="FF0000" w:themeColor="accent1" w:themeTint="99"/>');
  expect(source.document.background).toEqual({ theme: 'accent1', tint: 153, fallback: '#95b3d7' });
  expect(layoutWordDocument(source.document, measurer).background).toBe('#95b3d7');
  expect(new NativeWordDocument({ source }).layout(measurer).background).toBe('#95b3d7');
});

test('theme shade resolves against the document theme', () => {
  const source = fixture('<w:background w:themeColor="accent1" w:themeShade="00"/>');
  expect(layoutWordDocument(source.document, measurer).background).toBe('#000000');
});

for (const background of ['', '<w:background w:color="auto"/>', '<w:background w:color="invalid"/>']) {
  test(`unspecified colour uses the viewer default: ${background}`, () => {
    const source = fixture(background);
    expect(source.document.background).toBeUndefined();
    expect(layoutWordDocument(source.document, measurer).background).toBeUndefined();
    expect(new NativeWordDocument({ source }).layout(measurer).background).toBeUndefined();
  });
}
