import { openWordArtifact } from '../src/index.ts';
import { officeInk } from '../../ink/test/fixture.ts';
import { inkFixture } from './ink-fixture.ts';
import { pictureFixture, pictureSvg } from './picture-fixture.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';

/** Three overlapping front pictures followed in z-order by white XOR ink. */
export function pictureInkStackFixture() {
  const payload = officeInk({ brush: '<brushProperty name="width" value="0.1" units="cm"/><brushProperty name="height" value="0.1" units="cm"/><brushProperty name="rasterOp" value="xOrPen"/><brushProperty name="color" value="#ffffff"/>' });
  const source = inkFixture(false, false, payload).source;
  const ink = [...source.document.drawings.values()][0]!;
  const moved = source.updateDrawing({ elementId: ink.elementId, widthPoints: 20, heightPoints: 20, layout: 'front', xPoints: 100, yPoints: 80 });
  const pictures = openWordArtifact(pictureFixture({ anchors: [0, 1, 2] })).document.source.source;
  const body = pictures.slice(pictures.indexOf('<w:body>') + '<w:body>'.length, pictures.indexOf('</w:body>'));
  const documentXml = moved.document.source.source
    .replace('<w:document ', '<w:document xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" ')
    .replace('<wp:anchor ', '<wp:anchor relativeHeight="3" ')
    .replace('<w:body>', `<w:body>${body}`);
  const r = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  return buildWordDocumentFixture({ documentXml,
    relationships: [{ id: 'image', type: `${r}/image`, target: 'media/quadrants.svg' }, { id: 'ink', type: `${r}/customXml`, target: 'ink/ink1.xml' }],
    parts: [{ itemName: 'word/media/quadrants.svg', contentType: 'image/svg+xml', xml: pictureSvg }, { itemName: 'word/ink/ink1.xml', contentType: 'application/inkml+xml', xml: payload }],
  });
}
