import { expect, test } from "bun:test";
import {
  applyPresentationCommand as run,
  createPresentation,
  openPresentationArtifact,
  slideTextValue,
} from "../src/index.ts";
const encode = (a: ReturnType<typeof createPresentation>) =>
  Buffer.from(a.bytes()).toString("base64");
test("cut and paste between slides retains shape text, geometry, fill and outline", () => {
  let a = createPresentation();
  const sourceSlideId = a.document.slides[0]!.id;
  a = run(a, {
    name: "insert-object",
    slideId: sourceSlideId,
    bounds: { x: 70, y: 80, width: 300, height: 100 },
    object: {
      kind: "shape",
      geometry: "ellipse",
      text: "Keep & preserve",
      fill: "#123456",
      stroke: "#FF0000",
    },
  });
  const object = a.document.slides[0]!.objects[0]!,
    source = encode(a);
  a = run(a, { name: "delete-object", slideId: sourceSlideId, objectKey: object.key });
  a = run(a, { name: "insert-slide", index: 1 });
  const dest = a.document.slides[1]!.id;
  a = run(a, { name: "paste-object", slideId: dest, source, sourceSlideId, objectKey: object.key });
  const result = openPresentationArtifact(a.bytes()).document.slides[1]!.objects[0]!;
  expect(slideTextValue(result)).toBe("Keep & preserve");
  expect(result.transform).toEqual(object.transform);
  expect(result.fill).toBe(object.fill);
  expect(result.stroke).toBe(object.stroke);
  expect(result.geometry).toBe("ellipse");
  expect(a.document.slides[0]!.objects).toHaveLength(0);
});
test("pasting pictures copies original resources without depending on the source deck", () => {
  let a = createPresentation();
  const sourceSlideId = a.document.slides[0]!.id;
  const data =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=";
  a = run(a, {
    name: "insert-object",
    slideId: sourceSlideId,
    bounds: { x: 10, y: 10, width: 100, height: 100 },
    object: { kind: "image", contentType: "image/png", data },
  });
  let destination = createPresentation();
  const dest = destination.document.slides[0]!.id;
  for (let i = 0; i < 2; i++)
    destination = run(destination, {
      name: "paste-object",
      slideId: dest,
      source: encode(a),
      sourceSlideId,
      objectKey: a.document.slides[0]!.objects[0]!.key,
    });
  const objects = openPresentationArtifact(destination.bytes()).document.slides[0]!.objects;
  expect(objects).toHaveLength(2);
  expect(objects[0]!.image!.bytes).toEqual(a.document.slides[0]!.objects[0]!.image!.bytes);
  expect(objects[0]!.key).not.toBe(objects[1]!.key);
});
