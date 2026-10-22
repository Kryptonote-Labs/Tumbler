import { openWordArtifact } from '../src/index.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';

export const numberingStoryMeasurer = { measure: (text: string) => ({ width: text.length * 5, ascent: 8, descent: 2 }) };

/** A shared style becomes numbered only when export materializes Heading1. */
export function numberingStoryFixture(bodyCount = 1, headerCount = 1, headingExists = false) {
  const w = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const r = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const paragraph = '<w:p><w:pPr><w:pStyle w:val="Child"/></w:pPr><w:r><w:t>item</w:t></w:r></w:p>';
  return openWordArtifact(buildWordDocumentFixture({
    documentXml: `<w:document xmlns:w="${w}" xmlns:r="${r}"><w:body>${paragraph.repeat(bodyCount)}<w:sectPr><w:headerReference w:type="default" r:id="header"/></w:sectPr></w:body></w:document>`,
    relationships: ['numbering', 'styles', 'header'].map(name => ({ id: name, type: `${r}/${name}`, target: `${name}.xml` })),
    parts: [
      { itemName: 'word/header.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml', xml: `<w:hdr xmlns:w="${w}">${paragraph.repeat(headerCount)}</w:hdr>` },
      { itemName: 'word/styles.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml', xml: `<w:styles xmlns:w="${w}"><w:style w:type="paragraph" w:styleId="Normal" w:default="1"><w:pPr><w:numPr><w:numId w:val="1"/></w:numPr></w:pPr></w:style><w:style w:type="paragraph" w:styleId="Child"><w:basedOn w:val="Heading1"/></w:style>${headingExists ? '<w:style w:type="paragraph" w:styleId="Heading1"><w:basedOn w:val="Normal"/></w:style>' : ''}</w:styles>` },
      { itemName: 'word/numbering.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml', xml: `<w:numbering xmlns:w="${w}"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl><w:lvl w:ilvl="1"><w:start w:val="5"/><w:numFmt w:val="decimal"/><w:pStyle w:val="Heading1"/><w:lvlText w:val="%2."/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>` },
    ],
  }));
}
