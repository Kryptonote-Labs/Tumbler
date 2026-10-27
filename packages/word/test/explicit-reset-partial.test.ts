import { expect, test } from 'bun:test';
import { importWordContent, NativeWordDocument, openWordArtifact } from '../src/index.ts';
import { openWordOperationDocument, prepareWordOperation } from '../src/operations/index.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';

for (const conformance of ['strict', 'transitional'] as const) {
  const ns = conformance === 'strict' ? 'http://purl.oclc.org/ooxml/wordprocessingml/main' : 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const rel = conformance === 'strict' ? 'http://purl.oclc.org/ooxml/officeDocument/relationships' : 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const source = () => openWordArtifact(buildWordDocumentFixture({ conformance,
    relationships: [{ id: 'styles', type: `${rel}/styles`, target: 'styles.xml' }],
    parts: [{ itemName: 'word/styles.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml', xml: `<w:styles xmlns:w="${ns}"><w:style w:type="paragraph" w:styleId="Named"><w:pPr><w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs><w:ind w:left="240" w:start="240"/></w:pPr></w:style></w:styles>` }],
    documentXml: `<w:document xmlns:w="${ns}" xmlns:ext="urn:custom"><w:body><w:p><w:pPr><w:pStyle w:val="Named"/><w:tabs><w:tab w:val="clear" w:pos="720"/><w:tab w:val="left" w:pos="1440"/></w:tabs><w:ind w:left="1080" w:start="1080" ext:hint="keep"><ext:keep/></w:ind></w:pPr><w:r><w:t>Hello</w:t></w:r></w:p></w:body></w:document>`,
  }));

  test(`${conformance} indent-only edits retain direct tab clears and opaque indent metadata`, () => {
    const artifact = source();
    const session = openWordOperationDocument(artifact);
    try {
      session.text.applyDelta(prepareWordOperation(session.text, { start: 0, end: 5 }, {
        name: 'paragraph', input: { positioning: { indentEndTwips: 360 } },
      }).delta);
      const output = session.artifact().document;
      const paragraph = output.blocks[0]!;
      if (paragraph.kind !== 'paragraph') throw new Error('Expected paragraph');
      expect(output.styles.paragraphFormat(output, paragraph).tabs.map(tab => tab.positionTwips)).toEqual([1440]);
      expect(output.source.source).toContain('w:val="clear"');
      expect(output.source.source).toContain('ext:hint="keep"');
      expect(output.source.elements('urn:custom', 'keep')).toHaveLength(1);
      const imported = importWordContent(artifact)[0]!;
      if (imported.kind !== 'paragraph') throw new Error('Expected paragraph');
      const native = new NativeWordDocument({ source: artifact, content: [{ ...imported, positioning: { ...imported.positioning, indentEndTwips: 360 } }] });
      const block = native.blocks[0]!;
      if (block.kind !== 'paragraph') throw new Error('Expected paragraph');
      expect(native.paragraphFormat(block).tabs.map(tab => tab.positionTwips)).toEqual([1440]);
      expect(native.paragraphFormat(block).indentStartTwips).toBe(1080);
    } finally { session.destroy(); }
  });

  test(`${conformance} explicit effective-looking tab replacements remove old clears without rewriting indents`, () => {
    const session = openWordOperationDocument(source());
    try {
      session.text.applyDelta(prepareWordOperation(session.text, { start: 0, end: 5 }, {
        name: 'paragraph', input: { positioning: { tabs: [{ positionTwips: 1440, alignment: 'start', leader: 'none' }] } },
      }).delta);
      const output = session.artifact().document;
      const paragraph = output.blocks[0]!;
      if (paragraph.kind !== 'paragraph') throw new Error('Expected paragraph');
      expect(output.styles.paragraphFormat(output, paragraph).tabs.map(tab => tab.positionTwips)).toEqual([720, 1440]);
      expect(output.source.source).not.toContain('w:val="clear"');
      expect(output.source.source).toContain('ext:hint="keep"');
      expect(output.source.elements('urn:custom', 'keep')).toHaveLength(1);
    } finally { session.destroy(); }
  });
}
