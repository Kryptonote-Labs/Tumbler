import { expect, test } from 'bun:test';
import { importWordContent, layoutWordDocument, NativeWordDocument, openWordArtifact, resolveWordColour } from '../src/index.ts';
import { wordTextCss } from '../../svelte/src/word-font-metrics.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';

const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const measure = { measure: (text: string) => ({ width: text.length * 6, ascent: 9, descent: 3 }) };
function fixture() {
  return openWordArtifact(buildWordDocumentFixture({
    documentXml: `<w:document xmlns:w="${ns}"><w:body><w:p>
      <w:r><w:rPr><w:shd w:val="clear" w:fill="4C94D8" w:themeFill="text2" w:themeFillTint="80"/></w:rPr><w:t>Shaded</w:t></w:r>
      <w:r><w:rPr><w:shd w:val="nil" w:fill="FF0000"/></w:rPr><w:t>Clear</w:t></w:r>
      <w:r><w:rPr><w:highlight w:val="yellow"/></w:rPr><w:t>Highlighted</w:t></w:r>
      <w:r><w:rPr><w:shd w:val="solid" w:color="008800" w:fill="FF0000"/></w:rPr><w:t>Solid</w:t></w:r>
    </w:p></w:body></w:document>`,
    relationships: [{ id: 'styles', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles', target: 'styles.xml' }],
    parts: [{ itemName: 'word/styles.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml', xml: `<w:styles xmlns:w="${ns}"><w:docDefaults><w:rPrDefault><w:rPr><w:shd w:val="clear" w:fill="112233"/></w:rPr></w:rPrDefault></w:docDefaults></w:styles>` }],
  }));
}

test('imports run shading, inheritance and explicit clearing separately from highlighting', () => {
  const source = fixture();
  const runs = layoutWordDocument(source.document, measure).pages[0]!.columns[0]!.lines[0]!.fragments;
  expect(runs.map(r => r.format.shading)).toEqual(['#4c94d8', 'transparent', '#112233', '#008800']);
  expect(wordTextCss(runs[0]!.format)).toContain('background-color:#4c94d8');
  expect(wordTextCss(runs[2]!.format)).toContain('background-color:#FFFF00');
  const blocks = importWordContent(source);
  const first = blocks[0]!;
  if (first.kind !== 'paragraph') throw Error('Expected paragraph');
  expect(first.runs[0]!.format?.shading).toEqual({ theme: 'dk2', tint: 128, fallback: '#4c94d8' });
  expect(first.runs[0]!.format?.highlight).toBeUndefined();
  const model = new NativeWordDocument({ source });
  model.update([{ ...first, runs: first.runs.map((r, i) => i === 0 ? { ...r, text: 'Edited' } : r) }]);
  const exported = model.artifact();
  const again = importWordContent(exported)[0]!;
  if (again.kind !== 'paragraph') throw Error('Expected paragraph');
  expect(again.runs[0]!.format?.shading).toEqual(first.runs[0]!.format?.shading);
  expect(again.runs[0]!.text).toBe('Edited');
});

test('native authoring resolves theme shading and exports changes to existing run shading', () => {
  const source = fixture();
  const block = importWordContent(source)[0]!;
  if (block.kind !== 'paragraph') throw Error('Expected paragraph');
  const shading = { theme: 'accent1', tint: 128, fallback: '#123456' } as const;
  const model = new NativeWordDocument({ source });
  model.update([{ ...block, runs: [{ ...block.runs[0]!, format: { shading } }] }]);
  const fragment = model.layout(measure).pages[0]!.columns[0]!.lines[0]!.fragments[0]!;
  expect(fragment.format.shading).toBe(resolveWordColour(shading, model.themeColours));
  const exported = importWordContent(model.artifact())[0]!;
  if (exported.kind !== 'paragraph') throw Error('Expected paragraph');
  expect(exported.runs[0]!.format?.shading).toEqual(shading);
});
