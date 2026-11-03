import { expect, test } from "bun:test";
import {
  createPresentation,
  applyPresentationCommand,
  openPresentationArtifact,
  PresentationEditingSession,
  type GradientFill,
} from "../src/index.ts";

test("shape gradients preserve geometry and text through save, edits, and undo", () => {
  let artifact = createPresentation({ width: 960, height: 540 });
  const slideId = artifact.document.slides[0]!.id;
  artifact = applyPresentationCommand(artifact, {
    name: "insert-object",
    slideId,
    bounds: { x: 50, y: 60, width: 300, height: 150 },
    object: { kind: "shape", geometry: "roundRect", text: "Keep this text", fill: "#abcdef" },
  });
  const before = artifact.document.slides[0]!.objects[0]!;
  const target = { slideId, objectKey: before.key };
  const session = new PresentationEditingSession(artifact);
  const gradient: GradientFill = {
    kind: "gradient",
    type: "linear",
    angle: 45,
    stops: [
      { offset: 1, color: "#ffffff" },
      { offset: 0, color: "#123456", opacity: 0.4 },
    ],
  };
  session.execute({ name: "style-shape", ...target, fill: gradient });
  const read = () =>
    openPresentationArtifact(session.artifact.bytes()).document.slides[0]!.objects[0]!;
  expect(read().gradient).toMatchObject({
    kind: "linear",
    angle: 45,
    stops: [
      { offset: 0, color: "rgba(18,52,86,0.4)" },
      { offset: 1, color: "rgba(255,255,255,1)" },
    ],
  });
  expect(read().transform).toEqual(before.transform);
  expect(read().text?.paragraphs).toEqual(before.text?.paragraphs);
  session.execute({ name: "style-shape", ...target, stroke: "#ff0000" });
  expect(read().gradient?.stops).toHaveLength(2);
  session.execute({
    name: "style-shape",
    ...target,
    fill: { ...gradient, type: "radial", center: [0.25, 0.75] },
  });
  expect(read().gradient).toMatchObject({ kind: "radial", center: [0.25, 0.75] });
  session.undo();
  expect(read().gradient?.kind).toBe("linear");
  session.execute({ name: "style-shape", ...target, fill: "none" });
  expect(read().gradient).toBeUndefined();
  expect(read().fill).toBe("none");
  session.undo();
  session.execute({ name: "style-shape", ...target, fill: "#abcdef" });
  expect(read().gradient).toBeUndefined();
  expect(read().fill).toBe("rgba(171,205,239,1)");
  expect(() =>
    session.execute({
      name: "style-shape",
      ...target,
      fill: { ...gradient, stops: [{ offset: 2, color: "#123456" }] },
    }),
  ).toThrow();
});
