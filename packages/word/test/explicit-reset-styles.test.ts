import { expect, test } from 'bun:test';
import { importWordContent, NativeWordDocument, openWordArtifact } from '../src/index.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';

for (const conformance of ['strict', 'transitional'] as const) {
  const ns = conformance === 'strict' ? 'http://purl.oclc.org/ooxml/wordprocessingml/main' : 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const rel = conformance === 'strict' ? 'http://purl.oclc.org/ooxml/officeDocument/relationships' : 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const indent = conformance === 'strict' ? 'start' : 'left';
  for (const styleId of ['Missing', 'Character']) test(`${conformance} reset with ${styleId} style inherits the default paragraph style`, () => {
    const source = openWordArtifact(buildWordDocumentFixture({ conformance,
      relationships: [{ id: 'styles', type: `${rel}/styles`, target: 'styles.xml' }],
      parts: [{ itemName: 'word/styles.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml',
        xml: `<w:styles xmlns:w="${ns}"><w:style w:type="paragraph" w:default="1" w:styleId="Default"><w:pPr><w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs><w:ind w:${indent}="240"/></w:pPr></w:style><w:style w:type="character" w:styleId="Character"/></w:styles>` }],
      documentXml: `<w:document xmlns:w="${ns}"><w:body><w:p><w:pPr><w:pStyle w:val="${styleId}"/><w:ind w:${indent}="1080"/></w:pPr><w:r><w:t>Hello</w:t></w:r></w:p></w:body></w:document>`,
    }));
    const paragraph = importWordContent(source)[0]!;
    if (paragraph.kind !== 'paragraph') throw new Error('Expected paragraph');
    const model = new NativeWordDocument({ source, content: [{ ...paragraph, positioning: { reset: true, tabs: [{ positionTwips: 1440, alignment: 'start', leader: 'none' }] } }] });
    const native = model.blocks[0]!, output = model.artifact().document;
    const exported = output.blocks[0]!;
    if (native.kind !== 'paragraph' || exported.kind !== 'paragraph') throw new Error('Expected paragraphs');
    expect(model.paragraphFormat(native).tabs.map(tab => tab.positionTwips)).toEqual([720, 1440]);
    expect(model.paragraphFormat(native).indentStartTwips).toBe(240);
    expect(output.styles.paragraphFormat(output, exported).tabs).toEqual(model.paragraphFormat(native).tabs);
    expect(output.styles.paragraphFormat(output, exported).indentStartTwips).toBe(240);
  });
  for (const requestHeading of [false, true]) test(`${conformance} resets inherit the exported style catalog with heading requested ${requestHeading}`, () => {
    const source = openWordArtifact(buildWordDocumentFixture({
      conformance,
      relationships: [{ id: 'styles', type: `${rel}/styles`, target: 'styles.xml' }],
      parts: [{ itemName: 'word/styles.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml',
        xml: `<w:styles xmlns:w="${ns}"><w:style w:type="paragraph" w:styleId="Normal"><w:pPr><w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs><w:ind w:${indent}="240"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="Named"><w:basedOn w:val="Heading1"/><w:pPr><w:tabs><w:tab w:val="left" w:pos="900"/></w:tabs></w:pPr></w:style></w:styles>` }],
      documentXml: `<w:document xmlns:w="${ns}"><w:body><w:p><w:pPr><w:pStyle w:val="Named"/><w:ind w:${indent}="1080"/><w:tabs><w:tab w:val="left" w:pos="1440"/></w:tabs></w:pPr><w:r><w:t>Hello</w:t></w:r></w:p></w:body></w:document>`,
    }));
    const paragraph = importWordContent(source)[0]!;
    if (paragraph.kind !== 'paragraph') throw new Error('Expected paragraph');
    for (const replacement of [false, true]) {
      const model = new NativeWordDocument({ source, content: [
        { ...paragraph, positioning: { reset: true, ...(replacement ? { tabs: [{ positionTwips: 2160, alignment: 'start' as const, leader: 'none' as const }] } : {}) } },
        ...(requestHeading ? [{ kind: 'paragraph' as const, styleId: 'Heading1', runs: [{ text: 'Heading' }] }] : []),
      ] });
      const native = model.blocks[0]!;
      if (native.kind !== 'paragraph') throw new Error('Expected native paragraph');
      const format = model.paragraphFormat(native);
      const expectedTabs = [...(requestHeading ? [720] : []), 900, ...(replacement ? [2160] : [])];
      expect(format.tabs.map(tab => tab.positionTwips)).toEqual(expectedTabs);
      expect(format.indentStartTwips).toBe(requestHeading ? 240 : 0);
      const output = model.artifact().document;
      const exported = output.blocks[0]!;
      if (exported.kind !== 'paragraph') throw new Error('Expected exported paragraph');
      const reopened = output.styles.paragraphFormat(output, exported);
      expect(reopened.tabs).toEqual(format.tabs);
      expect(reopened.indentStartTwips).toBe(format.indentStartTwips);
    }
  });
}
