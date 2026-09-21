import { expect, test } from "bun:test";
import {
  openPresentationEditingSession,
  openPresentationArtifact,
  resizeSlideTransform,
  shapeMatrix,
  transformPoint,
} from "../src/index.ts";
const fixture = () =>
  Bun.file(
    new URL(
      "../../../apps/docs/static/samples/shapes-and-pictures.pptx",
      import.meta.url,
    ),
  ).bytes();
test("resizing rotated and flipped shapes fixes the opposite corner or edge", () => {
  for (const rotation of [0, 18, 90, 179, 270])
    for (const flipH of [false, true])
      for (const flipV of [false, true])
        for (const x of [-1, 0, 1] as const)
          for (const y of [-1, 0, 1] as const) {
            if (x === 0 && y === 0) continue;
            const original = {
              x: 100,
              y: 150,
              width: 180,
              height: 100,
              rotation,
              flipH,
              flipV,
            };
            const resized = resizeSlideTransform(original, { x, y }, 40, 25);
            const before = transformPoint(
              shapeMatrix(original),
              ((1 - x) * original.width) / 2,
              ((1 - y) * original.height) / 2,
            );
            const after = transformPoint(
              shapeMatrix(resized),
              ((1 - x) * resized.width) / 2,
              ((1 - y) * resized.height) / 2,
            );
            expect(after.x).toBeCloseTo(before.x, 8);
            expect(after.y).toBeCloseTo(before.y, 8);
            expect(resized.rotation).toBe(rotation);
            expect(resized.flipH).toBe(flipH);
            expect(resized.flipV).toBe(flipV);
          }
});
test("rotation and rotated resizing survive reopening and undo without touching other parts", async () => {
  const original = await fixture(),
    session = openPresentationEditingSession(original);
  const slide = session.artifact.document.slides[0]!,
    object = slide.objects.find((o) => o.transform.rotation === 18)!;
  expect(object.movable).toBe(true);
  const target = { slideId: slide.id, objectKey: object.key };
  const rotated = session.updateObject({
    ...target,
    ...object.transform,
    rotation: 63,
  });
  let current = rotated.document.slides[0]!.objects.find(
    (o) => o.key === object.key,
  )!;
  expect(current.transform.rotation).toBe(63);
  expect(current.transform.x).toBe(object.transform.x);
  expect(current.transform.y).toBe(object.transform.y);
  const resized = resizeSlideTransform(
    current.transform,
    { x: 1, y: 1 },
    50,
    30,
  );
  const result = session.updateObject({ ...target, ...resized });
  const reopened = openPresentationArtifact(result.bytes());
  current = reopened.document.slides[0]!.objects.find(
    (o) => o.key === object.key,
  )!;
  expect(current.transform.width).toBeCloseTo(resized.width, 3);
  expect(current.transform.rotation).toBe(63);
  const originalPackage = openPresentationArtifact(original).document.package;
  for (const part of reopened.document.package.parts)
    if (part.name.value !== slide.part)
      expect(reopened.document.package.readPart(part)).toEqual(
        originalPackage.readPart(originalPackage.getPart(part.name)!),
      );
  expect(session.undo().bytes()).toEqual(rotated.bytes());
  expect(session.undo().bytes()).toEqual(original);
  expect(session.redo().bytes()).toEqual(rotated.bytes());
  expect(() =>
    session.updateObject({ ...target, ...resized, rotation: NaN }),
  ).toThrow("finite");
  const ordinary = session.artifact.document.slides[0]!.objects.find(
    (o) => o.movable && o.transform.rotation === 0,
  )!;
  const changed = session.updateObject({
    slideId: slide.id,
    objectKey: ordinary.key,
    ...ordinary.transform,
    rotation: -45,
  });
  expect(
    changed.document.slides[0]!.objects.find((o) => o.key === ordinary.key)!
      .transform.rotation,
  ).toBe(315);
  const moved = session.updateObject({
    slideId: slide.id,
    objectKey: ordinary.key,
    x: ordinary.transform.x + 5,
    y: ordinary.transform.y,
    width: ordinary.transform.width,
    height: ordinary.transform.height,
  });
  expect(
    moved.document.slides[0]!.objects.find((o) => o.key === ordinary.key)!
      .transform.rotation,
  ).toBe(315);
});
