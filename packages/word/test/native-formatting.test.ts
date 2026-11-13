import { expect, test } from 'bun:test';
import { NativeWordDocument, importWordContent, openWordArtifact, patchWordRunFormat } from '../src/index.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';

for (const conformance of ['strict', 'transitional'] as const) {
  test(`${conformance}: native format patches clear direct values and preserve style inheritance on export`, () => {
    const ns = conformance === 'strict' ? 'http://purl.oclc.org/ooxml/wordprocessingml/main' : 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const rel = conformance === 'strict' ? 'http://purl.oclc.org/ooxml/officeDocument/relationships' : 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const source = openWordArtifact(buildWordDocumentFixture({ conformance,
      relationships: [{ id: 'styles', type: `${rel}/styles`, target: 'styles.xml' }],
      parts: [{ itemName: 'word/styles.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml', xml: `<w:styles xmlns:w="${ns}"><w:style w:type="paragraph" w:styleId="Named"><w:rPr><w:b/><w:highlight w:val="green"/></w:rPr></w:style></w:styles>` }],
      documentXml: `<w:document xmlns:w="${ns}" xmlns:ext="urn:keep"><w:body><w:p><w:pPr><w:pStyle w:val="Named"/></w:pPr><w:r><w:rPr><w:b w:val="0"/><w:highlight w:val="yellow"/><ext:keep/></w:rPr><w:t>Text</w:t></w:r></w:p></w:body></w:document>`,
    }));
    const content = importWordContent(source);
    const paragraph = content[0]!;
    if (paragraph.kind !== 'paragraph') throw new Error('Expected paragraph');
    for (const highlight of [null, 'none', 'red'] as const) {
      const runs = paragraph.runs.map(run => patchWordRunFormat(run, { highlight, bold: null }));
      const native = new NativeWordDocument({ source, content: [{ ...paragraph, runs }] });
      const block = native.blocks[0]!;
      if (block.kind !== 'paragraph' || block.inlines[0]?.kind !== 'run') throw new Error('Expected run');
      const expected = highlight === null ? 'green' : highlight;
      expect(native.runFormat(block, block.inlines[0]).highlight).toBe(expected);
      expect(native.runFormat(block, block.inlines[0]).bold).toBe(true);
      const reopened = openWordArtifact(native.artifact().bytes()).document;
      const p = reopened.blocks[0]!;
      if (p.kind !== 'paragraph' || p.inlines[0]?.kind !== 'run') throw new Error('Expected run');
      expect(reopened.styles.runFormat(reopened, p, p.inlines[0]).highlight).toBe(expected);
      expect(reopened.styles.runFormat(reopened, p, p.inlines[0]).bold).toBe(true);
      expect(reopened.source.elements('urn:keep', 'keep')).toHaveLength(1);
    }
  });
}

