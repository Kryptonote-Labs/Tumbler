import { expect, test } from "bun:test";
import { openPdfDocument } from "../src/document.ts";
import { PdfInterpreter } from "../src/interpreter.ts";
import { rectangleCoverage } from "../src/rectangle-coverage.ts";
import { identity } from "../src/matrix.ts";
import type { PdfPathElement } from "../src/scene.ts";

async function rectangle() {
  const document = openPdfDocument(
    new Uint8Array(
      await Bun.file(new URL("./fixtures/split-content-state.pdf", import.meta.url)).arrayBuffer(),
    ),
  );
  const element = new PdfInterpreter(document)
    .page(0)
    .elements.find((element) => element.kind === "path");
  if (!element || element.kind !== "path") throw new Error("Fixture has no filled path.");
  return element;
}
function path(
  element: PdfPathElement,
  points: readonly (readonly [number, number])[],
): PdfPathElement {
  return {
    ...element,
    state: { ...element.state, transform: identity },
    path: points.map(([x, y], index) => ({ kind: index ? "line" : "move", x, y })),
  };
}
test("thin table rules cover a device pixel while thicker rules retain their rounded width", async () => {
  const element = await rectangle();
  expect(
    rectangleCoverage(
      path(element, [
        [169.62, 10],
        [170.1, 10],
        [170.1, 50],
        [169.62, 50],
      ]),
      identity,
    ),
  ).toEqual([169, 10, 1, 40]);
  expect(
    rectangleCoverage(
      path(element, [
        [10, 100.14],
        [50, 100.14],
        [50, 102.12],
        [10, 102.12],
      ]),
      identity,
    ),
  ).toEqual([10, 100, 40, 2]);
  expect(
    rectangleCoverage(
      path(element, [
        [0, 0],
        [0, 1],
        [0, 0],
        [1, 0],
      ]),
      identity,
    ),
  ).toBeUndefined();
});
