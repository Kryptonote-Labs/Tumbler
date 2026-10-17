import { expect, test } from 'bun:test';
import { importWordContent, layoutWordDocument, NativeWordDocument, openWordArtifact, wordPageImages } from '../src/index.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';

const w = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const r = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const inkXml = '<ink xmlns="http://www.w3.org/2003/InkML"><trace>0 0, 10 10</trace></ink>';
// Synthetic Word-shaped markup, not a user document. The bitmap bytes need only survive package transport here.
function fixture(external = false, fallback = true) {
  const alternate = `<mc:AlternateContent><mc:Choice Requires="wpi"><w:drawing><wp:anchor behindDoc="0"><wp:positionH relativeFrom="column"><wp:posOffset>729615</wp:posOffset></wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>-277495</wp:posOffset></wp:positionV><wp:extent cx="1408680" cy="1384990"/><wp:wrapNone/><wp:docPr id="1" name="Ink"/><a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingInk"><w14:contentPart r:id="ink"/></a:graphicData></a:graphic></wp:anchor></w:drawing></mc:Choice>${fallback ? `<mc:Fallback><w:pict><v:shape style="position:absolute;margin-left:56.75pt;margin-top:-22.55pt;width:112.3pt;height:110.45pt;mso-position-horizontal-relative:text;mso-position-vertical-relative:text"><v:imagedata r:id="bitmap"/></v:shape></w:pict></mc:Fallback>` : ''}</mc:AlternateContent>`;
  const source = openWordArtifact(buildWordDocumentFixture({
    documentXml: `<w:document xmlns:w="${w}" xmlns:r="${r}" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"><w:body><w:p><w:r>${alternate}</w:r><w:r><w:t>Caption</w:t></w:r></w:p></w:body></w:document>`,
    relationships: [
      { id: 'ink', type: `${r}/customXml`, target: 'ink/ink1.xml' },
      { id: 'bitmap', type: `${r}/image`, target: external ? 'https://example.invalid/ink.png' : 'media/ink.png', ...(external ? { targetMode: 'External' as const } : {}) },
    ],
    parts: [
      { itemName: 'word/ink/ink1.xml', contentType: 'application/inkml+xml', xml: inkXml },
      { itemName: 'word/media/ink.png', contentType: 'image/png', xml: 'synthetic bitmap' },
    ],
  }));
  return { source, alternate };
}
const measure = { measure: (text: string) => ({ width: text.length * 6, ascent: 9, descent: 3 }) };

test('projects exactly one ink fallback image using the bitmap pen bounds', () => {
  const { source } = fixture();
  const page = layoutWordDocument(source.document, measure).pages[0]!;
  const images = wordPageImages(page);
  expect(images).toHaveLength(1);
  expect(images[0]).toMatchObject({ kind: 'image', fallback: 'ink', widthPoints: 112.3, heightPoints: 110.45,
    anchor: { horizontalOffsetPoints: 56.75, verticalOffsetPoints: -22.55 } });
  const fragment = page.columns[0]!.lines[0]!.fragments.find(f => f.kind === 'drawing')!;
  expect(fragment.x).toBeCloseTo(page.columns[0]!.x + 56.75);
  expect(fragment.y).toBeCloseTo(page.columns[0]!.lines[0]!.y - 22.55);
  expect(new TextDecoder().decode(images[0]!.bytes)).toBe('synthetic bitmap');
  const native = new NativeWordDocument({ source });
  expect(wordPageImages(native.layout(measure).pages[0]!)).toHaveLength(1);
});

test('editing nearby text preserves the entire ink choice, fallback and payload', () => {
  const { source, alternate } = fixture();
  const model = new NativeWordDocument({ source });
  const block = importWordContent(source)[0]!;
  if (block.kind !== 'paragraph') throw Error('Expected paragraph');
  model.update([{ ...block, runs: block.runs.map(run => run.text === 'Caption' ? { ...run, text: 'Edited' } : run) }]);
  const exported = model.artifact();
  expect(exported.document.source.source).toContain(alternate);
  const part = exported.document.package.parts.find(p => p.name.value === '/word/ink/ink1.xml')!;
  expect(new TextDecoder().decode(exported.document.package.readPart(part))).toBe(inkXml);
  expect(wordPageImages(layoutWordDocument(exported.document, measure).pages[0]!)).toHaveLength(1);
  model.update([{ ...block, runs: block.runs.filter(run => run.text !== '\uFFFC') }]);
  expect(model.artifact().document.source.source).not.toContain('<mc:AlternateContent>');
});

test('does not fetch external fallbacks or discard ink without a usable fallback', () => {
  for (const { source } of [fixture(true), fixture(false, false)]) {
    expect([...source.document.drawings.values()][0]?.kind).toBe('unsupported');
    expect(wordPageImages(layoutWordDocument(source.document, measure).pages[0]!)).toHaveLength(0);
    expect(source.document.source.source).toContain('<mc:Choice');
  }
});

test('refuses geometry edits that would change only one ink representation', () => {
  const { source } = fixture();
  const image = [...source.document.drawings.values()][0]!;
  expect(() => source.resizeDrawing({ elementId: image.elementId, widthPoints: 200, heightPoints: 100 })).toThrow('ink fallback');
});
