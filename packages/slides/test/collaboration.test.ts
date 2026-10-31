import { expect, test } from 'bun:test';
import { createPresentation, applyPresentationCommand, rebasePresentationCommands, slideTextValue } from '../src/index.ts';
function fixture() {
  let base = createPresentation();
  const slideId = base.document.slides[0]!.id;
  base = applyPresentationCommand(base, { name: 'insert-object', slideId, bounds: { x: 10, y: 10, width: 100, height: 50 }, object: { kind: 'shape', text: 'Hello world' } });
  const objectKey = base.document.slides[0]!.objects.at(-1)!.key;
  return { base, slideId, objectKey };
}
test('text insertions at the same position preserve both authors in acceptance order', () => {
  const { base, slideId, objectKey } = fixture();
  const remote = applyPresentationCommand(base, { name: 'edit-text', slideId, objectKey, start: 5, end: 5, value: ' Alice' });
  const result = rebasePresentationCommands(base, remote, [{ name: 'edit-text', slideId, objectKey, start: 5, end: 5, value: ' Bob' }]);
  expect(slideTextValue(result.artifact.document.slides[0]!.objects.at(-1)!)).toBe('Hello Alice Bob world');
});
test('queued text edits follow remote insertion and their own preceding edit', () => {
  const { base, slideId, objectKey } = fixture();
  const remote = applyPresentationCommand(base, { name: 'edit-text', slideId, objectKey, start: 0, end: 0, value: 'Remote ' });
  const result = rebasePresentationCommands(base, remote, [
    { name: 'edit-text', slideId, objectKey, start: 11, end: 11, value: '!' },
    { name: 'edit-text', slideId, objectKey, start: 12, end: 12, value: '?' },
  ]);
  expect(slideTextValue(result.artifact.document.slides[0]!.objects.at(-1)!)).toBe('Remote Hello world!?');
});
test('overlapping replacements retain recovery rather than destroying remote text', () => {
  const { base, slideId, objectKey } = fixture();
  const remote = applyPresentationCommand(base, { name: 'edit-text', slideId, objectKey, start: 6, end: 11, value: 'Alice' });
  expect(() => rebasePresentationCommands(base, remote, [{ name: 'edit-text', slideId, objectKey, start: 6, end: 11, value: 'Bob' }])).toThrow('local edits are retained');
});
test('geometry merges independent coordinates', () => {
  const { base, slideId, objectKey } = fixture();
  const remote = applyPresentationCommand(base, { name: 'update-object', slideId, objectKey, x: 10, y: 40, width: 100, height: 50 });
  const result = rebasePresentationCommands(base, remote, [{ name: 'update-object', slideId, objectKey, x: 60, y: 10, width: 100, height: 50 }]);
  expect(result.artifact.document.slides[0]!.objects.at(-1)!.transform).toMatchObject({ x: 60, y: 40 });
});
test('new objects keep their identity across colliding package allocators', () => {
  const { base, slideId } = fixture();
  const insert = { name: 'insert-object' as const, slideId, bounds: { x: 10, y: 10, width: 100, height: 50 }, object: { kind: 'shape' as const, text: 'Local' } };
  const branch = applyPresentationCommand(base, insert);
  const key = branch.document.slides[0]!.objects.at(-1)!.key;
  const remote = applyPresentationCommand(base, { ...insert, object: { kind: 'shape', text: 'Remote' } });
  const result = rebasePresentationCommands(base, remote, [insert, { name: 'edit-text', slideId, objectKey: key, start: 5, end: 5, value: '!' }]);
  expect(result.artifact.document.slides[0]!.objects.slice(-2).map(slideTextValue)).toEqual(['Remote', 'Local!']);
});
