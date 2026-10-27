import { expect, test } from 'bun:test';
import { openWordArtifact } from '../src/index.ts';
import { openWordOperationDocument } from '../src/operations/index.ts';
import { WordSharedText } from '../src/collaboration/structured/index.ts';
import { tableParagraphs } from '../src/collaboration/tables.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';

for (const conformance of ['strict', 'transitional'] as const) {
  const ns = conformance === 'strict' ? 'http://purl.oclc.org/ooxml/wordprocessingml/main' : 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  for (const table of [false, true]) for (const route of ['scoped', 'linear'] as const) {
    test(`${conformance} ${route} reset and unlink in ${table ? 'a migrated cell' : 'the body'} survive export and undo`, () => {
      const paragraph = '<w:p><w:pPr><w:tabs><w:tab w:val="left" w:pos="1440"/></w:tabs><w:ind w:left="720" w:start="720"/></w:pPr><w:hyperlink w:anchor="target"><w:r><w:t>Hello</w:t></w:r></w:hyperlink></w:p>';
      const source = openWordArtifact(buildWordDocumentFixture({ conformance, documentXml: `<w:document xmlns:w="${ns}"><w:body>${table ? `<w:tbl><w:tblGrid><w:gridCol w:w="4000"/></w:tblGrid><w:tr><w:tc>${paragraph}</w:tc></w:tr></w:tbl>` : paragraph}</w:body></w:document>` }));
      const session = openWordOperationDocument(source);
      const owner = session.text.doc!;
      const address = table ? { story: 'body', table: tableParagraphs(session.text)[0]!.table!.id } : undefined;
      if (address) session.commit(session.prepare([{ kind: 'migrate', table: address }]));
      const cell = address ? session.grid(address.table)[0]!.cells[0]!.address : undefined;
      const view = new WordSharedText(owner, 'body');
      const history = session.history();
      const selection = cell ? { cell, range: { start: 0, end: 5 } } : { story: 'body', range: { start: 0, end: 5 } };
      try {
        for (const operation of [
          { name: 'paragraph', input: { positioning: null } },
          { name: 'format', input: { link: null } },
        ] as const) {
          const prepared = route === 'scoped' ? session.prepareOperation(selection, operation)
            : view.prepareOperation(view.range(selection), operation);
          view.commit(prepared, history.origin);
        }
        const output = session.artifact().document;
        expect(output.source.elements(ns, 'ind')).toHaveLength(0);
        expect(output.source.elements(ns, 'tabs')).toHaveLength(0);
        expect(output.source.elements(ns, 'hyperlink')).toHaveLength(0);
        expect(history.undo()).toBe(true);
        expect(session.artifact().document.source.elements(ns, 'hyperlink')).toHaveLength(1);
        expect(history.undo()).toBe(true);
        expect(session.artifact().document.source.elements(ns, 'ind')).toHaveLength(1);
        expect(history.redo()).toBe(true);
        expect(history.redo()).toBe(true);
        expect(session.artifact().document.source.elements(ns, 'hyperlink')).toHaveLength(0);
        expect(session.artifact().document.source.elements(ns, 'tabs')).toHaveLength(0);
      } finally { history.destroy(); view.destroy(); session.destroy(); }
    });
  }
}
