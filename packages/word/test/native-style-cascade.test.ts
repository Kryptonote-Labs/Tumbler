import { expect, test } from 'bun:test';
import { NativeWordDocument, importWordContent, openWordArtifact } from '../src/index.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';

for (const conformance of ['strict', 'transitional'] as const) {
  for (const property of ['bold', 'italic', 'strike'] as const) {
    test(`${conformance}: ${property} survives native text edits and resolves again on style changes`, () => {
      const w = conformance === 'strict' ? 'http://purl.oclc.org/ooxml/wordprocessingml/main' : 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
      const rel = conformance === 'strict' ? 'http://purl.oclc.org/ooxml/officeDocument/relationships' : 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
      const tag = { bold: 'b', italic: 'i', strike: 'strike' }[property];
      const source = openWordArtifact(buildWordDocumentFixture({
        conformance,
        relationships: [{ id: 's', type: `${rel}/styles`, target: 'styles.xml' }],
        parts: [{ itemName: 'word/styles.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml', xml: `<w:styles xmlns:w="${w}"><w:style w:type="paragraph" w:styleId="P"><w:rPr><w:${tag}/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Plain"/><w:style w:type="character" w:styleId="C"><w:rPr><w:${tag}/></w:rPr></w:style></w:styles>` }],
        documentXml: `<w:document xmlns:w="${w}"><w:body><w:p><w:pPr><w:pStyle w:val="P"/></w:pPr><w:r><w:rPr><w:rStyle w:val="C"/></w:rPr><w:t>Inherited</w:t></w:r><w:r><w:rPr><w:rStyle w:val="C"/><w:${tag}/></w:rPr><w:t>Direct</w:t></w:r></w:p></w:body></w:document>`,
      }));
      const original = importWordContent(source)[0];
      if (original?.kind !== 'paragraph') throw new Error('Expected paragraph');
      const native = new NativeWordDocument({ source });
      const values = () => {
        const p = native.blocks[0];
        if (p?.kind !== 'paragraph') throw new Error('Expected native paragraph');
        const actual = p.inlines.map(run => run.kind === 'run' && native.runFormat(p, run)[property]);
        const exported = native.artifact().document;
        const reopened = exported.blocks[0];
        if (reopened?.kind !== 'paragraph') throw new Error('Expected exported paragraph');
        expect(reopened.inlines.map(run => run.kind === 'run' && exported.styles.runFormat(exported, reopened, run)[property])).toEqual(actual);
        return actual;
      };
      expect(values()).toEqual([false, true]);
      native.update([{ ...original, runs: original.runs.map(run => ({ ...run, text: run.text + ' edited' })) }]);
      expect(values()).toEqual([false, true]);
      native.update([{ ...original, styleId: 'Plain', runs: original.runs.map(({ format: _format, ...run }) => run) }]);
      expect(values()).toEqual([true, true]);
    });
  }
}
