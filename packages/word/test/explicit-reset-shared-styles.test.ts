import { expect, test } from 'bun:test';
import { importWordContent, NativeWordDocument, openWordArtifact, wordStoryArtifact } from '../src/index.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';

for (const conformance of ['strict', 'transitional'] as const) {
  test(`${conformance} reset inheritance and retained header clears follow added and removed styles`, () => {
    const ns = conformance === 'strict' ? 'http://purl.oclc.org/ooxml/wordprocessingml/main' : 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const rel = conformance === 'strict' ? 'http://purl.oclc.org/ooxml/officeDocument/relationships' : 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const source = openWordArtifact(buildWordDocumentFixture({ conformance,
      relationships: [
        { id: 's', type: `${rel}/styles`, target: 'styles.xml' },
        { id: 'h', type: `${rel}/header`, target: 'header.xml' },
      ],
      parts: [
        { itemName: 'word/styles.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml', xml: `<w:styles xmlns:w="${ns}"><w:style w:type="paragraph" w:styleId="Normal"><w:pPr><w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs></w:pPr></w:style><w:style w:type="paragraph" w:styleId="Named"><w:basedOn w:val="Heading1"/><w:pPr><w:tabs><w:tab w:val="left" w:pos="900"/></w:tabs></w:pPr></w:style></w:styles>` },
        { itemName: 'word/header.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml', xml: `<w:hdr xmlns:w="${ns}"><w:p><w:pPr><w:pStyle w:val="Named"/><w:tabs><w:tab w:val="clear" w:pos="900"/><w:tab w:val="left" w:pos="1440"/></w:tabs></w:pPr><w:r><w:t>Header</w:t></w:r></w:p></w:hdr>` },
      ],
      documentXml: `<w:document xmlns:w="${ns}" xmlns:r="${rel}"><w:body><w:p><w:pPr><w:pStyle w:val="Named"/><w:tabs><w:tab w:val="left" w:pos="1800"/></w:tabs></w:pPr><w:r><w:t>Body</w:t></w:r></w:p><w:sectPr><w:headerReference w:type="default" r:id="h"/></w:sectPr></w:body></w:document>`,
    }));
    const original = importWordContent(source)[0]!;
    if (original.kind !== 'paragraph') throw new Error('Expected paragraph');
    const reset = { ...original, positioning: { reset: true as const } };
    const model = new NativeWordDocument({ source, immutableContent: true, content: [reset] });
    const header = model.updateStory('/word/header.xml', importWordContent(wordStoryArtifact(source, '/word/header.xml')));
    const heading = { kind: 'paragraph', styleId: 'Heading1', runs: [{ text: 'Heading' }] } as const;
    for (const requested of [false, true, false]) {
      model.update(requested ? [reset, heading] : [reset]);
      const body = model.blocks[0]!, story = header.blocks[0]!;
      if (body.kind !== 'paragraph' || story.kind !== 'paragraph') throw new Error('Expected paragraphs');
      const expectedBody = requested ? [720, 900] : [900];
      const expectedHeader = requested ? [720, 1440] : [1440];
      expect(model.paragraphFormat(body).tabs.map(tab => tab.positionTwips)).toEqual(expectedBody);
      expect(header.paragraphFormat(story).tabs.map(tab => tab.positionTwips)).toEqual(expectedHeader);
      const output = model.artifact();
      const exportedHeader = wordStoryArtifact(output, '/word/header.xml').document;
      const paragraph = exportedHeader.blocks[0]!;
      if (paragraph.kind !== 'paragraph') throw new Error('Expected header paragraph');
      expect(exportedHeader.styles.paragraphFormat(exportedHeader, paragraph).tabs.map(tab => tab.positionTwips)).toEqual(expectedHeader);
      expect(exportedHeader.source.source).toContain('w:val="clear"');
      expect(output.document.source.elements(ns, 'tabs')).toHaveLength(0);
    }
  });
}
