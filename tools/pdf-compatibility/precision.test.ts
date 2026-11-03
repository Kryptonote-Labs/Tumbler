import { expect, test } from "bun:test";
import { openPdfDocument, PdfInterpreter } from "../../packages/pdf/src/index.ts";
import { compareTextGeometry, type OraclePage } from "./precision.ts";
import { comparePrimitives } from "./primitive-geometry.ts";

async function scene(name: string) {
  return new PdfInterpreter(
    openPdfDocument(
      new Uint8Array(
        await Bun.file(
          new URL(`../../packages/pdf/test/fixtures/${name}.pdf`, import.meta.url),
        ).arrayBuffer(),
      ),
    ),
  ).page(0);
}
const empty: OraclePage = {
  width: 240,
  height: 160,
  text: "",
  boxes: [],
  characters: [],
  objects: [],
  image: "",
};

test("font raster exclusion cannot hide moved or missing text", async () => {
  const page = await scene("basic-text");
  const characters = page.elements.flatMap((element) =>
    element.kind === "glyph"
      ? [
          {
            code: element.glyph.unicode.charCodeAt(0),
            generated: false,
            origin: [element.state.transform[4], element.state.transform[5]] as const,
            fontSize: 14,
            matrix: [1, 0, 0, 1, 0, 0] as const,
          },
        ]
      : [],
  );
  const oracle = { ...empty, characters };
  expect(compareTextGeometry(page, oracle).errors).toEqual([]);
  const shifted = {
    ...page,
    elements: page.elements.map((element) => ({
      ...element,
      state: {
        ...element.state,
        transform: [
          ...element.state.transform.slice(0, 4),
          element.state.transform[4] + 1,
          element.state.transform[5],
        ] as [number, number, number, number, number, number],
      },
    })),
  };
  expect(compareTextGeometry(shifted, oracle).errors.length).toBeGreaterThan(0);
  expect(compareTextGeometry({ ...page, elements: [] }, oracle).errors.length).toBeGreaterThan(0);
});
test("missing small objects cannot pass through the whole-page pixel allowance", async () => {
  const page = await scene("split-content-state");
  const oracle = {
    ...empty,
    objects: [{ kind: "path" as const, bounds: [20, 20, 90, 70] as const }],
  };
  expect(comparePrimitives(page, oracle)).toEqual([]);
  expect(comparePrimitives({ ...page, elements: [] }, oracle)).toContain("Missing path object.");
});
