import { expect, test } from 'bun:test';
import {
  createPresentation,
  applyPresentationCommand,
  rebasePresentationCommands as rebase,
  slideTextValue,
} from '../src/index.ts';
const rebasePresentationCommands = (
  base: Parameters<typeof rebase>[0],
  current: Parameters<typeof rebase>[1],
  commands: Parameters<typeof rebase>[2],
  intervening: Parameters<typeof rebase>[3] = [],
) => rebase(base, current, commands, intervening);
function fixture() {
  let base = createPresentation();
  const slideId = base.document.slides[0]!.id;
  base = applyPresentationCommand(base, {
    name: 'insert-object',
    slideId,
    bounds: { x: 10, y: 10, width: 100, height: 50 },
    object: { kind: 'shape', text: 'Hello world' },
  });
  const objectKey = base.document.slides[0]!.objects.at(-1)!.key;
  return { base, slideId, objectKey };
}
test('text insertions at the same position preserve both authors in acceptance order', () => {
  const { base, slideId, objectKey } = fixture();
  const remote = applyPresentationCommand(base, {
    name: 'edit-text',
    slideId,
    objectKey,
    start: 5,
    end: 5,
    value: ' Alice',
  });
  const result = rebasePresentationCommands(base, remote, [
    { name: 'edit-text', slideId, objectKey, start: 5, end: 5, value: ' Bob' },
  ]);
  expect(slideTextValue(result.artifact.document.slides[0]!.objects.at(-1)!)).toBe(
    'Hello Alice Bob world',
  );
});
test('queued text edits follow remote insertion and their own preceding edit', () => {
  const { base, slideId, objectKey } = fixture();
  const remote = applyPresentationCommand(base, {
    name: 'edit-text',
    slideId,
    objectKey,
    start: 0,
    end: 0,
    value: 'Remote ',
  });
  const result = rebasePresentationCommands(base, remote, [
    { name: 'edit-text', slideId, objectKey, start: 11, end: 11, value: '!' },
    { name: 'edit-text', slideId, objectKey, start: 12, end: 12, value: '?' },
  ]);
  expect(slideTextValue(result.artifact.document.slides[0]!.objects.at(-1)!)).toBe(
    'Remote Hello world!?',
  );
});
test('overlapping replacements retain recovery rather than destroying remote text', () => {
  const { base, slideId, objectKey } = fixture();
  const remote = applyPresentationCommand(base, {
    name: 'edit-text',
    slideId,
    objectKey,
    start: 6,
    end: 11,
    value: 'Alice',
  });
  expect(() =>
    rebasePresentationCommands(base, remote, [
      { name: 'edit-text', slideId, objectKey, start: 6, end: 11, value: 'Bob' },
    ]),
  ).toThrow('local edits are retained');
});
test('geometry merges independent coordinates', () => {
  const { base, slideId, objectKey } = fixture();
  const remote = applyPresentationCommand(base, {
    name: 'update-object',
    slideId,
    objectKey,
    x: 10,
    y: 40,
    width: 100,
    height: 50,
  });
  const result = rebasePresentationCommands(base, remote, [
    { name: 'update-object', slideId, objectKey, x: 60, y: 10, width: 100, height: 50 },
  ]);
  expect(result.artifact.document.slides[0]!.objects.at(-1)!.transform).toMatchObject({
    x: 60,
    y: 40,
  });
});
test('new objects keep their identity across colliding package allocators', () => {
  const { base, slideId } = fixture();
  const insert = {
    name: 'insert-object' as const,
    slideId,
    bounds: { x: 10, y: 10, width: 100, height: 50 },
    object: { kind: 'shape' as const, text: 'Local' },
  };
  const branch = applyPresentationCommand(base, insert);
  const key = branch.document.slides[0]!.objects.at(-1)!.key;
  const remote = applyPresentationCommand(base, {
    ...insert,
    object: { kind: 'shape', text: 'Remote' },
  });
  const result = rebasePresentationCommands(base, remote, [
    insert,
    { name: 'edit-text', slideId, objectKey: key, start: 5, end: 5, value: '!' },
  ]);
  expect(result.artifact.document.slides[0]!.objects.slice(-2).map(slideTextValue)).toEqual([
    'Remote',
    'Local!',
  ]);
});
test('replacement ending beside a remote insertion does not delete the insertion', () => {
  const { base, slideId, objectKey } = fixture();
  const remote = applyPresentationCommand(base, {
    name: 'edit-text',
    slideId,
    objectKey,
    start: 5,
    end: 5,
    value: ' Alice',
  });
  const result = rebasePresentationCommands(base, remote, [
    { name: 'edit-text', slideId, objectKey, start: 0, end: 5, value: 'Bob' },
  ]);
  expect(slideTextValue(result.artifact.document.slides[0]!.objects.at(-1)!)).toBe(
    'Bob Alice world',
  );
});
test('separate remote text edits leave the unchanged middle editable', () => {
  const { base, slideId, objectKey } = fixture();
  const remote = applyPresentationCommand(base, {
    name: 'batch',
    commands: [
      { name: 'edit-text', slideId, objectKey, start: 11, end: 11, value: '!' },
      { name: 'edit-text', slideId, objectKey, start: 0, end: 0, value: 'Hi ' },
    ],
  });
  const result = rebasePresentationCommands(base, remote, [
    { name: 'edit-text', slideId, objectKey, start: 6, end: 11, value: 'everyone' },
  ]);
  expect(slideTextValue(result.artifact.document.slides[0]!.objects.at(-1)!)).toBe(
    'Hi Hello everyone!',
  );
});
test('replace-all keeps its original match set and detects changed matches', () => {
  const { base, slideId, objectKey } = fixture();
  const remote = applyPresentationCommand(base, {
    name: 'edit-text',
    slideId,
    objectKey,
    start: 6,
    end: 11,
    value: 'everyone',
  });
  expect(() =>
    rebasePresentationCommands(base, remote, [
      { name: 'replace-all', find: 'world', value: 'Bob', caseSensitive: true },
    ]),
  ).toThrow('local edits are retained');
});
test('deleting a sibling ignores parser IDs changed by a preceding paragraph insertion', () => {
  const { base: initial, slideId, objectKey } = fixture();
  const base = applyPresentationCommand(initial, {
    name: 'insert-object',
    slideId,
    bounds: { x: 200, y: 10, width: 100, height: 50 },
    object: { kind: 'shape', text: 'Second' },
  });
  const second = base.document.slides[0]!.objects.at(-1)!.key;
  const remote = applyPresentationCommand(base, {
    name: 'edit-text',
    slideId,
    objectKey,
    start: 11,
    end: 11,
    value: '\nNew paragraph',
  });
  const result = rebasePresentationCommands(base, remote, [
    { name: 'delete-object', slideId, objectKey: second },
  ]);
  expect(result.artifact.document.slides[0]!.objects.map(slideTextValue)).toEqual([
    'Hello world\nNew paragraph',
  ]);
});
test('a branch can insert and delete its own object after a concurrent insertion', () => {
  const { base, slideId } = fixture();
  const insert = {
    name: 'insert-object' as const,
    slideId,
    bounds: { x: 10, y: 10, width: 100, height: 50 },
    object: { kind: 'shape' as const, text: 'Local' },
  };
  const key = applyPresentationCommand(base, insert).document.slides[0]!.objects.at(-1)!.key;
  const remote = applyPresentationCommand(base, {
    ...insert,
    object: { kind: 'shape', text: 'Remote' },
  });
  const result = rebasePresentationCommands(base, remote, [
    insert,
    { name: 'delete-object', slideId, objectKey: key },
  ]);
  expect(result.artifact.document.slides[0]!.objects.map(slideTextValue)).toEqual([
    'Hello world',
    'Remote',
  ]);
});
test('replace-all does not touch matches added by another author', () => {
  const { base, slideId } = fixture();
  const remote = applyPresentationCommand(base, {
    name: 'insert-object',
    slideId,
    bounds: { x: 10, y: 10, width: 100, height: 50 },
    object: { kind: 'shape', text: 'world' },
  });
  const result = rebasePresentationCommands(base, remote, [
    { name: 'replace-all', find: 'world', value: 'everyone', caseSensitive: true },
  ]);
  expect(result.artifact.document.slides[0]!.objects.map(slideTextValue)).toEqual([
    'Hello everyone',
    'world',
  ]);
});

test('deleted objects cannot redirect stale edits onto replacement objects with reused keys', () => {
  const { base, slideId, objectKey } = fixture();
  const intervening = [
    { name: 'delete-object' as const, slideId, objectKey },
    {
      name: 'insert-object' as const,
      slideId,
      bounds: { x: 10, y: 10, width: 100, height: 50 },
      object: { kind: 'shape' as const, text: 'Replacement' },
    },
  ];
  const remote = intervening.reduce(applyPresentationCommand, base);
  expect(remote.document.slides[0]!.objects.at(-1)!.key).toBe(objectKey);
  expect(() =>
    rebasePresentationCommands(
      base,
      remote,
      [{ name: 'style-shape', slideId, objectKey, fill: '#FF0000' }],
      intervening,
    ),
  ).toThrow('local edits are retained');
});

test('duplicating a changed source cannot remap a pending deletion to the wrong cloned object', () => {
  const { base: initial, slideId, objectKey } = fixture();
  const base = applyPresentationCommand(initial, {
    name: 'insert-object',
    slideId,
    bounds: { x: 200, y: 10, width: 100, height: 50 },
    object: { kind: 'shape', text: 'Second' },
  });
  const duplicate = { name: 'insert-slide' as const, index: 1, sourceId: slideId };
  const branch = applyPresentationCommand(base, duplicate);
  const cloned = branch.document.slides[1]!;
  const deletion = { name: 'delete-object' as const, slideId, objectKey };
  const remote = applyPresentationCommand(base, deletion);
  expect(() =>
    rebasePresentationCommands(
      base,
      remote,
      [duplicate, { name: 'delete-object', slideId: cloned.id, objectKey: cloned.objects[0]!.key }],
      [deletion],
    ),
  ).toThrow('local edits are retained');
});

test('formatting a range containing concurrent typing preserves and formats the inserted text', () => {
  const { base, slideId, objectKey } = fixture();
  const remoteEdit = {
    name: 'edit-text' as const,
    slideId,
    objectKey,
    start: 5,
    end: 5,
    value: ' Alice',
  };
  const remote = applyPresentationCommand(base, remoteEdit);
  const result = rebasePresentationCommands(
    base,
    remote,
    [
      {
        name: 'format-text',
        slideId,
        objectKey,
        start: 0,
        end: 11,
        patch: { text: { bold: { set: true } } },
      },
    ],
    [remoteEdit],
  );
  const object = result.artifact.document.slides[0]!.objects.at(-1)!;
  expect(slideTextValue(object)).toBe('Hello Alice world');
  expect(object.text!.paragraphs.flatMap((p) => p.runs).every((run) => run.bold)).toBe(true);
});
