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
