import { expect, test } from 'bun:test';
import { importWordContent, layoutWordDocument, NativeWordDocument, openWordArtifact, wordPageImages } from '../src/index.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';
import { officeInk } from '../../ink/test/fixture.ts';
import { beginPackageTransaction } from '@tumblerjs/opc';
import { readWordInkDrawing } from '../src/ink.ts';

const w = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const r = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const inkXml = '<ink xmlns="http://www.w3.org/2003/InkML"><trace>0 0, 10 10</trace></ink>';
// Synthetic Word-shaped markup, not a user document. The bitmap bytes need only survive package transport here.
function fixture(external = false, fallback = true, payload = inkXml, conformance: 'strict' | 'transitional' = 'transitional') {
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

test('uses the shared engine while retaining a supplied Word preview', () => {
  const { source } = fixture(false, true, officeInk());
  const drawing = [...source.document.drawings.values()][0]!;
  expect(drawing.ink?.diagnostics).toEqual([]);
  expect(drawing.ink?.traces[0]?.points).toEqual([[0, 0], [1000, 1000]]);
  expect(drawing).toMatchObject({ inkRendering: 'bitmap', contentType: 'image/png' });
});

test('renders native strokes without a bitmap and preserves ink through text edits', () => {
  const payload = officeInk();
  const { source, alternate } = fixture(false, false, payload);
  const drawing = [...source.document.drawings.values()][0]!;
  expect(drawing).toMatchObject({ kind: 'image', inkRendering: 'vector', contentType: 'image/svg+xml' });
  expect(drawing.widthPoints).toBeCloseTo(1408680 / 12700 * 1.05);
  expect(drawing.anchor?.horizontalOffsetPoints).toBeCloseTo(729615 / 12700 - 1408680 / 12700 * .025);
  const model = new NativeWordDocument({ source });
  const block = importWordContent(source)[0]!;
  if (block.kind !== 'paragraph') throw Error('Expected paragraph');
  model.update([{ ...block, runs: block.runs.map(run => run.text === 'Caption' ? { ...run, text: 'Edited' } : run) }]);
  const exported = model.artifact();
  expect(exported.document.source.source).toContain(alternate);
  expect([...exported.document.drawings.values()][0]).toMatchObject({ inkRendering: 'vector' });
  const part = exported.document.package.parts.find(p => p.name.value === '/word/ink/ink1.xml')!;
  expect(new TextDecoder().decode(exported.document.package.readPart(part))).toBe(payload);
});

test('malformed and unsupported native ink retain the preview without aborting document import', () => {
  for (const payload of ['<broken>', officeInk({ brush: '<brushProperty name="fitToCurve" value="true"/>' }), officeInk({ trace: '0 bad' })]) {
    expect([...fixture(false, true, payload).source.document.drawings.values()][0]?.kind).toBe('image');
    expect([...fixture(false, false, payload).source.document.drawings.values()][0]?.kind).toBe('unsupported');
  }
});

test('native ink outside alternate content uses the same shared decoder', () => {
  const { source } = fixture(false, false, officeInk());
  const xml = source.document.source.source.replace('<mc:AlternateContent><mc:Choice Requires="wpi">', '').replace('</mc:Choice></mc:AlternateContent>', '');
  const edit = beginPackageTransaction(source.document.package);
  edit.replacePart(source.document.part.name, new TextEncoder().encode(xml));
  const artifact = openWordArtifact(edit.commit());
  expect([...artifact.document.drawings.values()]).toHaveLength(1);
  expect([...artifact.document.drawings.values()][0]).toMatchObject({ inkRendering: 'vector' });
});

test('native ink refuses unsupported drawing transforms and keeps source bytes', () => {
  const { source } = fixture(false, false, officeInk());
  for (const transform of ['<w14:xfrm rot="90000"/>', '<w14:xfrm flipH="1"/>', '<w14:xfrm><a:off x="100" y="0"/></w14:xfrm>']) {
    const xml = source.document.source.source.replace('<w14:contentPart r:id="ink"/>', `<w14:contentPart r:id="ink">${transform}</w14:contentPart>`);
    const edit = beginPackageTransaction(source.document.package);
    edit.replacePart(source.document.part.name, new TextEncoder().encode(xml));
    const artifact = openWordArtifact(edit.commit());
    expect([...artifact.document.drawings.values()][0]?.kind).toBe('unsupported');
    expect(artifact.document.source.source).toContain(transform);
  }
});

test.each([true, false])('Strict drawings decode ink with bitmap=%s', fallback => {
  const { source } = fixture(false, fallback, officeInk(), 'strict');
  const drawing = [...source.document.drawings.values()][0]!;
  expect(source.document.conformance).toBe('strict');
  expect(drawing).toMatchObject({ kind: 'image', inkRendering: fallback ? 'bitmap' : 'vector' });
  expect(drawing.ink?.traces).toHaveLength(1);
  expect(Object.isFrozen(drawing)).toBe(true);
  const model = new NativeWordDocument({ source });
  const block = importWordContent(source)[0]!;
  if (block.kind !== 'paragraph') throw Error('Expected paragraph');
  model.update([{ ...block, runs: block.runs.map(run => run.text === 'Caption' ? { ...run, text: 'Edited' } : run) }]);
  expect(model.artifact().document.conformance).toBe('strict');
  expect([...model.artifact().document.drawings.values()][0]).toMatchObject({ inkRendering: fallback ? 'bitmap' : 'vector' });
});

test('generated preview bytes cannot alias the original ink part', () => {
  const { source } = fixture(false, false, officeInk());
  const drawing = [...source.document.drawings.values()][0]!;
  if (drawing.kind !== 'image') throw Error('Expected image');
  expect(drawing.partName).toBeUndefined();
  expect(drawing.relationshipId).toBeUndefined();
  expect(drawing.inkSource?.partName.value).toBe('/word/ink/ink1.xml');
  expect(drawing.inkSource?.relationshipId).toBe('ink');
});

test('Word exposes rendering budget diagnostics and accepts an override', () => {
  const { source } = fixture(false, false, officeInk());
  const limited = openWordArtifact(source.bytes(), { inkRendering: { maxPoints: 1 } });
  const drawing = [...limited.document.drawings.values()][0]!;
  expect(drawing.kind).toBe('unsupported');
  expect(drawing.ink?.traces[0]?.points).toHaveLength(2);
  expect(drawing.inkRenderingDiagnostics?.[0]?.code).toBe('resource');
  expect([...openWordArtifact(source.bytes(), { inkRendering: { maxPoints: Infinity } }).document.drawings.values()][0]?.kind).toBe('image');
  const model = new NativeWordDocument({ source: limited });
  const block = importWordContent(limited)[0]!;
  if (block.kind !== 'paragraph') throw Error('Expected paragraph');
  model.update([{ ...block, runs: block.runs.map(run => run.text === 'Caption' ? { ...run, text: 'Edited' } : run) }]);
  expect(model.artifact().document.inkRendering.maxPoints).toBe(1);
  expect([...model.artifact().document.drawings.values()][0]?.inkRenderingDiagnostics?.[0]?.code).toBe('resource');
});

test('foreign ID collisions retain the decoded ink API and bitmap', () => {
  const payload = officeInk({ extra: '<annotationXML><custom:data xml:id="stroke"/></annotationXML>' });
  const { source } = fixture(false, true, payload);
  const drawing = [...source.document.drawings.values()][0]!;
  expect(drawing.ink?.diagnostics[0]?.code).toBe('reference');
  expect(drawing.ink?.traces).toHaveLength(1);
  expect(drawing).toMatchObject({ inkRendering: 'bitmap' });
});

test('non-ink markup leaves the existing drawing object unchanged', () => {
  const { source } = fixture(false, false);
  const original = [...source.document.drawings.values()][0]!;
  expect(Object.isFrozen(original)).toBe(true);
  expect(readWordInkDrawing(source.document.source.root, original, source.document.package, undefined)).toBe(original);
});
