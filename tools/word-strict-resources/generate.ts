import { importWordContent, openWordArtifact } from '../../packages/word/src/index.ts';
import { reconcileWordContent } from '../../packages/word/src/content-export.ts';
import { buildWordDocumentFixture } from '../../packages/word/test/document-fixture.ts';
import { fixtures } from '../word-schema-order/fixtures.ts';
export function generate(conformance: 'strict' | 'transitional') {
  const namespace = conformance === 'strict' ? 'http://purl.oclc.org/ooxml/wordprocessingml/main' : 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const source = openWordArtifact(buildWordDocumentFixture({ conformance, documentXml: `<w:document xmlns:w="${namespace}"><w:body><w:p/></w:body></w:document>` }));
  return reconcileWordContent(source, [
    { kind: 'paragraph', list: { id: 'new', kind: 'decimal' }, runs: [{ text: 'new list', format: { color: { theme: 'accent1', fallback: '#156082' } } }] },
    ...fixtures.cell,
  ]);
}
if (import.meta.main) {
  if (!process.argv[2]) throw new Error('Pass output directory');
  await Bun.write(`${process.argv[2]}/mixed-transitional.docx`, editTransitionalLogicalBorders().bytes());
  for (const profile of ['strict', 'transitional'] as const)
    await Bun.write(`${process.argv[2]}/${profile}.docx`, generate(profile).bytes());
}

export function editTransitionalLogicalBorders() {
  const namespace = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const borders = ['top', 'start', 'bottom', 'end'].map(side => `<w:${side} w:val="single"/>`).join('');
  const source = openWordArtifact(buildWordDocumentFixture({ documentXml: `<w:document xmlns:w="${namespace}"><w:body><w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="2000"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcBorders>${borders}</w:tcBorders></w:tcPr><w:p/></w:tc></w:tr></w:tbl></w:body></w:document>` }));
  const blocks = importWordContent(source).map(block => block.kind !== 'table' ? block : {
    ...block, rows: block.rows.map(row => row.map(cell => ({ ...cell,
      format: { borders: { left: { style: 'double' as const, widthPoints: 1, color: '#123456' as const } } },
    }))),
  });
  return reconcileWordContent(source, blocks);
}
