import { openOpcPackage } from '@tumblerjs/opc';
import { openWordDocument, type WordTextMeasurer } from '../src/index.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';

export const paginationMeasurer: WordTextMeasurer = {
  measure(text) { return { width: text.length * 5, ascent: 8, descent: 2 }; },
};
export function paragraph(text: string, properties = ''): string {
  return `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="200" w:lineRule="exact"/>${properties}</w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;
}
export function section(extra = '', height = 1000): string {
  return `<w:sectPr><w:pgSz w:w="2400" w:h="${height}"/><w:pgMar w:top="200" w:bottom="200" w:left="200" w:right="200"/>${extra}</w:sectPr>`;
}
export function paginationDocument(body: string, properties = section()) {
  return openWordDocument(openOpcPackage(buildWordDocumentFixture({ documentXml:
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}${properties}</w:body></w:document>` })));
}
