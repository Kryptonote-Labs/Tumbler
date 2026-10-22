import { buildWordDocumentFixture } from './document-fixture.ts';

export const pictureSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><path fill="#f00" d="M0 0h50v50H0z"/><path fill="#0f0" d="M50 0h50v50H50z"/><path fill="#00f" d="M0 50h50v50H0z"/><path fill="#ff0" d="M50 50h50v50H50z"/></svg>';

/** Sanitized four-colour image and editable DrawingML frame, with no external resources. */
export function pictureFixture(options: { crop?: string; transform?: string; extraFill?: string; geometry?: string; extent?: string; strict?: boolean; anchors?: readonly number[] } = {}) {
  const prefix = options.strict ? 'http://purl.oclc.org/ooxml' : 'http://schemas.openxmlformats.org';
  const a = options.strict ? `${prefix}/drawingml/main` : `${prefix}/drawingml/2006/main`;
  const pic = a.replace('/main', '/picture');
  const w = options.strict ? `${prefix}/wordprocessingml/main` : `${prefix}/wordprocessingml/2006/main`;
  const wp = a.replace('/main', '/wordprocessingDrawing');
  const r = options.strict ? `${prefix}/officeDocument/relationships` : `${prefix}/officeDocument/2006/relationships`;
  const frame = (z?: number) => {
    const tag = z === undefined ? 'inline' : `anchor behindDoc="0" relativeHeight="${z}"`;
    const position = z === undefined ? '' : '<wp:positionH relativeFrom="page"><wp:posOffset>914400</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>914400</wp:posOffset></wp:positionV><wp:wrapNone/>';
    return `<w:p><w:r><w:drawing><wp:${tag}>${position}<wp:extent cx="914400" cy="457200"/><wp:docPr id="1" name="Picture" descr="Quadrants ${z ?? ''}"/><a:graphic><a:graphicData uri="${pic}"><pic:pic><pic:blipFill><a:blip r:embed="image"/><a:srcRect ${options.crop ?? ''}/>${options.extraFill ?? '<a:stretch><a:fillRect/></a:stretch>'}</pic:blipFill><pic:spPr><a:xfrm ${options.transform ?? ''}><a:off x="0" y="0"/><a:ext ${options.extent ?? 'cx="914400" cy="457200"'}/></a:xfrm>${options.geometry ?? '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>'}</pic:spPr></pic:pic></a:graphicData></a:graphic></wp:${z === undefined ? 'inline' : 'anchor'}></w:drawing></w:r></w:p>`;
  };
  return buildWordDocumentFixture({
    conformance: options.strict ? 'strict' : 'transitional',
    documentXml: `<w:document xmlns:w="${w}" xmlns:wp="${wp}" xmlns:a="${a}" xmlns:pic="${pic}" xmlns:r="${r}"><w:body>${options.anchors ? options.anchors.map(frame).join('') : frame()}</w:body></w:document>`,
    relationships: [{ id: 'image', type: `${r}/image`, target: 'media/quadrants.svg' }],
    parts: [{ itemName: 'word/media/quadrants.svg', contentType: 'image/svg+xml', xml: pictureSvg }],
  });
}
