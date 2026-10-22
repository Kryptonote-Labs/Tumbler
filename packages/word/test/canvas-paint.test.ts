import { expect, test } from "bun:test";
import type { SupportedChartModel } from "@tumblerjs/charts";
import { PartName } from "@tumblerjs/opc";
import { createWordArtifact, layoutWordDocument, openWordArtifact, paintWordPage, wordPageImages, wordShapePath, type WordCanvasContext, type WordContentBlock, type WordDrawing, type WordImageDrawing, type WordLayoutPage } from "../src/index.ts";

const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=", "base64"));
const measure = { measure: (text: string) => ({ width: text.length * 6, ascent: 9, descent: 3 }) };

type Call = readonly [string, ...unknown[]];
/** Records drawing calls together with the state they were made in. */
function recorder() {
  const calls: Call[] = [];
  const context = {
    font: "", fillStyle: "" as unknown, strokeStyle: "" as unknown, lineWidth: 1, globalAlpha: 1, textAlign: "start", textBaseline: "alphabetic", direction: "inherit", letterSpacing: "0px",
    save: () => {}, restore: () => {}, beginPath: () => {}, rect: (x: number, y: number, width: number, height: number) => calls.push(['rect', x, y, width, height]), clip: () => {}, moveTo: () => {}, setLineDash: () => {}, rotate: () => {}, arc: () => {},
    measureText: (text: string) => ({ width: text.length * 6 }),
    scale: (x: number, y: number) => calls.push(["scale", x, y]),
    translate: (x: number, y: number) => calls.push(["translate", x, y]),
    lineTo: (x: number, y: number) => calls.push(["lineTo", x, y]),
    fill: (path?: string) => calls.push(["fill", context.fillStyle, path]),
    stroke: (path?: string) => calls.push(["stroke", context.strokeStyle, path]),
    fillRect: (x: number, y: number, width: number, height: number) => calls.push(["fillRect", context.fillStyle, x, y, width, height]),
    fillText: (text: string, x: number, y: number) => calls.push(["fillText", text, x, y, context.font, context.fillStyle]),
    drawImage: (image: string, x: number, y: number, width: number, height: number) => calls.push(["drawImage", image, x, y, width, height]),
  } satisfies WordCanvasContext<string, string>;
  return { context, calls };
}

function layout(blocks: WordContentBlock[]) {
  const artifact = openWordArtifact(createWordArtifact({ blocks }).bytes());
  return layoutWordDocument(artifact.document, measure).pages[0]!;
}

test("paints text, list markers and formatting at the layout's baselines", () => {
  const page = layout([
    { kind: "paragraph", runs: [{ text: "Plain " }, { text: "bold", format: { bold: true, color: "#AA0000", highlight: "yellow" } }] },
    { kind: "paragraph", runs: [{ text: "Item" }], list: { id: "steps", kind: "decimal" } },
  ]);
  const { context, calls } = recorder();
  paintWordPage(context, page, { scale: 0.5 });
  expect(calls[0]).toEqual(["scale", 0.5, 0.5]);
  expect(calls).toContainEqual(["fillRect", "#ffffff", 0, 0, page.width, page.height]);
  const texts = calls.filter(call => call[0] === "fillText");
  expect(texts.map(call => call[1])).toEqual(["Plain ", "bold", "1.", "Item"]);
  const bold = page.columns[0]!.lines[0]!.fragments[1]!;
  expect(texts[1]!.slice(2)).toEqual([bold.x, bold.baseline, expect.stringContaining(" 700 "), "#AA0000"]);
  expect(calls).toContainEqual(["fillRect", "#FFFF00", bold.x, bold.y, bold.width, bold.height]);
});

test("paints decoded images and falls back to placeholders without a source", () => {
  const page = layout([{ kind: "image", bytes: png, contentType: "image/png", width: 80, height: 40 }]);
  const fragment = page.columns[0]!.lines.flatMap(line => line.fragments).find(item => item.kind === "drawing")!;
  expect(wordPageImages(page)).toEqual([fragment.drawing as WordImageDrawing]);
  const decoded = recorder();
  paintWordPage(decoded.context, page, { image: drawing => drawing.contentType });
  expect(decoded.calls).toContainEqual(["drawImage", "image/png", fragment.x, fragment.y, fragment.width, fragment.height]);
  const missing = recorder();
  paintWordPage(missing.context, page);
  expect(missing.calls.some(call => call[0] === "drawImage")).toBe(false);
  expect(missing.calls).toContainEqual(["fillRect", expect.any(String), fragment.x, fragment.y, fragment.width, fragment.height]);
});

test("paints table cell text and resolved borders", () => {
  const page = layout([{ kind: "table", rows: [[{ blocks: [{ kind: "paragraph", runs: [{ text: "A" }] }] }, { blocks: [{ kind: "paragraph", runs: [{ text: "B" }] }] }]] }]);
  const { context, calls } = recorder();
  paintWordPage(context, page);
  expect(calls.filter(call => call[0] === "fillText").map(call => call[1])).toEqual(["A", "B"]);
  expect(calls.filter(call => call[0] === "stroke")).toHaveLength(page.columns[0]!.tables[0]!.borders?.length ?? 0);
});

test("paints shapes from their outline path, with their text", () => {
  const shape = { preset: "ellipse", width: 120, height: 60, fill: "#336699", outline: "#000000", outlineWidth: 1, text: "Hello" } as const;
  const page = layout([{ kind: "paragraph", runs: [{ text: "\uFFFC", shape }] }]);
  const fragment = drawingFragment(page);
  const { context, calls } = recorder();
  paintWordPage(context, page, { path: d => d });
  expect(calls).toContainEqual(["fill", "#336699", wordShapePath(shape)]);
  expect(calls).toContainEqual(["stroke", "#000000", wordShapePath(shape)]);
  expect(calls).toContainEqual(["fillText", "Hello", expect.any(Number), expect.any(Number), expect.stringContaining("Aptos"), "#000000"]);
  const placeholder = recorder();
  paintWordPage(placeholder.context, page);
  expect(placeholder.calls.some(call => call[0] === "fill")).toBe(false);
  expect(placeholder.calls).toContainEqual(["fillRect", expect.any(String), fragment.x, fragment.y, fragment.width, fragment.height]);
});

test("shape text keeps its rich run formatting and alignment", () => {
  const paint = (alignment: "start" | "center" | "end") => {
    const textBody = [{ alignment, runs: [{ text: "Bold", format: { bold: true, color: "#FFFFFF", fontSizePoints: 18 } }, { text: " plain" }] }];
    const shape = { preset: "rect", width: 200, height: 80, fill: "#001F5B", outline: "none", outlineWidth: 0, textBody, textAnchor: "top" } as const;
    const { context, calls } = recorder();
    paintWordPage(context, layout([{ kind: "paragraph", runs: [{ text: "\uFFFC", shape }] }]), { path: d => d });
    return calls.filter(call => call[0] === "fillText");
  };
  const centred = paint("center");
  expect(centred.map(call => call[1])).toEqual(["Bold", " plain"]);
  expect(centred[0]!.slice(4)).toEqual([expect.stringMatching(/ 700 18px .*Aptos/), "#FFFFFF"]);
  expect(centred[1]!.slice(4)).toEqual([expect.stringMatching(/ 400 12px .*Aptos/), "#000000"]);
  const start = paint("start")[0]![2] as number, end = paint("end")[0]![2] as number;
  expect(end).toBeGreaterThan(start);
  expect(centred[0]![2]).toBeCloseTo((start + end) / 2);
});

test('shape text paints and clips within its own asymmetric insets', () => {
  const shape = { preset: 'rect', width: 100, height: 60, fill: 'none', outline: 'none', outlineWidth: 0, text: 'Label', textAnchor: 'top', textInsets: { top: 0, right: 2, bottom: 8, left: -4 } } as const;
  const { context, calls } = recorder();
  paintWordPage(context, layout([{ kind: 'paragraph', runs: [{ text: '\uFFFC', shape }] }]), { path: d => d, measurer: measure });
  expect(calls).toContainEqual(['rect', -4, 0, 102, 52]);
  expect(calls).toContainEqual(['translate', -4, 0]);
  expect(calls.some(call => call[0] === 'fillText' && call[1] === 'Label')).toBe(true);
});

test("paints charts in CSS pixels within their frame", () => {
  const shaped = layout([{ kind: "paragraph", runs: [{ text: "\uFFFC", shape: { preset: "rect", width: 300, height: 150, fill: "none", outline: "#000000", outlineWidth: 1 } }] }]);
  const shape = drawingFragment(shaped);
  const model: SupportedChartModel = { status: "supported", kind: "pie", grouping: "standard", holeSize: undefined, title: "Share", legend: undefined, axes: [], series: [{
    index: 0, order: 0, title: undefined, titleFormula: undefined, fill: undefined, line: undefined, categories: undefined,
    values: { kind: "number", formula: undefined, formatCode: undefined, points: [{ index: 0, value: 1 }, { index: 1, value: 2 }] },
  }] };
  const chart: WordDrawing = { ...shape.drawing!, kind: "chart", relationshipId: "rId1", partName: PartName.parse("/word/charts/chart1.xml"), model };
  const page = replaceDrawing(shaped, chart);
  const { context, calls } = recorder();
  paintWordPage(context, page, { path: d => d });
  expect(calls).toContainEqual(["translate", shape.x, shape.y]);
  expect(calls).toContainEqual(["scale", 0.75, 0.75]);
  expect(calls.filter(call => call[0] === "fill" && typeof call[2] === "string")).toHaveLength(2);
  expect(calls.some(call => call[0] === "fillText" && call[1] === "Share")).toBe(true);
});

function drawingFragment(page: WordLayoutPage) {
  return page.columns[0]!.lines.flatMap(line => line.fragments).find(item => item.kind === "drawing")!;
}

function replaceDrawing(page: WordLayoutPage, drawing: WordDrawing): WordLayoutPage {
  const [column, ...rest] = page.columns;
  const lines = column!.lines.map(line => ({ ...line, fragments: line.fragments.map(fragment => fragment.kind === "drawing" ? { ...fragment, drawing } : fragment) }));
  return { ...page, columns: [{ ...column!, lines }, ...rest] };
}

test("browser and offscreen canvases are paint targets", () => {
  // Compile-time consumer compatibility: these assignments fail type checking if the subset drifts.
  const targets: [(context: CanvasRenderingContext2D) => WordCanvasContext<CanvasImageSource, Path2D>, (context: OffscreenCanvasRenderingContext2D) => WordCanvasContext<CanvasImageSource, Path2D>] = [context => context, context => context];
  expect(targets).toHaveLength(2);
});

test('paints run shading behind text and gives highlighting precedence', () => {
  const page = layout([{ kind: 'paragraph', runs: [
    { text: 'Shaded', format: { shading: '#4C94D8' } },
    { text: 'Highlighted', format: { shading: '#4C94D8', highlight: 'yellow' } },
  ] }]);
  const { context, calls } = recorder();
  paintWordPage(context, page);
  const [shaded, highlighted] = page.columns[0]!.lines[0]!.fragments;
  expect(calls).toContainEqual(['fillRect', '#4C94D8', shaded!.x, shaded!.y, shaded!.width, shaded!.height]);
  expect(calls).toContainEqual(['fillRect', '#FFFF00', highlighted!.x, highlighted!.y, highlighted!.width, highlighted!.height]);
});

test.each([1, 4 / 3, 2, .55 * 4 / 3, 2.3])('native ink composes with browser and server page pixels at scale %s', async scale => {
  for (const colorSpace of ['srgb', undefined] as const) {
  const { inkFixture } = await import('./ink-fixture.ts');
  const { officeInk } = await import('../../ink/test/fixture.ts');
  const { source } = inkFixture(false, false, officeInk({ brush: '<brushProperty name="width" value="0.1" units="cm"/><brushProperty name="height" value="0.1" units="cm"/><brushProperty name="rasterOp" value="xOrPen"/><brushProperty name="color" value="#ffffff"/>' }));
  const page = layoutWordDocument(source.document, measure).pages[0]!;
  const { context, calls } = recorder();
  let writes = 0;
  const pixelContext = {
    ...context,
    getImageData: (_x: number, _y: number, width: number, height: number) => ({ width, height, ...(colorSpace === undefined ? {} : { colorSpace }), data: new Uint8ClampedArray(width * height * 4).map((_, index) => index % 4 === 3 ? 255 : 85) }),
    putImageData: (pixels: { data: Uint8ClampedArray }) => {
      writes++;
      expect(pixels.data.some((value, index) => index % 4 !== 3 && value === 170)).toBe(true);
      expect(pixels.data.some((value, index) => index % 4 !== 3 && value === 85)).toBe(true);
    },
  };
  paintWordPage(pixelContext, page, { scale, image: () => 'cached-bitmap' });
  expect(writes).toBe(1);
  expect(calls.some(call => call[0] === 'drawImage')).toBe(false);
  }
});

test('floating drawings paint behind or in front of text independently of their run order', () => {
  for (const placement of ['front', 'behind'] as const) {
    const page = layout([{ kind: 'paragraph', runs: [{ text: '\ufffc', image: { bytes: png, contentType: 'image/png', width: 20, height: 20, layout: placement, x: 0, y: 0 } }, { text: 'Backdrop' }] }]);
    const { context, calls } = recorder();
    paintWordPage(context, page, { image: () => 'image' });
    const imageIndex = calls.findIndex(call => call[0] === 'drawImage');
    const textIndex = calls.findIndex(call => call[0] === 'fillText' && call[1] === 'Backdrop');
    expect(imageIndex).toBeGreaterThan(-1); expect(textIndex).toBeGreaterThan(-1);
    expect(imageIndex > textIndex).toBe(placement === 'front');
  }
});

test('DOM composition bounds include physical ink outside its editing frame', async () => {
  const { inkFixture } = await import('./ink-fixture.ts');
  const { officeInk } = await import('../../ink/test/fixture.ts');
  const { wordPageInkBounds } = await import('../src/canvas-paint.ts');
  const { source } = inkFixture(false, false, officeInk({ brush: '<brushProperty name="width" value="0.1" units="cm"/><brushProperty name="height" value="0.1" units="cm"/><brushProperty name="rasterOp" value="xOrPen"/>' }));
  const page = layoutWordDocument(source.document, measure).pages[0]!;
  const box = wordPageInkBounds(page)[0]!;
  const drawing = [...source.document.drawings.values()][0]!;
  expect(box.width).toBeCloseTo(drawing.widthPoints + .1 * 72 / 2.54);
  expect(box.height).toBeCloseTo(drawing.heightPoints + .1 * 72 / 2.54);
  const ordinary = inkFixture(false, false, officeInk()).source;
  expect(wordPageInkBounds(layoutWordDocument(ordinary.document, measure).pages[0]!)).toEqual([]);
});

test('justified canvas text and underline use expanded layout positions', () => {
  const artifact = openWordArtifact(createWordArtifact({ page: { width: 140, height: 300, margin: 20 },
    paragraphs: [{ alignment: 'justify', runs: [{ text: 'one two three four five six seven', format: { underline: 'single' } }] }],
  }).bytes());
  const page = layoutWordDocument(artifact.document, measure).pages[0]!;
  const { context, calls } = recorder();
  paintWordPage(context, page);
  const line = page.columns[0]!.lines[0]!;
  expect(line.width).toBe(100);
  for (const fragment of line.fragments) {
    expect(calls.some(call => call[0] === 'fillText' && call[1] === fragment.text && call[2] === fragment.x)).toBe(true);
    if (fragment.wordSpacing) expect(calls.some(call => call[0] === 'lineTo' && call[1] === fragment.x + fragment.width)).toBe(true);
  }
});

test('cropped destination ink matches the same pixels in an uncropped render', async () => {
  const { inkFixture } = await import('./ink-fixture.ts');
  const { officeInk } = await import('../../ink/test/fixture.ts');
  const { paintWordInk } = await import('../src/ink-canvas.ts');
  for (const rasterOp of ['xOrPen', 'maskPen', 'notMergePen']) for (const scale of [4 / 3, 2.3, 8]) {
    const source = inkFixture(false, false, officeInk({ brush: `<brushProperty name="rasterOp" value="${rasterOp}"/>` })).source;
    const page = layoutWordDocument(source.document, measure).pages[0]!;
    const fragment = { ...drawingFragment(page), width: 20, height: 20 };
    const rendered: { x: number; y: number; width: number; height: number; data: Uint8ClampedArray }[] = [];
    const pixels = { getImageData: (x: number, y: number, width: number, height: number) => ({ width, height, data: new Uint8ClampedArray(width * height * 4).map((_, i) => i % 4 === 3 ? 255 : 85) }),
      putImageData: (image: { width: number; height: number; data: Uint8ClampedArray }, x: number, y: number) => { rendered.push({ ...image, x, y }); } };
    expect(paintWordInk(pixels, fragment, scale)).toBe(true);
    const full = rendered[0]!;
    const viewport = { x: full.x + 3, y: full.y + 5, width: 19, height: 23 };
    expect(paintWordInk(pixels, fragment, scale, 19 * 23, viewport)).toBe(true);
    const crop = rendered[1]!;
    expect([crop.x, crop.y, crop.width, crop.height]).toEqual([0, 0, 19, 23]);
    for (let y = 0; y < crop.height; y++) {
      const offset = ((y + 5) * full.width + 3) * 4;
      expect(crop.data.slice(y * crop.width * 4, (y + 1) * crop.width * 4)).toEqual(full.data.slice(offset, offset + crop.width * 4));
    }
    expect(paintWordInk({ ...pixels, getImageData: () => { throw Error('off-tile read'); } }, fragment, scale, 16, { x: 0, y: 0, width: 4, height: 4 })).toBe(true);
  }
});

test('a crop never requests an unrelated image', () => {
  const page = layout([{ kind: 'image', bytes: png, contentType: 'image/png', width: 80, height: 40 }]);
  paintWordPage(recorder().context, page, { viewport: { x: 0, y: 0, width: 4, height: 4 }, image: () => { throw Error('unrelated decode failure'); } });
});

test('empty painted image bounds never require decoding for an overlay', () => {
  const laidOut = layout([{ kind: 'image', bytes: png, contentType: 'image/png', width: 80, height: 40 }]);
  const page = { ...laidOut, columns: laidOut.columns.map(column => ({ ...column, lines: column.lines.map(line => ({ ...line, fragments: line.fragments.map(fragment => ({ ...fragment, width: 0 })) })) })) };
  const region = { x: 0, y: 0, width: page.width, height: page.height };
  expect(wordPageImages(page, [region])).toEqual([]);
  paintWordPage(recorder().context, page, { scale: 1, viewport: { ...region, width: Math.ceil(region.width), height: Math.ceil(region.height) }, image: () => { throw Error('empty image decoded'); } });
});
