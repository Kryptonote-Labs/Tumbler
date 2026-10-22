import { buildWordDocumentFixture } from './document-fixture.ts';

export const clipParagraph = (text: string) => `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="200" w:lineRule="exact"/></w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;
export const clipCell = (body: string, properties = '') => `<w:tc><w:tcPr>${properties}</w:tcPr>${body}</w:tc>`;
export const clipRow = (cells: string, height = 200, properties = '') => `<w:tr><w:trPr><w:trHeight w:val="${height}" w:hRule="exact"/>${properties}</w:trPr>${cells}</w:tr>`;
export const clipTable = (rows: string) => `<w:tbl><w:tblGrid><w:gridCol w:w="2000"/></w:tblGrid>${rows}</w:tbl>`;
export function tableClippingFixture(body = clipTable(clipRow(clipCell(['VISIBLE', 'HIDDEN1', 'HIDDEN2', 'HIDDEN3'].map(clipParagraph).join(''))) + clipRow(clipCell(clipParagraph('NEXT')))), height = 6000) {
  return buildWordDocumentFixture({ documentXml: `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="5000" w:h="${height}"/><w:pgMar w:top="200" w:bottom="200" w:left="200" w:right="200"/></w:sectPr></w:body></w:document>` });
}
