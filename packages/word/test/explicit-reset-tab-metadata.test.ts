import { expect, test } from 'bun:test';
import { importWordContent, NativeWordDocument, openWordArtifact, reconcileWordContent } from '../src/index.ts';
import { openWordOperationDocument, prepareWordOperation } from '../src/operations/index.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';

for (const conformance of ['strict', 'transitional'] as const) {
  const ns = conformance === 'strict' ? 'http://purl.oclc.org/ooxml/wordprocessingml/main' : 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  for (const [label, attributes, children] of [
    ['attribute', ' ext:hint="keep"', ''],
    ['element', '', '<ext:keep/>'],
    ['comment', '', '<!--keep-->'],
    ['processing instruction', '', '<?keep value?>'],
  ] as const) test(`${conformance} resets remove the old tab-stop ${label} and preserve unrelated XML`, () => {
    const source = openWordArtifact(buildWordDocumentFixture({
      conformance,
      documentXml: `<w:document xmlns:w="${ns}" xmlns:ext="urn:custom" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="ext"><w:body><w:p><w:pPr><ext:unrelated/><w:tabs><w:tab w:val="left" w:pos="720"${attributes}>${children}</w:tab></w:tabs></w:pPr><w:r><w:t>Hello</w:t></w:r></w:p></w:body></w:document>`,
    }));
    const paragraph = importWordContent(source)[0]!;
    if (paragraph.kind !== 'paragraph') throw new Error('Expected paragraph');
    for (const positioning of [
      { reset: true as const },
      { reset: true as const, tabs: [{ positionTwips: 1440, alignment: 'start' as const, leader: 'none' as const }] },
    ]) {
      const model = new NativeWordDocument({ source });
      model.update([{ ...paragraph, positioning }]);
      const output = model.artifact();
      expect(output.document.source.elements('urn:custom', 'unrelated')).toHaveLength(1);
      expect(output.document.source.elements('urn:custom', 'keep')).toHaveLength(0);
      expect(output.document.source.elements(ns, 'tabs')).toHaveLength(positioning.tabs ? 1 : 0);
      expect(reconcileWordContent(source, [{ ...paragraph, positioning }]).document.source.source).toBe(output.document.source.source);
      const session = openWordOperationDocument(source);
      try {
        const before = session.artifact().document.source.source;
        expect(before).toContain(attributes || children);
        session.text.applyDelta(prepareWordOperation(session.text, { start: 0, end: 5 }, {
          name: 'paragraph', input: { positioning: positioning.tabs ? positioning : null },
        }).delta);
        const edited = session.artifact().document;
        expect(edited.source.elements('urn:custom', 'unrelated')).toHaveLength(1);
        expect(edited.source.elements(ns, 'tabs')).toHaveLength(positioning.tabs ? 1 : 0);
        expect(edited.source.source).not.toContain(attributes || children);
      } finally { session.destroy(); }
    }
  });
}
