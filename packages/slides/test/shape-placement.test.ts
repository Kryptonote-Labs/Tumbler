import { expect, test } from "bun:test";
import {
  createPresentation,
  openPresentationArtifact,
  placedShapeCommand,
  PresentationArtifact,
  PresentationEditingSession,
  shapeMatrix,
  shapePlacement,
  transformPoint,
} from "../src/index.ts";

const frame = { width: 1280, height: 720 };

test("shape drags normalize opposite corners and constrain dimensions within the slide", () => {
  expect(shapePlacement({ x: 400, y: 300 }, { x: 100, y: 100 }, "rect", false, frame)).toEqual({
    bounds: { x: 100, y: 100, width: 300, height: 200 },
    rotation: 0,
  });
  expect(
    shapePlacement({ x: 1200, y: 650 }, { x: 1280, y: 700 }, "ellipse", true, frame).bounds,
  ).toEqual({ x: 1200, y: 650, width: 70, height: 70 });
  expect(
    shapePlacement({ x: 100, y: 100 }, { x: 20, y: 70 }, "triangle", true, frame).bounds,
  ).toEqual({ x: 20, y: 20, width: 80, height: 80 });
});

for (const end of [
  { x: 300, y: 0 },
  { x: 100, y: 0 },
  { x: 300, y: 100 },
  { x: 0, y: 300 },
]) {
  test(`placed line endpoints round-trip to ${end.x},${end.y} in one undoable edit`, () => {
    const original = createPresentation(),
      slideId = original.document.slides[0]!.id;
    const before = original.bytes();
    const placement = shapePlacement({ x: 100, y: 100 }, end, "line", false, frame);
    const { command, objectKey } = placedShapeCommand(original, slideId, "line", placement);
    expect(original.bytes()).toEqual(before);
    expect(original.document.slides[0]!.objects).toHaveLength(0);
    const session = new PresentationEditingSession(original);
    session.execute(command);
    const object = openPresentationArtifact(session.artifact.bytes()).document.slides[0]!
      .objects[0]!;
    expect(object.key).toBe(objectKey);
    const matrix = shapeMatrix(object.transform);
    const start = transformPoint(matrix, 0, 0),
      finish = transformPoint(matrix, object.transform.width, 0);
    expect(start.x).toBeCloseTo(100);
    expect(start.y).toBeCloseTo(100);
    expect(finish.x).toBeCloseTo(end.x);
    expect(finish.y).toBeCloseTo(end.y);
    session.undo();
    expect(session.artifact.document.slides[0]!.objects).toHaveLength(0);
    session.redo();
    expect(session.artifact.document.slides[0]!.objects).toHaveLength(1);
  });
}

test("constrained lines snap to 45 degrees and keep their endpoints inside the slide", () => {
  const line = shapePlacement({ x: 1200, y: 650 }, { x: 1280, y: 720 }, "line", true, frame);
  expect(line.rotation).toBeCloseTo(45);
  const matrix = shapeMatrix({
    ...line.bounds,
    rotation: line.rotation,
    flipH: false,
    flipV: false,
  });
  const end = transformPoint(matrix, line.bounds.width, 0);
  expect(end.x).toBeCloseTo(1270);
  expect(end.y).toBeCloseTo(720);
});

test("shape commands select the engine-assigned object identity and preserve invalid-document errors", () => {
  const original = createPresentation(),
    slideId = original.document.slides[0]!.id;
  const placement = shapePlacement({ x: 30, y: 40 }, { x: 330, y: 240 }, "roundRect", false, frame);
  const { command, objectKey } = placedShapeCommand(original, slideId, "roundRect", placement);
  const session = new PresentationEditingSession(original);
  session.execute(command);
  const shape = session.artifact.document.slides[0]!.objects[0]!;
  expect(shape.key).toBe(objectKey);
  expect(shape.transform).toMatchObject({ x: 30, y: 40, width: 300, height: 200 });
  const signed = new PresentationArtifact({ ...original.document, signed: true });
  expect(() => placedShapeCommand(signed, slideId, "rect", placement)).toThrow(
    "Signed presentations are read-only.",
  );
  expect(() => placedShapeCommand(original, "missing", "rect", placement)).toThrow();
});
