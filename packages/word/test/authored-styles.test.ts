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


test('reapplying an imported style resets omitted direct overrides without changing the style id', () => {
  const source = createWordArtifact({ paragraphs: [{ styleId: 'Heading1', paragraph: { spacingBeforeTwips: 0 }, runs: [{ text: 'Heading', format: { fontSizePoints: 34, bold: false } }] }] });
  const first = importWordContent(source)[0]!;
  if (first.kind !== 'paragraph') throw Error('paragraph');
  const native = new NativeWordDocument({ source });
  native.update([{ kind: 'paragraph', source: first.source!, styleId: 'Heading1', runs: first.runs.map(({ format, ...run }) => run) }]);
  const measure = { measure: (_: string, format: { fontSizePoints: number }) => ({ width: format.fontSizePoints, ascent: 9, descent: 3 }) };
  const fragments = native.layout(measure).pages[0]!.columns[0]!.lines[0]!.fragments;
  expect(fragments[0]!.format).toMatchObject({ fontSizePoints: 20, bold: true });
  expect(importWordContent(native.artifact())[0]).toMatchObject({ styleId: 'Heading1', paragraph: { spacingBeforeTwips: 240 }, runs: [{ format: { fontSizePoints: 20, bold: true } }] });
});

test('style reapplication clears paragraph overrides and keeps character-style inheritance', async () => {
  const { buildWordDocumentFixture } = await import('./document-fixture.ts');
  const { openWordArtifact } = await import('../src/index.ts');
  const namespace = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const source = openWordArtifact(buildWordDocumentFixture({
    documentXml: `<w:document xmlns:w="${namespace}"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/><w:pBdr><w:bottom w:val="single" w:sz="8"/></w:pBdr><w:shd w:fill="FFFF00"/><w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs><w:ind w:left="720"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rStyle w:val="Hyperlink"/><w:sz w:val="68"/><w:color w:val="FF0000"/></w:rPr><w:t>Linked heading</w:t></w:r></w:p></w:body></w:document>`,
    relationships: [{ id: 'styles', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles', target: 'styles.xml' }],
    parts: [{ itemName: 'word/styles.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml', xml: `<w:styles xmlns:w="${namespace}"><w:style w:type="character" w:styleId="Hyperlink"><w:rPr><w:color w:val="0000FF"/><w:u w:val="single"/></w:rPr></w:style></w:styles>` }],
  }));
  const first = importWordContent(source)[0]!;
  if (first.kind !== 'paragraph') throw Error('paragraph');
  const native = new NativeWordDocument({ source });
  native.update([{ kind: 'paragraph', source: first.source!, styleId: 'Heading1', runs: first.runs.map(({ format, ...run }) => run) }]);
  const output = native.artifact();
  expect(output.document.source.source).not.toMatch(/<w:(pBdr|shd|tabs|ind|jc)\b/);
  const p = output.document.blocks[0]!;
  if (p.kind !== 'paragraph' || p.inlines[0]?.kind !== 'run') throw Error('paragraph');
  const exported = output.document.styles.runFormat(output.document, p, p.inlines[0]);
  expect(exported).toMatchObject({ fontSizePoints: 20, color: '#0000FF', underline: 'single' });
  const fragment = native.layout({ measure: () => ({ width: 20, ascent: 9, descent: 3 }) }).pages[0]!.columns[0]!.lines[0]!.fragments[0]!;
  expect(fragment.format).toEqual(exported);
});

test('authoring rejects empty or control-character style identifiers', () => {
  for (const styleId of ['', 'Heading\u0000', 'Heading\n']) {
    const paragraphs = [{ styleId, runs: [{ text: 'Heading' }] }];
    expect(() => createWordArtifact({ paragraphs })).toThrow('Invalid paragraph style id.');
    expect(() => new NativeWordDocument().update(paragraphs.map(p => ({ kind: 'paragraph' as const, ...p })))).toThrow('Invalid paragraph style id.');
  }
});
