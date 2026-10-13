import { expect, test } from 'bun:test';
import { createWordArtifact, importWordContent, NativeWordDocument, WORD_BUILTIN_STYLES } from '../src/index.ts';

test('built-in paragraph styles have matching native and exported formatting', () => {
  for (const style of WORD_BUILTIN_STYLES) {
    const native = new NativeWordDocument();
    native.update([{ kind: 'paragraph', styleId: style.styleId, runs: [{ text: 'Heading' }] }]);
    const artifact = native.artifact();
    const p = artifact.document.blocks[0]!;
    if (p.kind !== 'paragraph') throw Error('paragraph');
    expect(artifact.document.styles.paragraphFormat(artifact.document, p).styleId).toBe(style.styleId);
    const lines = native.layout({ measure: (_, format) => ({ width: format.fontSizePoints, ascent: 9, descent: 3 }) }).pages[0]!.columns[0]!.lines;
    expect(lines[0]!.fragments[0]!.format.fontSizePoints).toBe(artifact.document.styles.runFormat(artifact.document, p, p.inlines[0]?.kind === 'run' ? p.inlines[0] : undefined).fontSizePoints);
  }
});

test('applying heading then normal clears the old direct formatting in imported content', () => {
  const source = createWordArtifact({ paragraphs: [{ runs: [{ text: 'Title', format: { fontSizePoints: 10 } }] }] });
  const first = importWordContent(source)[0]!;
  if (first.kind !== 'paragraph') throw Error('paragraph');
  const native = new NativeWordDocument({ source });
  for (const styleId of ['Heading1', 'Normal']) {
    native.update([{ kind: 'paragraph', source: first.source!, styleId, runs: first.runs.map(({ format, ...run }) => run) }]);
    const reopened = importWordContent(native.artifact())[0]!;
    expect(reopened).toMatchObject({ styleId, runs: [{ format: { fontSizePoints: styleId === 'Heading1' ? 20 : 12 } }] });
  }
});

test('style resets remove complex-script direct overrides from imported runs', async () => {
  const { buildWordDocumentFixture } = await import('./document-fixture.ts');
  const { openWordArtifact } = await import('../src/index.ts');
  const source = openWordArtifact(buildWordDocumentFixture({ documentXml: '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:rPr><w:bCs w:val="0"/><w:iCs/><w:szCs w:val="20"/></w:rPr><w:t>مرحبا</w:t></w:r></w:p></w:body></w:document>' }));
  const first = importWordContent(source)[0]!;
  if (first.kind !== 'paragraph') throw Error('paragraph');
  const native = new NativeWordDocument({ source });
  native.update([{ kind: 'paragraph', source: first.source!, styleId: 'Heading1', runs: first.runs.map(({ format, ...run }) => run) }]);
  const output = native.artifact();
  expect(output.document.source.source).not.toMatch(/<w:(szCs|bCs|iCs)\b/);
  expect(importWordContent(output)[0]).toMatchObject({ paragraph: { keepNext: true, spacingBeforeTwips: 240 }, runs: [{ format: { fontSizePoints: 20, bold: true } }] });
});
