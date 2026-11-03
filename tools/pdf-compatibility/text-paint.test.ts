import { expect, test } from "bun:test";
import { createCanvas } from "@napi-rs/canvas";
import { openPdfDocument, PdfInterpreter, paintPdfPage } from "../../packages/pdf/src/index.ts";
import { extractionFixture } from "../../packages/pdf/test/extraction-fixture.ts";
import { nativePdfHost } from "./native-paint.ts";
import { comparePrecision, type OraclePage } from "./precision.ts";

test("blank output and wrong visible glyphs fail even when their scene metadata is unchanged", async () => {
  const document = openPdfDocument(await extractionFixture()),
    scene = new PdfInterpreter(document).page(0);
  const canvas = createCanvas(100, 100),
    host = nativePdfHost();
  await paintPdfPage(canvas.getContext("2d"), scene, document.source, host, { scale: 1 });
  const reference = canvas.toBuffer("image/png");
  const oracle: OraclePage = {
    width: 100,
    height: 100,
    text: "e",
    image: "",
    objects: [],
    boxes: [[9, 7, 62, 65]],
    characters: [
      { code: 101, generated: false, origin: [10, 10], fontSize: 70, matrix: [1, 0, 0, 1, 0, 0] },
    ],
  };
  expect((await comparePrecision(reference, reference, scene, oracle)).passed).toBe(true);
  canvas.getContext("2d").fillStyle = "white";
  canvas.getContext("2d").fillRect(0, 0, 100, 100);
  const blank = await comparePrecision(canvas.toBuffer("image/png"), reference, scene, oracle);
  expect(blank.passed).toBe(false);
  expect(blank.textPaint?.errors.length).toBeGreaterThan(0);
  const wrong = {
    ...scene,
    elements: scene.elements.map((element) =>
      element.kind === "glyph"
        ? {
            ...element,
            glyph: { ...element.glyph, path: element.font.decode(Uint8Array.of(101))[0]!.path },
          }
        : element,
    ),
  };
  await paintPdfPage(canvas.getContext("2d"), wrong, document.source, host, { scale: 1 });
  const changed = await comparePrecision(canvas.toBuffer("image/png"), reference, scene, oracle);
  expect(changed.geometry.errors).toEqual([]);
  expect(changed.passed).toBe(false);
  expect(changed.textPaint?.errors.length).toBeGreaterThan(0);
});
