import { expect, test } from "bun:test";
import { createWordArtifact, layoutWordDocument, openWordArtifact, paintWordPage, wordPageImages, type WordCanvasContext, type WordContentBlock, type WordImageDrawing } from "../src/index.ts";

const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=", "base64"));
const measure = { measure: (text: string) => ({ width: text.length * 6, ascent: 9, descent: 3 }) };

type Call = readonly [string, ...unknown[]];
/** Records drawing calls together with the state they were made in. */
function recorder() {
  const calls: Call[] = [];
  const context = {
    font: "", fillStyle: "" as unknown, strokeStyle: "" as unknown, lineWidth: 1, textAlign: "start", textBaseline: "alphabetic", direction: "inherit", letterSpacing: "0px",
    save: () => {}, restore: () => {}, beginPath: () => {}, rect: () => {}, clip: () => {}, moveTo: () => {}, setLineDash: () => {},
    scale: (x: number, y: number) => calls.push(["scale", x, y]),
    lineTo: (x: number, y: number) => calls.push(["lineTo", x, y]),
    stroke: () => calls.push(["stroke", context.strokeStyle]),
    fillRect: (x: number, y: number, width: number, height: number) => calls.push(["fillRect", context.fillStyle, x, y, width, height]),
    fillText: (text: string, x: number, y: number) => calls.push(["fillText", text, x, y, context.font, context.fillStyle]),
    drawImage: (image: string, x: number, y: number, width: number, height: number) => calls.push(["drawImage", image, x, y, width, height]),
  } satisfies WordCanvasContext<string>;
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
  expect(calls[1]).toEqual(["fillRect", "#ffffff", 0, 0, page.width, page.height]);
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

test("browser and offscreen canvases are paint targets", () => {
  // Compile-time consumer compatibility: these assignments fail type checking if the subset drifts.
  const targets: [(context: CanvasRenderingContext2D) => WordCanvasContext<CanvasImageSource>, (context: OffscreenCanvasRenderingContext2D) => WordCanvasContext<CanvasImageSource>] = [context => context, context => context];
  expect(targets).toHaveLength(2);
});
