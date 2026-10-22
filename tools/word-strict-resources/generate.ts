import { openWordArtifact } from '../../packages/word/src/index.ts';
import { reconcileWordContent } from '../../packages/word/src/content-export.ts';
import { buildWordDocumentFixture } from '../../packages/word/test/document-fixture.ts';
import { fixtures } from '../word-schema-order/fixtures.ts';
export function generate(conformance: 'strict' | 'transitional') {
  const namespace = conformance === 'strict' ? 'http://purl.oclc.org/ooxml/wordprocessingml/main' : 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const source = openWordArtifact(buildWordDocumentFixture({ conformance, documentXml: `<w:document xmlns:w="${namespace}"><w:body><w:p/></w:body></w:document>` }));
  return reconcileWordContent(source, [
    { kind: 'paragraph', list: { id: 'new', kind: 'decimal' }, runs: [{ text: 'new list' }] },
    ...fixtures.cell,
  ]);
}
if (import.meta.main) {
  if (!process.argv[2]) throw new Error('Pass output directory');
  for (const profile of ['strict', 'transitional'] as const)
    await Bun.write(`${process.argv[2]}/${profile}.docx`, generate(profile).bytes());
}
