import { expect, test } from "bun:test";
import {
  createOoxmlChart,
  parseOoxmlChart,
  layoutChartScene,
  type ChartMark,
} from "../src/index.ts";
import { chartMarksBounds } from "../src/shape-scene.ts";
const measure = (text: string) => text.length * 8;
const flat = (marks: readonly ChartMark[]): ChartMark[] =>
  marks.flatMap((mark) => (mark.kind === "group" ? flat(mark.marks) : [mark]));
function chart(rotation: number, type: "barChart" | "scatterChart" = "barChart") {
  const source = new TextDecoder().decode(
    createOoxmlChart({
      type,
      categories: ["Jan", "Feb", "Mar"],
      series: [
        {
          name: "Revenue",
          values: [10000, 30000, 50000],
          ...(type === "scatterChart" ? { xValues: [1, 2, 3] } : {}),
        },
      ],
    }),
  );
  const properties = `<c:txPr><a:bodyPr rot="${rotation * 60000}"/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1000"/></a:pPr></a:p></c:txPr>`;
  const xml = source.replace(
    /(<c:valAx>[\s\S]*?)(<c:crossAx)/g,
    (_match, before: string, after: string) => before + properties + after,
  );
  const model = parseOoxmlChart(new TextEncoder().encode(xml), "transitional");
  if (model.status !== "supported") throw new Error(model.reason);
  return model;
}
function labels(rotation: number, type: "barChart" | "scatterChart" = "barChart") {
  return flat(
    layoutChartScene(chart(rotation, type), 480, 320, {
      measureText: measure,
      formatNumber: String,
    }).marks,
  ).filter(
    (mark): mark is Extract<ChartMark, { kind: "text" }> =>
      mark.kind === "text" && /^\d+$/.test(mark.text),
  );
}

test("numeric axes paint the source text rotation while retaining tick centering and label-side alignment", () => {
  for (const rotation of [-45, 45, 90]) {
    const current = labels(rotation),
      unrotated = labels(0);
    expect(current.length).toBeGreaterThan(0);
    for (const mark of current) {
      expect(mark.rotate).toBe(rotation);
      const box = chartMarksBounds({ measure }, [mark])!;
      expect(box.x).toBeGreaterThanOrEqual(4 - 1e-6);
      expect(box.y).toBeGreaterThanOrEqual(4 - 1e-6);
      expect(box.y + box.height).toBeLessThanOrEqual(316 + 1e-6);
    }
    expect(current.map((mark) => mark.text)).toEqual(unrotated.map((mark) => mark.text));
  }
});

test("both XY value axes retain their own authored rotation", () => {
  for (const rotation of [-45, 45, 90]) {
    const current = labels(rotation, "scatterChart");
    expect(current.length).toBeGreaterThan(0);
    expect(current.every((mark) => mark.rotate === rotation)).toBe(true);
  }
});

test("rotating a label retains the axis-side edge and tick centre on the authored manual plot", () => {
  const original = chart(0),
    rotated = chart(45);
  const plotLayout = {
    target: "inner" as const,
    xMode: "edge" as const,
    x: 0.2,
    yMode: "edge" as const,
    y: 0.1,
    widthMode: "factor" as const,
    width: 0.7,
    heightMode: "factor" as const,
    height: 0.75,
  };
  const marks = (model: typeof original) =>
    flat(
      layoutChartScene({ ...model, plotLayout }, 480, 320, {
        measureText: measure,
        formatNumber: String,
      }).marks,
    ).filter(
      (mark): mark is Extract<ChartMark, { kind: "text" }> =>
        mark.kind === "text" && /^\d+$/.test(mark.text),
    );
  const before = marks(original),
    after = marks(rotated);
  for (const [i, mark] of after.entries()) {
    const a = chartMarksBounds({ measure }, [mark])!,
      b = chartMarksBounds({ measure }, [before[i]!])!;
    expect(a.x + a.width).toBeCloseTo(b.x + b.width);
    expect(a.y + a.height / 2).toBeCloseTo(b.y + b.height / 2);
  }
});

test("rotated horizontal-bar value labels fit above and below the automatic plot", () => {
  const original = chart(90);
  for (const position of ["low", "high"] as const) {
    const model = {
      ...original,
      kind: "bar" as const,
      axes: original.axes.map((axis) =>
        axis.kind === "value"
          ? { ...axis, position: "bottom" as const, tickLabelPosition: position }
          : axis,
      ),
    };
    const numeric = flat(
      layoutChartScene(model, 480, 320, { measureText: measure, formatNumber: String }).marks,
    ).filter(
      (mark): mark is Extract<ChartMark, { kind: "text" }> =>
        mark.kind === "text" && /^\d+$/.test(mark.text),
    );
    expect(numeric.length).toBeGreaterThan(0);
    for (const mark of numeric) {
      const box = chartMarksBounds({ measure }, [mark])!;
      expect(box.x).toBeGreaterThanOrEqual(4 - 1e-6);
      expect(box.y).toBeGreaterThanOrEqual(4 - 1e-6);
      expect(box.x + box.width).toBeLessThanOrEqual(476 + 1e-6);
      expect(box.y + box.height).toBeLessThanOrEqual(316 + 1e-6);
    }
  }
});
