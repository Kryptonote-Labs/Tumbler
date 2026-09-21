import { expect, test } from "bun:test";
import { parseLosslessXml } from "@tumblerjs/ooxml";
import {
  evaluateGeometry,
  resolveDrawingGeometry,
} from "../src/drawing-geometry.ts";
import { presetGeometries } from "../src/preset-geometries.ts";
import { resolveDrawingColor } from "../src/drawing-color.ts";
import { formatAutoNumber } from "../src/text-numbering.ts";
import { openPresentationDocument } from "../src/index.ts";
const xml = (body: string) =>
  parseLosslessXml(
    new TextEncoder().encode(
      `<a:root xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${body}</a:root>`,
    ),
  );
test("all ECMA presets produce finite paths at wide, tall, and square sizes", () => {
  expect(Object.keys(presetGeometries)).toHaveLength(186);
  for (const definition of Object.values(presetGeometries))
    for (const [w, h] of [
      [320, 180],
      [50, 400],
      [400, 50],
      [100, 100],
    ]) {
      const geometry = evaluateGeometry(definition, w!, h!);
      expect(geometry.paths.length).toBeGreaterThan(0);
      expect(geometry.paths.every((path) => !/NaN|Infinity/.test(path.d))).toBe(
        true,
      );
      expect(geometry.textRect.every(Number.isFinite)).toBe(true);
    }
});
test("authored adjustments change preset paths and custom paths use their own coordinate space", () => {
  const adjusted = xml(
    '<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 40000"/></a:avLst></a:prstGeom>',
  ).elements(
    "http://schemas.openxmlformats.org/drawingml/2006/main",
    "prstGeom",
  )[0]!;
  expect(
    resolveDrawingGeometry("roundRect", adjusted, 100, 100)?.paths,
  ).not.toEqual(
    resolveDrawingGeometry("roundRect", undefined, 100, 100)?.paths,
  );
  const custom = xml(
    '<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="w" b="h"/><a:pathLst><a:path w="10" h="10"><a:moveTo><a:pt x="0" y="0"/></a:moveTo><a:lnTo><a:pt x="10" y="10"/></a:lnTo></a:path></a:pathLst></a:custGeom>',
  ).elements(
    "http://schemas.openxmlformats.org/drawingml/2006/main",
    "custGeom",
  )[0]!;
  expect(resolveDrawingGeometry("", custom, 200, 100)?.paths[0]?.d).toBe(
    "M 0 0 L 200 100",
  );
  expect(() =>
    evaluateGeometry(
      {
        adjustments: [],
        guides: [["bad", "val Infinity"]],
        rect: ["0", "0", "w", "h"],
        paths: [],
      },
      100,
      100,
    ),
  ).toThrow();
});
const color = (body: string) =>
  resolveDrawingColor(
    xml(body).elements(
      "http://schemas.openxmlformats.org/drawingml/2006/main",
      "root",
    )[0],
    () => "#FF0000",
  );
test("theme colours apply ordered HSL and alpha transforms", () => {
  expect(
    color('<a:schemeClr val="accent1"><a:lumMod val="50000"/></a:schemeClr>'),
  ).toBe("rgba(128,0,0,1)");
  expect(color('<a:hslClr hue="7200000" sat="100000" lum="50000"/>')).toBe(
    "rgba(0,255,0,1)",
  );
  expect(
    color(
      '<a:srgbClr val="FF0000"><a:alpha val="50000"/><a:alphaMod val="50000"/></a:srgbClr>',
    ),
  ).toBe("rgba(255,0,0,0.25)");
});
test("numbering carries alphabetic and roman values", () => {
  expect(formatAutoNumber(27, "alphaLcParenBoth")).toBe("(aa)");
  expect(formatAutoNumber(14, "romanUcPeriod")).toBe("XIV.");
});
test("standards deck resolves table styles, notes, gradients, and links without fallback", async () => {
  const document = openPresentationDocument(
    new Uint8Array(
      await Bun.file(
        new URL(
          "../../../apps/docs/static/samples/standards-features.pptx",
          import.meta.url,
        ),
      ).arrayBuffer(),
    ),
  );
  expect(document.slides.flatMap((slide) => slide.diagnostics)).toEqual([]);
  expect(
    document.slides[0]!.objects.some(
      (object) => object.gradient?.stops.length === 2,
    ),
  ).toBe(true);
  expect(document.slides[0]!.notes).toContain("ECMA");
  const runs = document.slides[1]!.objects.flatMap(
    (object) => object.text?.paragraphs.flatMap((p) => p.runs) ?? [],
  );
  expect(
    runs.some((run) => run.hyperlink?.slidePart === "/ppt/slides/slide1.xml"),
  ).toBe(true);
  expect(
    runs.some((run) => run.hyperlink?.href?.startsWith("https://ecma")),
  ).toBe(true);
  expect(runs.some((run) => !!run.baseline)).toBe(true);
  const table = document.slides[2]!.objects.find(
    (object) => object.table,
  )?.table!;
  expect(table.cells).toHaveLength(12);
  expect(table.cells[0]!.text!.paragraphs[0]!.runs[0]!.bold).toBe(true);
  expect(table.cells[0]!.fill).not.toBe(table.cells[3]!.fill);
  expect(table.cells[3]!.fill).not.toBe(table.cells[6]!.fill);
});
