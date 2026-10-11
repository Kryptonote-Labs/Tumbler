import { OOXML_NAMESPACES } from '../../../packages/ooxml/src/index.ts';
import { buildWordDocumentFixture } from '../../../packages/word/test/document-fixture.ts';

const paragraph = (text: string, spacing = '<w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>') => `<w:p><w:pPr>${spacing}</w:pPr><w:r><w:rPr><w:rFonts w:ascii="Liberation Serif" w:hAnsi="Liberation Serif"/><w:sz w:val="22"/></w:rPr>${text}</w:r></w:p>`;
const text = (value: string) => `<w:t>${value}</w:t>`;
const margins = '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>';
const section = (size: string) => `<w:sectPr>${size}${margins}</w:sectPr>`;
const size = '<w:pgSz w:w="12240" w:h="15840"/>';
const twoPages = paragraph(text('Alpha') + '<w:br w:type="page"/>' + text('Bravo'));
export interface RenderCase { readonly id: string; readonly group: 'size' | 'breaks' | 'spacing'; readonly body: string; readonly compareAdvances: boolean }
export const renderCases: readonly RenderCase[] = [
  ...[
    ['portrait-default', size],
    ['portrait-explicit', '<w:pgSz w:w="12240" w:h="15840" w:orient="portrait"/>'],
    ['landscape', '<w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/>'],
    ['wide-portrait', '<w:pgSz w:w="15840" w:h="12240" w:orient="portrait"/>'],
    ['custom-paper', '<w:pgSz w:w="9000" w:h="11000"/>'],
    ['paper-code', '<w:pgSz w:w="9000" w:h="11000" w:code="240"/>'],
  ].map(([id, pageSize]): RenderCase => ({ id: `size-${id}`, group: 'size', body: twoPages + section(pageSize!), compareAdvances: false })),
  { id: 'size-section-change', group: 'size', body: paragraph(text('Alpha')) + `<w:p><w:pPr>${section(size)}</w:pPr></w:p>` + paragraph(text('Bravo')) + section('<w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/>'), compareAdvances: false },
  { id: 'explicit-line-breaks', group: 'breaks', body: paragraph(text('Alpha') + '<w:br/>' + text('Bravo') + '<w:br w:type="textWrapping"/>' + text('Charlie')) + section(size), compareAdvances: true },
  { id: 'explicit-page-breaks', group: 'breaks', body: twoPages + section(size), compareAdvances: false },
  ...[
    ['single', 'auto', 240], ['multiple', 'auto', 276], ['double', 'auto', 480],
    ['exact', 'exact', 400], ['minimum', 'atLeast', 400],
  ].map(([id, rule, value]): RenderCase => ({ id: `spacing-${id}`, group: 'spacing', body: ['Alpha', 'Bravo', 'Charlie'].map(valueText => paragraph(text(valueText), `<w:spacing w:before="0" w:after="0" w:line="${value}" w:lineRule="${rule}"/>`)).join('') + section(size), compareAdvances: true })),
];
export function renderInput(item: RenderCase, profile: 'strict' | 'transitional') {
  const xml = `<w:document xmlns:w="${OOXML_NAMESPACES[profile].wordprocessing}"><w:body>${item.body}</w:body></w:document>`;
  return { xml, bytes: buildWordDocumentFixture({ conformance: profile, documentXml: xml }) };
}
