import { expect, test } from 'bun:test';
import { importWordContent, NativeWordDocument, openWordArtifact, WordEditingSession } from '../src/index.ts';
import { officeInk } from '../../ink/test/fixture.ts';
import { inkFixture } from './ink-fixture.ts';
import { beginPackageTransaction } from '@tumblerjs/opc';

const first = (artifact: ReturnType<typeof openWordArtifact>) => [...artifact.document.drawings.values()][0]!;
function preserved(source: ReturnType<typeof openWordArtifact>, result: ReturnType<typeof openWordArtifact>, authored = false) {
  for (const part of source.document.package.parts) {
    if (part.name.value === '/word/media/ink.png') continue; // Resizing refreshes this cached preview.
    if (part.name.value === source.document.part.name.value || (authored && !/\/(ink|media)\//.test(part.name.value))) continue;
    const retained = result.document.package.getPart(part.name)!;
    expect(retained).toBeDefined();
    expect(result.document.package.readPart(retained)).toEqual(source.document.package.readPart(part));
  }
}
function xmlChange(source: ReturnType<typeof openWordArtifact>, transform: (xml: string) => string) {
  const edit = beginPackageTransaction(source.document.package);
  edit.replacePart(source.document.part.name, new TextEncoder().encode(transform(source.document.source.source)));
  return openWordArtifact(edit.commit());
}

test.each(['strict', 'transitional'] as const)('resizes and moves both ink representations in %s', conformance => {
  const { source } = inkFixture(false, true, officeInk(), conformance);
  const image = first(source);
  const result = source.updateDrawing({ elementId: image.elementId, widthPoints: image.widthPoints / 2, heightPoints: image.heightPoints * 2,
    layout: 'front', wrap: 'none', horizontalRelativeTo: 'page', verticalRelativeTo: 'line', xPoints: 298.56, yPoints: -20 });
  expect(first(result)).toMatchObject({ inkRendering: 'vector', anchor: { horizontalRelativeTo: 'page', verticalRelativeTo: 'line' } });
  expect(first(result).widthPoints).toBeCloseTo(image.widthPoints / 2, 3);
  expect(first(result).heightPoints).toBeCloseTo(image.heightPoints * 2, 3);
  expect(first(result).anchor?.horizontalOffsetPoints).toBeCloseTo(298.56, 3);
  expect(first(result).anchor?.verticalOffsetPoints).toBeCloseTo(-20, 3);
  const xml = result.document.source.source;
  // The native frame scales independently from the physical pen.
  expect(xml).toContain('cx="704340" cy="2769980"');
  preserved(source, result);
  expect(first(openWordArtifact(result.bytes()))).toEqual(first(result));
});

test('resizes native contentPart transform and preserves rotation and other metadata', () => {
  let { source } = inkFixture(false, true, officeInk());
  source = xmlChange(source, xml => xml.replace('<wp:wrapNone/>', '<wp:effectExtent l="100" t="200" r="300" b="400"/><wp:wrapNone/>').replace('<w14:contentPart r:id="ink"/>', '<w14:contentPart r:id="ink"><w14:xfrm rot="60000"><a:off x="100" y="200"/><a:ext cx="1408680" cy="1384990"/></w14:xfrm></w14:contentPart>'));
  const drawing = first(source);
  const resized = source.resizeDrawing({ elementId: drawing.elementId, widthPoints: drawing.widthPoints * 2, heightPoints: drawing.heightPoints * 2 });
  expect(resized.document.source.source).toContain('<w14:xfrm rot="60000"><a:off x="200" y="400"/><a:ext cx="2817360" cy="2769980"/></w14:xfrm>');
  expect(resized.document.source.source).toContain('<wp:effectExtent l="200" t="400" r="600" b="800"/>');
  expect(first(resized).widthPoints).toBeCloseTo(drawing.widthPoints * 2, 3);
  expect(first(resized).heightPoints).toBeCloseTo(drawing.heightPoints * 2, 3);
  expect(first(resized).anchor?.horizontalOffsetPoints).toBeCloseTo(drawing.anchor!.horizontalOffsetPoints!, 3);
  preserved(source, resized);
});

test('inline, front, behind and text-relative placement remain exportable', () => {
  const { source } = inkFixture(false, true, officeInk());
  let result = source;
  for (const layout of ['inline', 'behind', 'front', 'inline'] as const) {
    const drawing = first(result);
    result = result.updateDrawing({ elementId: drawing.elementId, widthPoints: 80, heightPoints: 90, layout,
      xPoints: 30, yPoints: 40, horizontalRelativeTo: 'column', verticalRelativeTo: 'paragraph', wrap: 'none' });
    expect(first(result)).toMatchObject({ kind: 'image', fallback: 'ink', placement: layout === 'inline' ? 'inline' : 'anchor' });
    expect(first(result).widthPoints).toBeCloseTo(80, 3);
    expect(first(result).heightPoints).toBeCloseTo(90, 3);
    if (layout !== 'inline') {
      expect(first(result).anchor?.behindDocument).toBe(layout === 'behind');
      expect(first(result).anchor?.horizontalOffsetPoints).toBeCloseTo(30, 3);
      expect(first(result).anchor?.verticalOffsetPoints).toBeCloseTo(40, 3);
    }
    preserved(source, result);
  }
});

test.each([true, false])('authored geometry exports and reopens with bitmap=%s', fallback => {
  const { source } = inkFixture(false, fallback, officeInk());
  const block = importWordContent(source)[0]!;
  if (block.kind !== 'paragraph') throw Error('Expected paragraph');
  const model = new NativeWordDocument({ source });
  model.update([{ ...block, runs: block.runs.map(run => run.source === first(source).elementId ? { ...run,
    drawing: { width: 78.38488188976378, height: 77.09354330708662, layout: 'front', wrap: 'none', horizontalRelativeTo: 'page', verticalRelativeTo: 'page', x: 298.561407368524, y: 203.36252826172793 } } : run) }]);
  const result = model.artifact();
  expect(first(result).widthPoints).toBeCloseTo(78.38488188976378, 3);
  expect(first(result).heightPoints).toBeCloseTo(77.09354330708662, 3);
  expect(first(result).anchor?.horizontalOffsetPoints).toBeCloseTo(298.561407368524, 3);
  expect(first(result).anchor?.verticalOffsetPoints).toBeCloseTo(203.36252826172793, 3);
  preserved(source, result, true);
});

test('no-op resize preserves original bytes and invalid changes leave the source intact', () => {
  const { source } = inkFixture();
  const image = first(source), original = source.bytes();
  expect(source.resizeDrawing({ elementId: image.elementId, widthPoints: image.widthPoints, heightPoints: image.heightPoints })).toBe(source);
  for (const widthPoints of [NaN, Infinity, 0, -1]) expect(() => source.resizeDrawing({ elementId: image.elementId, widthPoints, heightPoints: 80 })).toThrow();
  expect(() => source.updateDrawing({ elementId: image.elementId, widthPoints: 80, heightPoints: 80, layout: 'front', xPoints: Infinity })).toThrow();
  expect(source.bytes()).toBe(original);
});

test.each(['0 0, 0 1000', '0 0, 1000 0', '0 0'])('native-only degenerate stroke bounds resize and move: %s', trace => {
  const { source } = inkFixture(false, false, officeInk({ trace }));
  const image = first(source);
  const result = source.updateDrawing({ elementId: image.elementId, widthPoints: 50, heightPoints: 75, layout: 'front', xPoints: 10, yPoints: 20 });
  expect(first(result).widthPoints).toBeCloseTo(50, 3);
  expect(first(result).heightPoints).toBeCloseTo(75, 3);
  expect(first(result).anchor?.horizontalOffsetPoints).toBeCloseTo(10, 3);
  expect(first(result).anchor?.verticalOffsetPoints).toBeCloseTo(20, 3);
  preserved(source, result);
});

test('image geometry from a host document exports without replacing the ink with a bitmap', () => {
  const { source } = inkFixture(false, true, officeInk());
  const drawing = first(source);
  if (drawing.kind !== 'image') throw Error('Expected image');
  const block = importWordContent(source)[0]!;
  if (block.kind !== 'paragraph') throw Error('Expected paragraph');
  const model = new NativeWordDocument({ source });
  model.update([{ ...block, runs: block.runs.map(run => run.source === drawing.elementId ? { ...run, image: {
    bytes: drawing.bytes, contentType: 'image/png', width: 78.38488188976378, height: 77.09354330708662,
    layout: 'front', horizontalRelativeTo: 'page', verticalRelativeTo: 'page', x: 298.561407368524, y: 203.36252826172793,
  } } : run) }]);
  const result = model.artifact();
  expect(first(result).widthPoints).toBeCloseTo(78.38488188976378, 3);
  expect(first(result).heightPoints).toBeCloseTo(77.09354330708662, 3);
  expect(result.document.source.source).toContain('<mc:AlternateContent>');
  preserved(source, result, true);
});

test('placement keeps VML wrapping coordinate bases in sync and can clear wrapping', () => {
  const { source } = inkFixture();
  const wrapped = xmlChange(source, xml => xml.replace('<wp:wrapNone/>', '<wp:wrapSquare wrapText="bothSides"/>')
    .replace('</v:shape>', '<w10:wrap xmlns:w10="urn:schemas-microsoft-com:office:word" type="square" anchorx="margin" anchory="margin"/></v:shape>'));
  const image = first(wrapped);
  const moved = wrapped.updateDrawing({ elementId: image.elementId, widthPoints: image.widthPoints, heightPoints: image.heightPoints,
    layout: 'front', horizontalRelativeTo: 'page', verticalRelativeTo: 'line', xPoints: 20, yPoints: 30 });
  expect(moved.document.source.source).toContain('type="square" anchorx="page" anchory="line"');
  expect(first(moved).anchor?.wrap).toBe('square');
  const clear = moved.updateDrawing({ elementId: first(moved).elementId, widthPoints: image.widthPoints, heightPoints: image.heightPoints, layout: 'front', wrap: 'none' });
  expect(clear.document.source.source).not.toContain('<w10:wrap');
  expect(first(clear).anchor?.wrap).toBe('none');
});

test('geometry edits preserve UTF-16 source encoding and unknown ink metadata', () => {
  const { source } = inkFixture(false, true, officeInk());
  const xml = source.document.source.source.replace('<wp:extent', '<custom:marker xmlns:custom="urn:test" value="untouched"/><wp:extent');
  const edit = beginPackageTransaction(source.document.package);
  edit.replacePart(source.document.part.name, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(xml, 'utf16le')]));
  const encoded = openWordArtifact(edit.commit());
  const image = first(encoded);
  const result = encoded.updateDrawing({ elementId: image.elementId, widthPoints: 70, heightPoints: 60, layout: 'front', xPoints: 20, yPoints: 30 });
  const bytes = result.document.package.readPart(result.document.part);
  expect([...bytes.slice(0, 2)]).toEqual([0xff, 0xfe]);
  expect(result.document.source.source).toContain('<custom:marker xmlns:custom="urn:test" value="untouched"/>');
  preserved(encoded, result);
});


test('editor undo and redo restore both ink representations together', () => {
  const { source } = inkFixture(false, true, officeInk());
  const session = new WordEditingSession(source);
  session.updateDrawing({ elementId: first(source).elementId, widthPoints: 50, heightPoints: 60, layout: 'behind', xPoints: 10, yPoints: 20 });
  const edited = session.artifact.bytes();
  expect(first(session.artifact).widthPoints).toBeCloseTo(50, 3);
  expect(first(session.artifact).heightPoints).toBeCloseTo(60, 3);
  expect(first(session.artifact).anchor?.behindDocument).toBe(true);
  session.undo();
  expect(session.artifact.bytes()).toEqual(source.bytes());
  session.redo();
  expect(session.artifact.bytes()).toEqual(edited);
});

 test('resizing refreshes the fallback while retaining native samples and physical pen size', () => {
  const { source } = inkFixture(false, true, officeInk());
  const drawing = first(source);
  const result = source.resizeDrawing({ elementId: drawing.elementId, widthPoints: 200, heightPoints: 50 });
  const image = first(result);
  if (image.kind !== 'image' || !image.inkProjection) throw Error('Expected native ink');
  expect(image.inkProjection.bounds.width - image.widthPoints).toBeCloseTo(.05 * 72 / 2.54);
  expect(image.inkProjection.bounds.height - image.heightPoints).toBeCloseTo(.05 * 72 / 2.54);
  const bitmap = result.document.package.getPart('/word/media/ink.png')!;
  expect([...result.document.package.readPart(bitmap).slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(result.document.source.source).toContain(`width:${image.inkProjection.bounds.width}pt`);
  preserved(source, result);
});
