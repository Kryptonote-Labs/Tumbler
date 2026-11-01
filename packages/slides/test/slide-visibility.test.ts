import { expect, test } from "bun:test";
import {
  applyPresentationCommand as run,
  createPresentation,
  findVisibleSlideIndex,
  openPresentationArtifact,
  PresentationEditingSession,
  slideTextValue,
} from "../src/index.ts";

test("hiding and unhiding a slide survives PPTX round trips and retains its content", () => {
  let original = createPresentation();
  const slideId = original.document.slides[0]!.id;
  original = run(original, {
    name: "insert-object",
    slideId,
    bounds: { x: 80, y: 100, width: 400, height: 160 },
    object: { kind: "shape", text: "Keep this slide" },
  });
  original = run(original, { name: "insert-slide", index: 1 });
  const hidden = run(original, { name: "set-slide-hidden", slideId, hidden: true });
  const saved = openPresentationArtifact(hidden.bytes());
  expect(saved.document.slides.map((s) => s.hidden)).toEqual([true, false]);
  expect(slideTextValue(saved.document.slides[0]!.objects[0]!)).toBe("Keep this slide");
  expect(findVisibleSlideIndex(saved.document.slides, 0)).toBe(1);
  expect(original.document.slides[0]!.hidden).toBe(false);

  // Only the selected slide part should change.
  for (const part of original.document.package.parts) {
    if (part.name.value === original.document.slides[0]!.part) continue;
    expect(saved.document.package.readPart(saved.document.package.getPart(part.name.value)!))
      .toEqual(original.document.package.readPart(part));
  }

  const visible = openPresentationArtifact(
    run(saved, { name: "set-slide-hidden", slideId, hidden: false }).bytes(),
  );
  expect(visible.document.slides.map((s) => s.hidden)).toEqual([false, false]);
  expect(findVisibleSlideIndex(visible.document.slides, 0)).toBe(0);
  expect(slideTextValue(visible.document.slides[0]!.objects[0]!)).toBe("Keep this slide");
  // Replacing an explicit show="1" should work as well as inserting the attribute.
  expect(run(visible, { name: "set-slide-hidden", slideId, hidden: true })
    .document.slides[0]!.hidden).toBe(true);
});

test("visibility is undoable and a deck may have no visible slides", () => {
  const original = createPresentation();
  const slideId = original.document.slides[0]!.id;
  const session = new PresentationEditingSession(original);
  session.execute({ name: "set-slide-hidden", slideId, hidden: true });
  expect(findVisibleSlideIndex(session.artifact.document.slides, 0)).toBeUndefined();
  expect(session.undo().document.slides[0]!.hidden).toBe(false);
  expect(session.redo().document.slides[0]!.hidden).toBe(true);
  expect(run(session.artifact, { name: "set-slide-hidden", slideId, hidden: true }))
    .toBe(session.artifact);
  expect(() => run(original, { name: "set-slide-hidden", slideId: "missing", hidden: true }))
    .toThrow("Slide not found.");
});
