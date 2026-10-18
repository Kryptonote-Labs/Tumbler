import { expect, test } from 'bun:test';
import { openWordArtifact, WordEditingSession } from '../src/index.ts';
import { inkFixture } from './ink-fixture.ts';
import { officeInk } from '../../ink/test/fixture.ts';
import { beginPackageTransaction } from '@tumblerjs/opc';
const first = (artifact: ReturnType<typeof openWordArtifact>) => [...artifact.document.drawings.values()][0]!;

test.each(['strict', 'transitional'] as const)('stroke editing updates native ink and cached PNG atomically in %s', conformance => {
  let { source } = inkFixture(false, true, officeInk(), conformance);
  const transaction = beginPackageTransaction(source.document.package);
  transaction.replacePart(source.document.part.name, new TextEncoder().encode(source.document.source.source.replace('<v:shape ', '<v:shape xmlns:o="urn:schemas-microsoft-com:office:office" o:gfxdata="stale-cache" ')));
  source = openWordArtifact(transaction.commit());
  const before = source.bytes(), drawing = first(source), trace = drawing.ink!.traces[0]!;
  const session = new WordEditingSession(source);
  const edited = session.replaceInkTrace({ elementId: drawing.elementId, traceElementId: trace.elementId, points: [[0, 1000], [1000, 0]] });
  expect(first(edited).ink!.traces[0]!.points).toEqual([[0, 1000], [1000, 0]]);
  expect(first(edited)).toMatchObject({ inkRendering: 'vector' });
  expect(edited.document.source.source).not.toContain('gfxdata');
  expect(first(edited).inkSource!.partName.value).toBe(drawing.inkSource!.partName.value);
  const bitmap = edited.document.package.parts.find(part => part.contentType === 'image/png')!;
  expect([...edited.document.package.readPart(bitmap).slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(first(edited).ink!.source.source).toContain('<custom:data answer="42"/>');
  expect(source.bytes()).toBe(before);
  session.undo(); expect(session.artifact).toBe(source);
  session.redo(); expect(session.artifact).toBe(edited);
});

test('editing one drawing cannot change a second drawing sharing its InkML and bitmap', () => {
  const { source, alternate } = inkFixture(false, true, officeInk());
  const transaction = beginPackageTransaction(source.document.package);
  transaction.replacePart(source.document.part.name, new TextEncoder().encode(source.document.source.source.replace(alternate, alternate + alternate)));
  const shared = openWordArtifact(transaction.commit()), drawing = first(shared);
  const edited = shared.replaceInkTrace({ elementId: drawing.elementId, traceElementId: drawing.ink!.traces[0]!.elementId, points: [[0, 1000], [1000, 0]] });
  const drawings = [...edited.document.drawings.values()];
  expect(drawings[0]!.ink!.traces[0]!.points).toEqual([[0, 1000], [1000, 0]]);
  expect(drawings[1]!.ink!.traces[0]!.points).toEqual([[0, 0], [1000, 1000]]);
  expect(drawings[1]!.inkSource!.partName.value).toBe('/word/ink/ink1.xml');
});

test('invalid samples and preview budgets leave the entire package unchanged; identical samples are a no-op', () => {
  const { source } = inkFixture(false, true, officeInk());
  const drawing = first(source), trace = drawing.ink!.traces[0]!, before = source.bytes();
  const target = { elementId: drawing.elementId, traceElementId: trace.elementId };
  expect(source.replaceInkTrace({ ...target, points: trace.points })).toBe(source);
  expect(() => source.replaceInkTrace({ ...target, points: [[NaN, 0]] })).toThrow();
  expect(() => source.replaceInkTrace({ ...target, points: [[0, 1000], [1000, 0]], preview: { maxPixels: 1 } })).toThrow();
  expect(source.bytes()).toBe(before);
});

test('native-only ink can be edited without introducing a legacy bitmap', () => {
  const { source } = inkFixture(false, false, officeInk());
  const drawing = first(source);
  const edited = source.replaceInkTrace({ elementId: drawing.elementId, traceElementId: drawing.ink!.traces[0]!.elementId, points: [[0, 1000], [1000, 0]] });
  expect(first(edited).ink!.traces[0]!.points).toEqual([[0, 1000], [1000, 0]]);
  expect(edited.document.source.source).not.toContain('Fallback');
});

test('repeated edits reuse exclusive parts instead of accumulating obsolete previews', () => {
  let { source } = inkFixture(false, true, officeInk());
  const partCount = source.document.package.parts.length;
  for (let index = 0; index < 4; index++) {
    const drawing = first(source);
    source = source.replaceInkTrace({ elementId: drawing.elementId, traceElementId: drawing.ink!.traces[0]!.elementId, points: [[index, 1000], [1000, index]] });
    expect(source.document.package.parts).toHaveLength(partCount);
  }
});

test.each(['strict', 'transitional'] as const)('endpoint edits preserve other sample positions, rotation and copied parts in %s', conformance => {
  let { source, alternate } = inkFixture(false, true, officeInk(), conformance);
  const transaction = beginPackageTransaction(source.document.package);
  const xml = source.document.source.source;
  const drawingNamespace = conformance === 'strict' ? 'http://purl.oclc.org/ooxml/drawingml/main' : 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const part = `<w14:contentPart r:id="ink"><w14:xfrm rot="1800000" flipH="1"><a:off xmlns:a="${drawingNamespace}" x="127000" y="254000"/><a:ext xmlns:a="${drawingNamespace}" cx="1408680" cy="1384990"/></w14:xfrm></w14:contentPart>`;
  // Both drawings share the same part; the first edit must copy it before rebasing.
  const actualAlternate = conformance === 'strict' ? alternate.replaceAll('http://schemas.openxmlformats.org/drawingml/2006/', 'http://purl.oclc.org/ooxml/drawingml/') : alternate;
  transaction.replacePart(source.document.part.name, new TextEncoder().encode(xml.replace(actualAlternate, actualAlternate + actualAlternate).replaceAll('<w14:contentPart r:id="ink"/>', part)));
  source = openWordArtifact(transaction.commit());
  const drawing = first(source), matrix = drawing.inkProjection!.matrix;
  const edited = source.replaceInkTrace({ elementId: drawing.elementId, traceElementId: drawing.ink!.traces[0]!.elementId, points: [[-500, 0], [1000, 1000]], preserveSampleTransform: true });
  const result = first(edited);
  result.inkProjection!.matrix.forEach((value, i) => expect(value).toBeCloseTo(matrix[i]!, 4));
  expect(result.widthPoints).toBe(drawing.widthPoints);
  expect(result.heightPoints).toBe(drawing.heightPoints);
  expect([...edited.document.drawings.values()][1]!.ink!.traces[0]!.points).toEqual([[0, 0], [1000, 1000]]);
  expect(result.inkSource!.partName.value).not.toBe(drawing.inkSource!.partName.value);
});

test('endpoint edits create a transform for an implicit frame and retain degenerate sample axes', () => {
  let { source } = inkFixture(false, false, officeInk());
  const drawing = first(source), matrix = drawing.inkProjection!.matrix;
  source = source.replaceInkTrace({ elementId: drawing.elementId, traceElementId: drawing.ink!.traces[0]!.elementId, points: [[1000, 1000], [1000, 1000]], preserveSampleTransform: true });
  const project = (m: readonly number[]) => [m[0]! * 72 / 2.54 + m[2]! * 72 / 2.54 + m[4]!, m[1]! * 72 / 2.54 + m[3]! * 72 / 2.54 + m[5]!];
  project(first(source).inkProjection!.matrix).forEach((value, i) => expect(value).toBeCloseTo(project(matrix)[i]!, 4));
  expect(source.document.source.source).toContain('w14:xfrm');
});

test('collaborative stroke overrides preserve preview/export geometry through resize and undo', async () => {
  const { NativeWordDocument, importWordContent, wordInkPoints } = await import('../src/index.ts');
  const { source } = inkFixture(false, false, officeInk());
  const blocks = importWordContent(source), original = first(source);
  const edited = blocks.map(block => block.kind !== 'paragraph' ? block : { ...block, runs: block.runs.map(run => run.source !== original.elementId ? run : {
    ...run, drawing: { width: original.widthPoints * 1.5, height: original.heightPoints * .8 }, inkTraces: [{ traceIndex: 0, points: [[-500, 250], [1000, 1000]] }],
  }) });
  const model = new NativeWordDocument({ source });
  model.update(edited);
  const preview = model.drawingAt(0)!;
  const exported = first(model.artifact());
  expect(exported.ink!.traces[0]!.points).toEqual([[-500, 250], [1000, 1000]]);
  const actual = wordInkPoints(exported);
  wordInkPoints(preview).forEach((point, index) => {
    expect(point.x).toBeCloseTo(actual[index]!.x, 4); expect(point.y).toBeCloseTo(actual[index]!.y, 4);
  });
  model.update(blocks);
  expect(model.drawingAt(0)!.ink!.traces[0]!.points).toEqual(original.ink!.traces[0]!.points);
});

test('destination-dependent ink remains exportable without inventing a bitmap backdrop', () => {
  const xml = officeInk({ brush: '<brushProperty name="rasterOp" value="xOrPen"/>' });
  const { source } = inkFixture(false, true, xml);
  const drawing = first(source), trace = drawing.ink!.traces[0]!;
  const edited = source.replaceInkTrace({ elementId: drawing.elementId, traceElementId: trace.elementId, points: [[-100, 0], [1000, 1000]], preserveSampleTransform: true });
  expect(first(edited).inkRendering).toBe('raster');
  expect(first(edited).ink!.traces[0]!.points[0]).toEqual([-100, 0]);
  expect(edited.document.source.source).not.toContain('mc:Fallback');
  const cached = source.replaceInkTrace({ elementId: drawing.elementId, traceElementId: trace.elementId, points: [[-100, 0], [1000, 1000]], preview: { background: [255, 255, 255] } });
  expect(cached.document.source.source).toContain('mc:Fallback');
  const resized = source.updateDrawing({ elementId: drawing.elementId, widthPoints: 120, heightPoints: 100 });
  expect(first(resized).ink!.source.source).toBe(drawing.ink!.source.source);
  expect(resized.document.source.source).not.toContain('mc:Fallback');
});
