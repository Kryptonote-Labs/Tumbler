import { expect, test } from 'bun:test';
import { importWordContent, layoutWordDocument, NativeWordDocument, openWordArtifact } from '../src/index.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';

const measure = { measure: (text: string) => ({ width: text.length * 6, ascent: 9, descent: 3 }) };
function fixture(relative = 'margin', alignment = 'center', columns = 1) {
  return openWordArtifact(buildWordDocumentFixture({
    documentXml: `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body><w:p><w:r><w:drawing><wp:anchor><wp:positionH relativeFrom="${relative}"><wp:align>${alignment}</wp:align></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>1257300</wp:posOffset></wp:positionV><wp:extent cx="914400" cy="914400"/><wp:wrapNone/><a:graphic><a:graphicData><a:blip r:embed="image"/></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r><w:r><w:t>Caption</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="12000" w:h="16000"/><w:pgMar w:top="1440" w:left="1200" w:right="2400" w:bottom="1440"/><w:cols w:num="${columns}" w:space="720"/></w:sectPr></w:body></w:document>`,
    relationships: [{ id: 'image', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image', target: 'media/image.png' }],
    parts: [{ itemName: 'word/media/image.png', contentType: 'image/png', xml: 'image bytes' }],
  }));
}
const image = (layout: ReturnType<typeof layoutWordDocument>) => layout.pages[0]!.columns[0]!.lines.flatMap(l => l.fragments).find(f => f.drawing)!;

test.each([
  ['margin', 'center', 234], ['margin', 'left', 60], ['margin', 'right', 408],
  ['page', 'center', 264], ['page', 'right', 528], ['column', 'center', 120],
] as const)('aligns %s-relative %s drawings independently of paragraph position', (relative, align, expected) => {
  const source = fixture(relative, align, 2);
  const frame = image(layoutWordDocument(source.document, measure));
  expect(frame.x).toBe(expected);
  expect(frame.y).toBe(99);
  const model = new NativeWordDocument({ source });
  expect(image(model.layout(measure)).x).toBe(expected);
  const block = importWordContent(source)[0]!;
  if (block.kind !== 'paragraph') throw Error('Expected paragraph');
  model.update([{ ...block, alignment: 'end', runs: block.runs.map(r => r.text === 'Caption' ? { ...r, text: 'Changed caption' } : r) }]);
  expect(image(model.layout(measure)).x).toBe(expected);
  expect(image(layoutWordDocument(model.artifact().document, measure)).x).toBe(expected);
});

test('recalculates centered geometry after resize and clears alignment on explicit movement', () => {
  const source = fixture();
  const drawing = [...source.document.drawings.values()][0]!;
  const resized = source.resizeDrawing({ elementId: drawing.elementId, widthPoints: 144, heightPoints: 72 });
  expect(image(layoutWordDocument(resized.document, measure)).x).toBe(198);
  const moved = source.updateDrawing({ elementId: drawing.elementId, widthPoints: 72, heightPoints: 72, layout: 'front', horizontalRelativeTo: 'page', verticalRelativeTo: 'page', xPoints: 100, yPoints: 99 });
  expect(image(layoutWordDocument(moved.document, measure)).x).toBe(100);
  expect([...moved.document.drawings.values()][0]!.anchor?.horizontalAlignment).toBeUndefined();
  const block = importWordContent(source)[0]!;
  if (block.kind !== 'paragraph') throw Error('Expected paragraph');
  const model = new NativeWordDocument({ source });
  model.update([{ ...block, runs: block.runs.map(r => r.text === '\uFFFC' ? { ...r, drawing: { width: 72, height: 72, x: 100, y: 99 } } : r) }]);
  expect(image(model.layout(measure)).x).toBe(100);
});
