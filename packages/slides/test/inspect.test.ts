import { expect, test } from "bun:test";
import { applyPresentationCommand, createPresentation, inspectPresentation } from "../src/index.ts";

test("inspection identifies an empty second slide without substituting the populated first slide", () => {
  let deck = createPresentation();
  const first = deck.document.slides[0]!.id;
  deck = applyPresentationCommand(deck, {
    name: "insert-object", slideId: first,
    bounds: { x: 10, y: 20, width: 300, height: 100 },
    object: { kind: "shape", text: "First slide content" },
  });
  deck = applyPresentationCommand(deck, { name: "insert-slide", index: 1 });
  const second = deck.document.slides[1]!.id;
  const read = inspectPresentation(deck, second);
  expect(read.slide).toMatchObject({ id: second, number: 2, empty: true, objectCount: 0, objects: [] });
  expect(read.slides).toMatchObject([
    { id: first, number: 1, empty: false, objectCount: 1 },
    { id: second, number: 2, empty: true, objectCount: 0 },
  ]);
  expect(() => inspectPresentation(deck, "2")).toThrow("Slide not found");
  expect(inspectPresentation(deck).slide.id).toBe(first);
});

test("background-only slides are empty, but a shape with no text is still content", () => {
  let deck = createPresentation();
  const slideId = deck.document.slides[0]!.id;
  deck = applyPresentationCommand(deck, { name: "background", slideId, color: "#fedcba" });
  expect(inspectPresentation(deck).slide.empty).toBe(true);
  deck = applyPresentationCommand(deck, {
    name: "insert-object", slideId,
    bounds: { x: 10, y: 20, width: 300, height: 100 }, object: { kind: "shape", geometry: "rect" },
  });
  expect(inspectPresentation(deck).slide).toMatchObject({ empty: false, objectCount: 1 });
});
