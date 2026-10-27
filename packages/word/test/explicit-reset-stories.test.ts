import { expect, test } from 'bun:test';
import { importWordContent, NativeWordDocument, openWordArtifact, wordStoryArtifact } from '../src/index.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';

for (const conformance of ['strict', 'transitional'] as const) {
  const ns = conformance === 'strict' ? 'http://purl.oclc.org/ooxml/wordprocessingml/main' : 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const rel = conformance === 'strict' ? 'http://purl.oclc.org/ooxml/officeDocument/relationships' : 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  for (const kind of ['header', 'footer'] as const) test(`${conformance} ${kind} reset removes direct tabs and their metadata`, () => {
    const root = kind === 'header' ? 'hdr' : 'ftr';
    const part = `/word/${kind}.xml`;
    const source = openWordArtifact(buildWordDocumentFixture({
      conformance,
      relationships: [{ id: 'story', type: `${rel}/${kind}`, target: `${kind}.xml` }],
      parts: [{ itemName: part.slice(1), contentType: `application/vnd.openxmlformats-officedocument.wordprocessingml.${kind}+xml`,
        xml: `<w:${root} xmlns:w="${ns}" xmlns:ext="urn:custom"><w:p><w:pPr><w:tabs><w:tab w:val="left" w:pos="720" ext:hint="keep"/></w:tabs></w:pPr><w:r><w:t>Story</w:t></w:r></w:p></w:${root}>` }],
      documentXml: `<w:document xmlns:w="${ns}" xmlns:r="${rel}"><w:body><w:p><w:r><w:t>Body</w:t></w:r></w:p><w:sectPr><w:${kind}Reference w:type="default" r:id="story"/></w:sectPr></w:body></w:document>`,
    }));
    const content = importWordContent(wordStoryArtifact(source, part));
    const first = content[0]!;
    if (first.kind !== 'paragraph') throw new Error('Expected story paragraph');
    const model = new NativeWordDocument({ source });
    const story = model.updateStory(part, content);
    for (const positioning of [
      { reset: true as const },
      { reset: true as const, tabs: [{ positionTwips: 1440, alignment: 'start' as const, leader: 'none' as const }] },
    ]) {
      model.updateStory(part, [
        { ...first, positioning },
        { kind: 'paragraph', styleId: 'Heading1', runs: [{ text: 'New style' }] },
      ]);
      const current = story.blocks[0]!;
      if (current.kind !== 'paragraph') throw new Error('Expected story paragraph');
      expect(story.paragraphFormat(current).tabs.map(tab => tab.positionTwips)).toEqual(positioning.tabs ? [1440] : []);
      const output = wordStoryArtifact(model.artifact(), part).document;
      expect(output.source.elements(ns, 'tabs')).toHaveLength(positioning.tabs ? 1 : 0);
      expect(output.source.source).not.toContain('ext:hint');
    }
  });
}
