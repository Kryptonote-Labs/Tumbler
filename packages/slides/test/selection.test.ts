import { expect, test } from 'bun:test';
import {
  applyPresentationCommand as apply,
  createPresentation,
  openPresentationArtifact,
  PresentationEditingSession,
  shapeMatrix,
  transformPoint,
  resizeSlideSelection,
  slideObjectEnclosed,
  translateSlideObject,
} from '../src/index.ts';

function fixture() {
  let deck = createPresentation();
  const slideId = deck.document.slides[0]!.id;
  for (const bounds of [
    { x: 0, y: 0, width: 900, height: 500 },
    { x: 100, y: 100, width: 80, height: 40 },
    { x: 200, y: 100, width: 80, height: 40 },
  ])
    deck = apply(deck, {
      name: 'insert-object',
      slideId,
      bounds,
      object: { kind: 'shape', text: 'Object' },
    });
  return { deck, slideId, objects: deck.document.slides[0]!.objects };
}

test('marquee encloses objects and excludes backgrounds and partially enclosed objects', () => {
  const { objects } = fixture();
  const rect = { x: 90, y: 90, width: 200, height: 60 };
  expect(
    objects.filter((object) => slideObjectEnclosed(object, rect)).map((object) => object.key),
  ).toEqual(objects.slice(1).map((object) => object.key));
  expect(slideObjectEnclosed(objects[1]!, { ...rect, width: 50 })).toBe(false);
});

test('marquee uses rotated corners and the visible text height', () => {
  const { objects } = fixture();
  const object = objects[1]!;
  const rotated = { ...object, matrix: shapeMatrix({ ...object.transform, rotation: 90 }) };
  expect(slideObjectEnclosed(rotated, { x: 100, y: 100, width: 80, height: 40 })).toBe(false);
  expect(slideObjectEnclosed(rotated, { x: 90, y: 70, width: 100, height: 100 })).toBe(true);
  expect(slideObjectEnclosed(object, { x: 90, y: 90, width: 100, height: 60 }, 100)).toBe(false);
});

test('moving selected objects uses slide coordinates inside rotated and scaled groups', () => {
  const object = fixture().objects[1]!;
  const grouped = { ...object, parentMatrix: [0, 2, -3, 0, 50, 60] as const };
  const moved = translateSlideObject(grouped, 30, 20);
  expect(moved.x).toBe(object.transform.x + 10);
  expect(moved.y).toBe(object.transform.y - 10);
});

test('batch move, copy and delete retain all objects through PPTX export', () => {
  const { deck, slideId, objects } = fixture();
  const keys = objects.slice(1).map((object) => object.key);
  const moved = apply(deck, {
    name: 'batch',
    commands: objects.slice(1).map((object) => ({
      name: 'update-object',
      slideId,
      objectKey: object.key,
      x: object.transform.x + 30,
      y: object.transform.y + 20,
      width: object.transform.width,
      height: object.transform.height,
    })),
  });
  expect(moved.document.slides[0]!.objects.slice(1).map((object) => object.transform.x)).toEqual([
    130, 230,
  ]);
  const copied = apply(moved, {
    name: 'batch',
    commands: keys.map((objectKey) => ({
      name: 'paste-object',
      slideId,
      objectKey,
      sourceSlideId: slideId,
      source: Buffer.from(moved.bytes()).toString('base64'),
    })),
  });
  const deleted = apply(copied, {
    name: 'batch',
    commands: keys.map((objectKey) => ({ name: 'delete-object', slideId, objectKey })),
  });
  const reopened = openPresentationArtifact(deleted.bytes());
  expect(reopened.document.slides[0]!.objects).toHaveLength(3);
  expect(reopened.document.slides[0]!.objects.some((object) => keys.includes(object.key))).toBe(
    false,
  );
  expect(deck.document.slides[0]!.objects).toHaveLength(3);
});


test('a batch move creates one undo and redo step in the shared editing session', () => {
  const { deck, slideId, objects } = fixture();
  const session = new PresentationEditingSession(deck);
  session.execute({ name: 'batch', commands: objects.slice(1).map(object => ({
    name: 'update-object', slideId, objectKey: object.key,
    x: object.transform.x + 30, y: 120, width: 80, height: 40,
  })) });
  expect(session.artifact.document.slides[0]!.objects.slice(1).map(object => object.transform.x)).toEqual([130, 230]);
  session.undo();
  expect(session.artifact).toBe(deck);
  expect(session.canUndo).toBe(false);
  session.redo();
  expect(session.artifact.document.slides[0]!.objects.slice(1).map(object => object.transform.x)).toEqual([130, 230]);
});

test('multi-selection resize applies size ratios and fixes each opposite corner', () => {
  const objects = fixture().objects.slice(1);
  const active = objects[0]!;
  const other = {
    ...objects[1]!,
    transform: { ...objects[1]!.transform, width: 160, height: 80, rotation: 35, flipH: true },
  };
  const resized = resizeSlideSelection([active, other], active, { x: 1, y: 1 }, 40, 20);
  for (const [index, object] of [active, other].entries()) {
    const next = resized[index]!;
    expect(next.width).toBeCloseTo(object.transform.width * 1.5);
    expect(next.height).toBeCloseTo(object.transform.height * 1.5);
    const before = transformPoint(shapeMatrix(object.transform), 0, 0);
    const after = transformPoint(shapeMatrix(next), 0, 0);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  }
});

test('multi-selection edge resize leaves height unchanged and skips immovable objects', () => {
  const objects = fixture().objects.slice(1);
  const active = objects[0]!;
  const resized = resizeSlideSelection(
    [active, { ...objects[1]!, movable: false }],
    active,
    { x: -1, y: 0 },
    20,
    100,
  );
  expect(resized).toHaveLength(1);
  expect(resized[0]!.width).toBe(60);
  expect(resized[0]!.height).toBe(40);
  expect(resized[0]!.x + resized[0]!.width).toBe(active.transform.x + active.transform.width);
});

test('multi-selection corner resize locks aspect ratios and clamps small sizes', () => {
  const objects = fixture().objects.slice(1);
  const active = objects[0]!;
  for (const dx of [40, -1000]) {
    const resized = resizeSlideSelection(objects, active, { x: 1, y: 1 }, dx, 0, {
      preserveAspectRatio: true,
    });
    for (const next of resized) {
      expect(next.width / next.height).toBeCloseTo(2);
      expect(next.width).toBeGreaterThanOrEqual(8);
      expect(next.height).toBeGreaterThanOrEqual(8);
    }
  }
});
