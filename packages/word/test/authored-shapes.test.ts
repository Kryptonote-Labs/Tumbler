import { expect, test } from 'bun:test';
import { createWordArtifact, importWordContent, NativeWordDocument, WORD_SHAPE_PRESETS, type WordAuthoredShape } from '../src/index.ts';
test('editable shapes retain geometry, fill, outline and text through authored and imported edits', () => {
  for (const preset of WORD_SHAPE_PRESETS) {
    const shape: WordAuthoredShape = { preset, width: 120, height: 60, fill: '#CCDDEE', outline: '#112233', outlineWidth: 1, text: 'Hello' };
    const source = createWordArtifact({ paragraphs: [{ runs: [{ text: '\uFFFC', shape }, { text: ' beside' }] }] });
    const first = importWordContent(source)[0]!;
    if (first.kind !== 'paragraph') throw Error('paragraph');
    expect(first.runs[0]!.shape).toMatchObject(shape);
    const model = new NativeWordDocument({ source });
    model.update([{ ...first, runs: [{ ...first.runs[0]!, shape: { ...shape, width: 200, fill: '#FF0000' } }, ...first.runs.slice(1)] }]);
    expect(importWordContent(model.artifact())[0]).toMatchObject({ runs: [{ shape: { ...shape, width: 200, fill: '#FF0000' } }, { text: ' beside' }] });
    expect([...model.drawings.values()][0]).toMatchObject({ kind: 'shape', widthPoints: 200 });
  }
});


test('editing neighbouring text preserves unchanged shape markup and source anchors', async () => {
  const { buildWordDocumentFixture } = await import('./document-fixture.ts');
  const { openWordArtifact } = await import('../src/index.ts');
  const created = createWordArtifact({ paragraphs: [{ runs: [{ text: '\uFFFC', shape: { preset: 'rect', width: 100, height: 50, fill: '#ABCDEF', outline: '#000000', outlineWidth: 1 } }, { text: ' before' }] }] });
  const xml = created.document.source.source.replace('<a:prstGeom', '<a:effectLst><a:glow rad="12700"><a:srgbClr val="FFFFFF"/></a:glow></a:effectLst><a:prstGeom').replace('<w:r><w:drawing', '<w:bookmarkStart w:id="7" w:name="ShapeAnchor"/><w:r><w:drawing').replace('</w:drawing></w:r>', '</w:drawing></w:r><w:bookmarkEnd w:id="7"/>');
  const source = openWordArtifact(buildWordDocumentFixture({ documentXml: xml }));
  const paragraph = importWordContent(source)[0]!;
  if (paragraph.kind !== 'paragraph') throw new Error('Expected paragraph');
  const model = new NativeWordDocument({ source });
  model.update([{ ...paragraph, runs: [paragraph.runs[0]!, { ...paragraph.runs[1]!, text: ' after' }] }]);
  const result = model.artifact().document.source.source;
  expect(result).toContain('<a:glow rad="12700">');
  expect(result.match(/w:bookmarkStart/g)).toHaveLength(1);
  expect(result.match(/w:bookmarkEnd/g)).toHaveLength(1);
  expect(result).toContain(' after');
});

test('complex imported shape appearance remains opaque and survives neighbouring edits', async () => {
  const { buildWordDocumentFixture } = await import('./document-fixture.ts');
  const { openWordArtifact } = await import('../src/index.ts');
  const created = createWordArtifact({ paragraphs: [{ runs: [{ text: '\uFFFC', shape: { preset: 'rect', width: 100, height: 50, fill: '#ABCDEF', outline: '#000000', outlineWidth: 1 } }, { text: ' before' }] }] });
  for (const transform of [
    (xml: string) => xml.replace('<a:srgbClr val="ABCDEF"/>', '<a:schemeClr val="accent1"/>'),
    (xml: string) => xml.replace('<a:xfrm>', '<a:xfrm rot="5400000">'),
    (xml: string) => xml.replace('<wps:wsp>', '<wpg:wgp xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"><wps:wsp>').replace('</wps:wsp>', '</wps:wsp></wpg:wgp>'),
  ]) {
    const xml = transform(created.document.source.source);
    const source = openWordArtifact(buildWordDocumentFixture({ documentXml: xml }));
    expect([...source.document.drawings.values()][0]!.kind).toBe('unsupported');
    const paragraph = importWordContent(source)[0]!;
    if (paragraph.kind !== 'paragraph') throw new Error('Expected paragraph');
    const model = new NativeWordDocument({ source });
    model.update([{ ...paragraph, runs: [paragraph.runs[0]!, { ...paragraph.runs[1]!, text: ' after' }] }]);
    const original = source.document.source.elements().find(element => element.localName === 'drawing')!;
    const markup = xml.slice(original.span.start, original.span.end);
    expect(model.artifact().document.source.source).toContain(markup);
  }
});
