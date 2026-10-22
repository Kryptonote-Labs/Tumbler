import { expect, test } from "bun:test";
import { chartFont, chartLegendPositions, chartStroke, layoutChartScene, paintChartScene, parseOoxmlChart, type ChartCanvasContext, type ChartMark, type SupportedChartModel } from "../src/index.ts";

function model(overrides: Partial<SupportedChartModel> = {}): SupportedChartModel {
  return {
    status: "supported", kind: "column", grouping: "clustered", holeSize: undefined, title: "Results", legend: { position: "bottom", overlay: false }, axes: [],
    series: [{ index: 0, order: 0, title: "Actual", titleFormula: undefined, fill: { kind: "rgb", value: "#112233" }, line: undefined,
      categories: { kind: "string", formula: undefined, formatCode: undefined, points: [{ index: 0, value: "Jan" }, { index: 1, value: "Feb" }, { index: 2, value: "Mar" }] },
      values: { kind: "number", formula: undefined, formatCode: undefined, points: [{ index: 0, value: 5 }, { index: 1, value: 10 }, { index: 2, value: 20 }] },
    }],
    ...overrides,
  };
}

const flat = (marks: readonly ChartMark[]): ChartMark[] => marks.flatMap(mark => mark.kind === "group" ? flat(mark.marks) : [mark]);
const texts = (marks: readonly ChartMark[]) => flat(marks).flatMap(mark => mark.kind === "text" ? [mark.text] : []);

test("columns draw one bar per value, taller for larger values", () => {
  const scene = layoutChartScene(model(), 600, 400);
  const bars = flat(scene.marks).filter(mark => mark.kind === "rect" && mark.fill === "#112233");
  // Three columns and the legend swatch.
  expect(bars).toHaveLength(4);
  const heights = bars.slice(0, 3).map(bar => bar.kind === "rect" ? bar.height : 0);
  expect(heights[2]).toBeGreaterThan(heights[1]!);
  expect(heights[1]).toBeGreaterThan(heights[0]!);
  expect(texts(scene.marks)).toEqual(["Results", "Jan", "Feb", "Mar", "Actual"]);
  expect(scene.label).toBe("Results");
});

test("pie slices take series categories as legend labels and centre measured rows", () => {
  const scene = layoutChartScene(model({ kind: "pie" }), 600, 400, { measureText: text => text.length * 10 });
  expect(scene.marks.filter(mark => mark.kind === "path")).toHaveLength(3);
  const legend = scene.marks.find(mark => mark.kind === "group" && mark.role === "legend");
  expect(legend?.kind === "group" && legend.marks.map(entry => entry.kind === "group" && entry.role)).toEqual(["legend-entry", "legend-entry", "legend-entry"]);
  const labels = flat(scene.marks).filter(mark => mark.kind === "text" && mark.font.size === 11);
  expect(labels.map(mark => mark.kind === "text" && mark.text)).toEqual(["Jan", "Feb", "Mar"]);
  const swatches = flat(scene.marks).filter(mark => mark.kind === "rect" && mark.width === 10);
  const left = swatches[0]!.kind === "rect" ? swatches[0]!.x : 0;
  const last = labels[2]!.kind === "text" ? labels[2]!.x + 30 : 0;
  expect((left + last) / 2).toBeCloseTo(300);
});

test("scatter series are clipped to the plot, with a rotated value-axis title", () => {
  const scene = layoutChartScene(model({
    kind: "scatter", scatterStyle: "line-marker", legend: undefined,
    axes: [{ id: 1, kind: "value", position: "bottom", title: "X", majorGridlines: false, minimum: undefined, maximum: undefined, deleted: false },
      { id: 2, kind: "value", position: "left", title: "Y", majorGridlines: false, minimum: undefined, maximum: undefined, deleted: false }],
  }), 600, 400);
  const clip = scene.marks.find(mark => mark.kind === "group" && mark.clip !== undefined);
  expect(clip?.kind === "group" && clip.marks.some(mark => mark.kind === "path")).toBe(true);
  expect(scene.marks.find(mark => mark.kind === "text" && mark.text === "Y")).toMatchObject({ rotate: -90 });
});

test("horizontal legends centre the union of measured swatches and unequal labels", () => {
  for (const width of [400, 576, 900]) {
    const widths = [50, 100, 65];
    const positions = chartLegendPositions(widths, { model: model({ title: undefined }), width, height: 336 });
    expect((positions[0]!.x + positions[2]!.x + widths[2]!) / 2).toBeCloseTo(width / 2);
    expect(positions[1]!.x - positions[0]!.x - widths[0]!).toBeGreaterThan(0);
    expect(positions.every(p => p.y === 320)).toBe(true);
  }
});

test("top legends clear the title and side legends retain their authored edge", () => {
  expect(chartLegendPositions([40, 60], { model: model({ legend: { position: "top", overlay: false } }), width: 400, height: 300 })[0]?.y).toBe(48);
  const points = chartLegendPositions([40, 60], { model: model({ legend: { position: "right", overlay: false } }), width: 400, height: 300 });
  expect(points[0]?.x).toBe(332);
  expect(points[1]!.y - points[0]!.y).toBeGreaterThan(11);
});

function authored() {
  const text = `<c:txPr><a:bodyPr/><a:p><a:pPr><a:defRPr sz="900" b="0"><a:solidFill><a:schemeClr val="tx1"><a:lumMod val="65000"/><a:lumOff val="35000"/></a:schemeClr></a:solidFill><a:latin typeface="+mn-lt"/></a:defRPr></a:pPr></a:p></c:txPr>`;
  const xml = `<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><c:chart><c:title>${text.replace('sz="900"', 'sz="1400"')}</c:title><c:plotArea><c:barChart><c:barDir val="col"/></c:barChart><c:valAx><c:axId val="1"/><c:axPos val="l"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr><c:majorGridlines><c:spPr><a:ln w="9525"><a:solidFill><a:schemeClr val="tx1"><a:lumMod val="15000"/><a:lumOff val="85000"/></a:schemeClr></a:solidFill></a:ln></c:spPr></c:majorGridlines>${text}</c:valAx></c:plotArea><c:legend><c:legendPos val="b"/>${text}</c:legend></c:chart></c:chartSpace>`;
  const parsed = parseOoxmlChart(new TextEncoder().encode(xml), "transitional");
  if (parsed.status !== "supported") throw Error("Expected supported chart");
  return { ...parsed, themeColors: { tx1: "#000000" }, themeFonts: { "+mn-lt": "Aptos" } };
}

test("authored chart text resolves to 9pt Aptos, normal weight and 35% luminance", () => {
  const source = authored();
  for (const style of [source.axes[0]?.textStyle, source.legend?.textStyle]) {
    expect(chartFont("tick", style, source)).toEqual({ size: 12, family: '"Aptos", sans-serif', weight: 400, italic: false, color: "#595959" });
  }
  expect(chartFont("title", source.titleStyle, source).size).toBe(14 * 4 / 3);
});

test("text inherits chart defaults and preserves an explicit non-bold override", () => {
  const source = { ...authored(), textStyle: { fontSize: 9, bold: true, italic: true } };
  expect(chartFont("legend", { bold: false }, source)).toMatchObject({ size: 12, weight: 400, italic: true });
});

test("no-fill axes draw nothing while authored gridlines retain colour and width", () => {
  const source = authored();
  expect(chartStroke("axis", source.axes[0]?.lineStyle, source).stroke).toBeUndefined();
  expect(chartStroke("gridline", source.axes[0]?.gridlineStyle, source)).toEqual({ stroke: "#d9d9d9", width: 1 });
  const lines = layoutChartScene(source, 400, 300).marks.flatMap(mark => mark.kind === "line" ? [mark] : []);
  // The unauthored baseline keeps its default stroke; the no-fill value axis is absent.
  const axes = lines.filter(mark => mark.stroke === "#777777");
  expect(axes).toHaveLength(1);
  expect(axes[0]!.y1).toBe(axes[0]!.y2);
  expect(lines.length).toBeGreaterThan(1);
});

test("canvas painting fills marks and draws text at the scene's positions", () => {
  const calls: unknown[][] = [];
  const context = {
    font: "", fillStyle: "" as unknown, strokeStyle: "" as unknown, lineWidth: 1, globalAlpha: 1, textAlign: "start", textBaseline: "alphabetic",
    save: () => {}, restore: () => {}, translate: (x: number, y: number) => calls.push(["translate", x, y]), rotate: () => {}, beginPath: () => {},
    rect: () => {}, arc: () => {}, moveTo: () => {}, lineTo: () => {}, clip: () => {},
    fill: (path?: string) => calls.push(["fill", context.fillStyle, path]),
    stroke: (path?: string) => calls.push(["stroke", context.strokeStyle, path]),
    fillText: (text: string) => calls.push(["fillText", text, context.font, context.textAlign]),
  } satisfies ChartCanvasContext<string>;
  const scene = layoutChartScene(model({ kind: "pie", legend: undefined }), 300, 200);
  paintChartScene(context, scene, d => d);
  expect(calls.filter(call => call[0] === "fill" && typeof call[2] === "string")).toHaveLength(3);
  expect(calls).toContainEqual(["translate", 150, 23]);
  expect(calls).toContainEqual(["fillText", "Results", expect.stringContaining("600 15px"), "center"]);
});

test("browser and offscreen canvases are paint targets", () => {
  // Compile-time consumer compatibility: these assignments fail type checking if the subset drifts.
  const targets: [(context: CanvasRenderingContext2D) => ChartCanvasContext<Path2D>, (context: OffscreenCanvasRenderingContext2D) => ChartCanvasContext<Path2D>] = [context => context, context => context];
  expect(targets).toHaveLength(2);
});

test('visible Cartesian value labels survive missing gridlines and use the host formatter', () => {
  for (const kind of ['column', 'bar', 'line'] as const) {
    const base = model({ kind, legend: undefined, axes: [{ id: 1, kind: 'value', position: 'left', majorGridlines: false, deleted: false, title: undefined, minimum: 0, maximum: 20, numberFormatCode: '0.0' }] });
    const noGrid = layoutChartScene(base, 600, 400, { formatNumber: (value, code) => `${code}:${value}` });
    expect(texts(noGrid.marks).filter(text => text.startsWith('0.0:')).length).toBeGreaterThan(1);
    const grid = layoutChartScene({ ...base, axes: [{ ...base.axes[0]!, majorGridlines: true }] }, 600, 400, { formatNumber: (value, code) => `${code}:${value}` });
    expect(texts(grid.marks)).toEqual(texts(noGrid.marks));
    expect(grid.marks.filter(mark => mark.kind === 'line').length).toBeGreaterThan(noGrid.marks.filter(mark => mark.kind === 'line').length);
    const deleted = layoutChartScene({ ...base, axes: [{ ...base.axes[0]!, majorGridlines: true, deleted: true }] }, 600, 400);
    expect(texts(deleted.marks)).toEqual(['Results', 'Jan', 'Feb', 'Mar']);
    expect(deleted.marks.filter(mark => mark.kind === 'line')).toHaveLength(1);
  }
});

test('deleted XY axes suppress their labels, titles, strokes and gridlines without hiding the other axis', () => {
  const base = model({ kind: 'scatter', legend: undefined, axisIds: [1, 2], axes: [
    { id: 1, kind: 'value', position: 'bottom', title: 'Deleted X', majorGridlines: true, deleted: true, minimum: undefined, maximum: undefined, numberFormatCode: 'X' },
    { id: 2, kind: 'value', position: 'left', title: 'Visible Y', majorGridlines: false, deleted: false, minimum: undefined, maximum: undefined, numberFormatCode: 'Y' },
  ] });
  const scene = layoutChartScene(base, 600, 400, { formatNumber: (value, code) => `${code}:${value}` });
  expect(texts(scene.marks)).not.toContain('Deleted X');
  expect(texts(scene.marks).some(text => text.startsWith('X:'))).toBe(false);
  expect(texts(scene.marks).some(text => text.startsWith('Y:'))).toBe(true);
  expect(scene.marks.filter(mark => mark.kind === 'line')).toHaveLength(1);
});

test('combination value labels and gridlines follow each axis independently', () => {
  const base = model({ legend: undefined, axes: [
    { id: 1, kind: 'category', position: 'bottom', majorGridlines: false, deleted: true, title: undefined, minimum: undefined, maximum: undefined },
    { id: 2, kind: 'value', position: 'left', majorGridlines: false, deleted: false, title: undefined, minimum: undefined, maximum: undefined, numberFormatCode: 'Y' },
  ], axisIds: [1, 2] });
  const combo = { ...base, plots: [base] };
  const scene = layoutChartScene(combo, 600, 400, { formatNumber: (value, code) => `${code}:${value}` });
  expect(texts(scene.marks).some(text => text.startsWith('Y:'))).toBe(true);
  expect(texts(scene.marks)).not.toContain('Jan');
  expect(scene.marks.filter(mark => mark.kind === 'line')).toHaveLength(0);
  const hidden = { ...base, axes: base.axes.map(axis => ({ ...axis, deleted: true, majorGridlines: true })) };
  expect(texts(layoutChartScene({ ...hidden, plots: [hidden] }, 600, 400).marks)).toEqual(['Results']);
});

test('small numeric ticks remain distinct without a host formatter in every chart family', () => {
  const axis = { id: 1, kind: 'value' as const, position: 'left' as const, majorGridlines: false, deleted: false, title: undefined, minimum: 0, maximum: 1e-7, majorUnit: 2e-8 };
  const base = model({ legend: undefined, title: undefined, axes: [axis], axisIds: [1] });
  for (const current of [base, { ...base, plots: [base] }, { ...base, kind: 'scatter' as const, axisIds: [1, 1] }]) {
    const labels = texts(layoutChartScene(current, 600, 400).marks);
    for (const value of ['0', '0.00000002', '0.00000004', '0.00000006', '0.00000008', '0.0000001']) expect(labels).toContain(value);
  }
});

test('automatic XY ticks remove arithmetic noise while retaining tiny intervals', () => {
  for (const kind of ['scatter', 'bubble'] as const) for (const maximum of [0.8, 8e-8]) {
    const base = model({ kind, title: undefined, legend: undefined, axisIds: [1, 2], axes: [
      { id: 1, kind: 'value', position: 'bottom', title: undefined, majorGridlines: false, deleted: false, minimum: 0, maximum },
      { id: 2, kind: 'value', position: 'left', title: undefined, majorGridlines: false, deleted: false, minimum: 0, maximum },
    ] });
    const labels = texts(layoutChartScene(base, 600, 400).marks);
    const expected = maximum === 0.8 ? ['0', '0.2', '0.4', '0.6', '0.8'] : ['0', '0.00000002', '0.00000004', '0.00000006', '0.00000008'];
    expect(labels).toEqual([...expected, ...expected]);
  }
});

test('combination category labels resolve the referenced axis in either declaration order', () => {
  const axes: SupportedChartModel['axes'] = [
    { id: 1, kind: 'category', position: 'bottom', majorGridlines: false, deleted: true, title: undefined, minimum: undefined, maximum: undefined, textStyle: { fontFamily: 'Hidden Axis' } },
    { id: 2, kind: 'value', position: 'right', majorGridlines: false, deleted: false, title: undefined, minimum: 0, maximum: 20 },
    { id: 3, kind: 'category', position: 'bottom', majorGridlines: false, deleted: false, title: undefined, minimum: undefined, maximum: undefined, textStyle: { fontFamily: 'Primary Axis' } },
    { id: 4, kind: 'value', position: 'left', majorGridlines: false, deleted: false, title: undefined, minimum: 0, maximum: 20 },
  ];
  for (const ordered of [axes, [...axes].reverse()]) {
    const primary = model({ axes: ordered, axisIds: [3, 4], legend: undefined });
    const secondary = { ...primary, kind: 'line' as const, axisIds: [1, 2], series: [{ ...primary.series[0]!, index: 1 }] };
    const scene = layoutChartScene({ ...primary, series: [...primary.series, ...secondary.series], plots: [primary, secondary] }, 600, 400);
    const labels = flat(scene.marks).filter(mark => mark.kind === 'text' && ['Jan', 'Feb', 'Mar'].includes(mark.text));
    expect(labels).toHaveLength(3);
    expect(labels.every(mark => mark.kind === 'text' && mark.font.family === 'Primary Axis')).toBe(true);
  }
});
