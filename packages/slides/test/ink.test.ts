import { pastePresentationObject } from '../src/clipboard.ts';
import { expect, test } from 'bun:test';
import {
  applyPresentationCommand as run,
  createPresentation,
  openPresentationArtifact,
  PresentationEditingSession,
  rebasePresentationCommands,
  presentationInkPoints,
  hitPresentationInk,
} from '../src/index.ts';

function deck(
  highlighter = false,
  points: [number, number, number][] = [
    [100, 100, 0.5],
    [140, 120, 1],
    [180, 110, 0.2],
  ],
) {
  const a = createPresentation();
  const slideId = a.document.slides[0]!.id;
  const b = run(a, { name: 'insert-ink', slideId, points, color: '#336699', size: 3, highlighter });
  return { a: b, slideId, object: b.document.slides[0]!.objects[0]! };
}
test('native ink exports pressure, brush settings, calibrated coordinates and a PNG fallback', () => {
  for (const highlighter of [false, true]) {
    const { a, object } = deck(highlighter);
    expect(object.movable).toBe(true);
    expect(object.ink?.document.traces).toHaveLength(1);
    const trace = object.ink!.document.traces[0]!;
    expect(trace.brush.color).toBe('#336699');
    expect(trace.brush.transparency).toBe(highlighter ? 128 : 0);
    expect(trace.points[1]![2]).toBe(1023);
    expect(object.image?.contentType).toBe('image/svg+xml');
    const saved = openPresentationArtifact(a.bytes());
    expect(saved.document.slides[0]!.objects[0]!.ink?.document.traces[0]!.points).toEqual(
      trace.points,
    );
    expect(a.document.package.parts.some((p) => p.contentType === 'image/png')).toBe(true);
    expect(a.document.package.parts.some((p) => p.contentType === 'application/inkml+xml')).toBe(
      true,
    );
    expect(saved.bytes()).toEqual(a.bytes());
  }
});
test('stationary taps and horizontal strokes retain nonempty editable frames', () => {
  for (const points of [
    [[30, 30, 0.5]],
    [
      [30, 30, 0.5],
      [100, 30, 0.5],
    ],
  ] satisfies [number, number, number][][]) {
    const { object } = deck(false, points);
    expect(object.ink).toBeDefined();
    expect(object.transform.width).toBeGreaterThan(0);
    expect(object.transform.height).toBeGreaterThan(0);
  }
});
test('ink moves, resizes, duplicates, reorders, copies across decks and deletes as one object', () => {
  const { a, object, slideId } = deck();
  let b = run(a, {
    name: 'update-object',
    slideId,
    objectKey: object.key,
    x: 200,
    y: 150,
    width: 200,
    height: 100,
    rotation: 35,
  });
  expect(b.document.slides[0]!.objects[0]!.ink).toBeDefined();
  b = run(b, { name: 'duplicate-object', slideId, objectKey: object.key });
  expect(b.document.slides[0]!.objects).toHaveLength(2);
  const copy = b.document.slides[0]!.objects[1]!;
  expect(copy.ink).toBeDefined();
  b = run(b, { name: 'arrange', slideId, objectKey: copy.key, action: 'back' });
  expect(b.document.slides[0]!.objects[0]!.key).toBe(copy.key);
  const dest = createPresentation();
  const pasted = pastePresentationObject(dest, dest.document.slides[0]!.id, b, slideId, copy.key);
  expect(pasted.document.slides[0]!.objects[0]!.ink?.document.traces).toHaveLength(1);
  b = run(b, { name: 'delete-object', slideId, objectKey: object.key });
  b = run(b, { name: 'delete-object', slideId, objectKey: copy.key });
  expect(openPresentationArtifact(b.bytes()).document.slides[0]!.objects).toHaveLength(0);
});

test('resizing a duplicate refreshes only its fallback and preserves the original', () => {
  const { a, slideId, object } = deck();
  let b = run(a, { name: 'duplicate-object', slideId, objectKey: object.key });
  const copy = b.document.slides[0]!.objects[1]!;
  b = run(b, {
    name: 'update-object',
    slideId,
    objectKey: copy.key,
    x: 220,
    y: 180,
    width: 200,
    height: 100,
  });
  const originalImage = a.document.package.parts.find((p) => p.contentType === 'image/png')!;
  expect(b.document.package.readPart(b.document.package.getPart(originalImage.name)!)).toEqual(
    a.document.package.readPart(originalImage),
  );
  expect(b.document.slides[0]!.objects[0]!.image?.bytes).toEqual(object.image?.bytes);
  expect(b.document.slides[0]!.objects[1]!.ink).toBeDefined();
});

test('a stroke is one undo step and simultaneous strokes retain distinct object identities', () => {
  const base = createPresentation(),
    slideId = base.document.slides[0]!.id;
  const command = {
    name: 'insert-ink',
    slideId,
    points: [
      [40, 50, 0.5],
      [60, 80, 0.9],
    ],
    color: '#112233',
    size: 2,
  } as const;
  const local = {
    ...command,
    points: command.points.map((p) => [...p] as [number, number, number]),
  };
  const session = new PresentationEditingSession(base);
  session.execute(local);
  expect(session.artifact.document.slides[0]!.objects).toHaveLength(1);
  session.undo();
  expect(session.artifact.document.slides[0]!.objects).toHaveLength(0);
  session.redo();
  expect(session.artifact.document.slides[0]!.objects[0]!.ink).toBeDefined();
  const remote = { ...local, color: '#aabbcc' };
  const concurrent = run(base, remote);
  const result = rebasePresentationCommands(base, concurrent, [local], [remote]);
  const objects = result.artifact.document.slides[0]!.objects;
  expect(objects).toHaveLength(2);
  expect(new Set(objects.map((o) => o.key)).size).toBe(2);
  expect(objects.map((o) => o.ink!.document.traces[0]!.brush.color)).toEqual([
    '#aabbcc',
    '#112233',
  ]);
  const points = presentationInkPoints(objects[1]!);
  expect(points[0]!.x).toBeCloseTo(40, 1);
  expect(points[0]!.y).toBeCloseTo(50, 1);
});

test('shrinking a horizontal stroke or tap retains its full physical nib in the picture frame', () => {
  for (const points of [
    [
      [100, 100, 0.5],
      [200, 100, 0.5],
    ],
    [[100, 100, 0.5]],
  ] satisfies [number, number, number][][]) {
    let a = createPresentation();
    const slideId = a.document.slides[0]!.id;
    a = run(a, { name: 'insert-ink', slideId, points, color: '#123456', size: 8 });
    const object = a.document.slides[0]!.objects[0]!;
    a = run(a, {
      name: 'update-object',
      slideId,
      objectKey: object.key,
      x: object.transform.x,
      y: object.transform.y,
      width: object.transform.width * 0.1,
      height: object.transform.height * 0.1,
      rotation: 35,
    });
    const resized = openPresentationArtifact(a.bytes()).document.slides[0]!.objects[0]!;
    const bounds = resized.ink!.scene.bounds;
    expect(bounds.x).toBeGreaterThan(-0.001);
    expect(bounds.y).toBeGreaterThan(-0.001);
    expect(bounds.x + bounds.width).toBeLessThan(resized.transform.width * 0.75 + 0.001);
    expect(bounds.y + bounds.height).toBeLessThan(resized.transform.height * 0.75 + 0.001);
    expect(resized.transform.height).toBeGreaterThan(10);
    const png = a.document.package.parts.find((p) =>
      p.name.value.startsWith('/ppt/media/inkEdit'),
    )!;
    const bytes = a.document.package.readPart(png);
    expect(new DataView(bytes.buffer, bytes.byteOffset).getUint32(20)).toBeGreaterThan(10);
  }
});

test('stroke erasing respects painted highlighter and pressure-sensitive pen coverage', () => {
  const base = createPresentation(),
    slideId = base.document.slides[0]!.id;
  const make = (highlighter: boolean, pressure: number) =>
    run(base, {
      name: 'insert-ink',
      slideId,
      points: [
        [100, 100, pressure],
        [200, 100, pressure],
      ],
      size: 24,
      color: '#ffff00',
      highlighter,
    }).document.slides[0]!.objects[0]!;
  const highlighter = make(true, 0.5);
  expect(hitPresentationInk(highlighter, { x: 150, y: 135 })).toBe(false);
  expect(hitPresentationInk(highlighter, { x: 150, y: 120 })).toBe(true);
  expect(hitPresentationInk(highlighter, { x: 150, y: 50 }, { x: 150, y: 150 })).toBe(true);
  const pen = make(false, 0);
  expect(hitPresentationInk(pen, { x: 150, y: 120 })).toBe(false);
  expect(hitPresentationInk(pen, { x: 150, y: 100 })).toBe(true);
});
