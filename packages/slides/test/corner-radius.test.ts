import { expect, test } from 'bun:test';
import { applyPresentationCommand as run, createPresentation, openPresentationArtifact, PresentationEditingSession } from '../src/index.ts';
function deck(geometry: 'roundRect' | 'rect' = 'roundRect', cornerRadius?: number) {
  let artifact = createPresentation();
  const slideId = artifact.document.slides[0]!.id;
  artifact = run(artifact, { name: 'insert-object', slideId, bounds: { x: 0, y: 0, width: 120, height: 60 }, object: { kind: 'shape', geometry, ...(cornerRadius === undefined ? {} : { cornerRadius }) } });
  return { artifact, slideId, objectKey: artifact.document.slides[0]!.objects[0]!.key };
}
const object = (artifact: ReturnType<typeof createPresentation>) => artifact.document.slides[0]!.objects[0]!;
test('native radius edits change rendered geometry, survive export, and scale on resize', () => {
  const { artifact, slideId, objectKey } = deck();
  expect(object(artifact).cornerRadius).toBeCloseTo(10.0002);
  for (const radius of [0, 6, 15, 30, 100]) {
    const edited = run(artifact, { name: 'style-shape', slideId, objectKey, cornerRadius: radius });
    expect(object(edited).cornerRadius).toBeCloseTo(Math.min(30, radius));
    expect(object(openPresentationArtifact(edited.bytes())).cornerRadius).toBeCloseTo(Math.min(30, radius));
    expect(object(edited).drawingGeometry?.paths).not.toEqual(object(artifact).drawingGeometry?.paths);
    const resized = run(edited, { name: 'update-object', slideId, objectKey, x: 0, y: 0, width: 240, height: 120 });
    expect(object(resized).cornerRadius).toBeCloseTo(Math.min(30, radius) * 2);
  }
});
test('insertion accepts custom radii and radius edits support undo and redo', () => {
  const { artifact, slideId, objectKey } = deck('roundRect', 15);
  expect(object(artifact).cornerRadius).toBeCloseTo(15);
  const session = new PresentationEditingSession(artifact);
  session.styleShape({ slideId, objectKey, cornerRadius: 0 });
  expect(object(session.artifact).cornerRadius).toBe(0);
  session.undo();
  expect(object(session.artifact).cornerRadius).toBeCloseTo(15);
  session.redo();
  expect(object(session.artifact).cornerRadius).toBe(0);
});
test('unsupported shapes and invalid radii reject edits without changing the source', () => {
  const { artifact, slideId, objectKey } = deck('rect');
  expect(() => run(artifact, { name: 'style-shape', slideId, objectKey, cornerRadius: 4 })).toThrow();
  expect(() => deck('rect', 4)).toThrow();
  const rounded = deck();
  for (const cornerRadius of [-1, NaN, Infinity]) expect(() => rounded.artifact.styleShape({ slideId: rounded.slideId, objectKey: rounded.objectKey, cornerRadius })).toThrow();
  expect(object(artifact).geometry).toBe('rect');
});
