import { openWordArtifact } from '../src/index.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';

const w = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const r = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
export const inkXml = '<ink xmlns="http://www.w3.org/2003/InkML"><trace>0 0, 10 10</trace></ink>';
// Synthetic Word-shaped markup, not a user document. The bitmap bytes need only survive package transport here.
export function inkFixture(external = false, fallback = true, payload = inkXml, conformance: 'strict' | 'transitional' = 'transitional') {
  const alternate = `<mc:AlternateContent><mc:Choice Requires="wpi"><w:drawing><wp:anchor behindDoc="0"><wp:positionH relativeFrom="column"><wp:posOffset>729615</wp:posOffset></wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>-277495</wp:posOffset></wp:positionV><wp:extent cx="1408680" cy="1384990"/><wp:wrapNone/><wp:docPr id="1" name="Ink"/><a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingInk"><w14:contentPart r:id="ink"/></a:graphicData></a:graphic></wp:anchor></w:drawing></mc:Choice>${fallback ? `<mc:Fallback><w:pict><v:shape style="position:absolute;margin-left:56.75pt;margin-top:-22.55pt;width:112.3pt;height:110.45pt;mso-position-horizontal-relative:text;mso-position-vertical-relative:text"><v:imagedata r:id="bitmap"/></v:shape></w:pict></mc:Fallback>` : ''}</mc:AlternateContent>`;
  const namespace = (value: string) => conformance === 'strict' ? value
    .replaceAll('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'http://purl.oclc.org/ooxml/wordprocessingml/main')
    .replaceAll('http://schemas.openxmlformats.org/drawingml/2006/', 'http://purl.oclc.org/ooxml/drawingml/')
    .replaceAll(r, 'http://purl.oclc.org/ooxml/officeDocument/relationships') : value;
  const source = openWordArtifact(buildWordDocumentFixture({
    conformance,
    documentXml: namespace(`<w:document xmlns:w="${w}" xmlns:r="${r}" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"><w:body><w:p><w:r>${alternate}</w:r><w:r><w:t>Caption</w:t></w:r></w:p></w:body></w:document>`),
    relationships: [
      { id: 'ink', type: namespace(`${r}/customXml`), target: 'ink/ink1.xml' },
      { id: 'bitmap', type: namespace(`${r}/image`), target: external ? 'https://example.invalid/ink.png' : 'media/ink.png', ...(external ? { targetMode: 'External' as const } : {}) },
    ],
    parts: [
      { itemName: 'word/ink/ink1.xml', contentType: 'application/inkml+xml', xml: payload },
      { itemName: 'word/media/ink.png', contentType: 'image/png', xml: 'synthetic bitmap' },
    ],
  }));
  return { source, alternate };
}
