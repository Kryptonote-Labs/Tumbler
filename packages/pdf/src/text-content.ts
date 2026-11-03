import { multiply, type PdfMatrix } from "./matrix.ts";
import type { PdfPageScene, PdfSceneSource } from "./scene.ts";

export interface PdfTextItem {
  readonly id: string;
  readonly kind: "glyph" | "separator";
  readonly text: string;
  /** Maps local em coordinates, with a downward y axis, to page viewport points. */
  readonly transform: PdfMatrix;
  readonly width: number;
  readonly ascent: number;
  readonly height: number;
  readonly font: { readonly family: string; readonly weight: string; readonly style: string };
  readonly source: PdfSceneSource;
}
export interface PdfTextContent {
  readonly pageId: string;
  readonly width: number;
  readonly height: number;
  readonly items: readonly PdfTextItem[];
  readonly text: string;
}
interface Positioned {
  item: PdfTextItem;
  direction: readonly [number, number];
  advance: readonly [number, number];
  em: number;
}
const dot = (x: number, y: number, direction: readonly [number, number]) =>
  x * direction[0] + y * direction[1];
const rtl = /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufeff]/u;

/** Project extraction text onto source glyph geometry. Font rasterisation and browser layout do not move the PDF.
 * Consecutive baseline groups retain content-flow order; ordinary LTR glyphs within a line follow their positions.
 * Line changes and explicit positioning gaps become copyable separators, while character spacing stays inside words. */
export function pdfTextContent(scene: PdfPageScene): PdfTextContent {
  const lines: Positioned[][] = [];
  for (const element of scene.elements) {
    if (element.kind !== "glyph" || !element.glyph.unicode) continue;
    const font = element.font,
      units = font.unitsPerEm;
    const matrix = multiply(
      scene.viewport,
      multiply(element.state.transform, [units, 0, 0, -units, 0, 0]),
    );
    const ascent = font.ascent / units,
      height = (font.ascent - font.descent) / units;
    const em = Math.max(Math.hypot(matrix[0], matrix[1]), Math.hypot(matrix[2], matrix[3]));
    if (!Number.isFinite(em) || em < 1e-8 || height <= 0) continue;
    const flow = font.vertical
      ? ([matrix[2], matrix[3]] as const)
      : ([matrix[0], matrix[1]] as const);
    const length = Math.hypot(...flow);
    if (length < 1e-8) continue;
    const positioned: Positioned = {
      item: {
        id: element.id,
        kind: "glyph",
        text: element.glyph.unicode,
        transform: matrix,
        width: element.glyph.width / (font.kind === "Type3" ? units : 1000),
        ascent,
        height,
        font: font.css,
        source: element.source,
      },
      direction: [flow[0] / length, flow[1] / length],
      em,
      advance: [
        scene.viewport[0] * element.advanceVector[0] + scene.viewport[2] * element.advanceVector[1],
        scene.viewport[1] * element.advanceVector[0] + scene.viewport[3] * element.advanceVector[1],
      ],
    };
    const line = lines.at(-1),
      previous = line?.[0];
    if (
      previous &&
      dot(...positioned.direction, previous.direction) > 0.99 &&
      Math.abs(
        dot(matrix[4] - previous.item.transform[4], matrix[5] - previous.item.transform[5], [
          -previous.direction[1],
          previous.direction[0],
        ]),
      ) <
        Math.max(em, previous.em) * 0.35
    )
      line!.push(positioned);
    else lines.push([positioned]);
  }
  const items: PdfTextItem[] = [];
  for (const line of lines) {
    const direction = line[0]!.direction;
    if (!line.some((value) => rtl.test(value.item.text)))
      line.sort((a, b) =>
        dot(
          a.item.transform[4] - b.item.transform[4],
          a.item.transform[5] - b.item.transform[5],
          direction,
        ),
      );
    if (items.length)
      items.push({
        ...line[0]!.item,
        id: line[0]!.item.id + ":line",
        kind: "separator",
        text: "\n",
        width: 0,
      });
    let previous: Positioned | undefined;
    for (const current of line) {
      if (previous && !/\s$/u.test(previous.item.text) && !/^\s/u.test(current.item.text)) {
        const expectedX = previous.item.transform[4] + previous.advance[0],
          expectedY = previous.item.transform[5] + previous.advance[1];
        const gap = dot(
          current.item.transform[4] - expectedX,
          current.item.transform[5] - expectedY,
          direction,
        );
        if (gap > Math.max(0.5, Math.min(previous.em, current.em) * 0.15)) {
          const em = previous.em;
          items.push({
            ...previous.item,
            id: current.item.id + ":gap",
            kind: "separator",
            text: " ",
            width: gap / em,
            transform: [
              direction[0] * em,
              direction[1] * em,
              -direction[1] * em,
              direction[0] * em,
              expectedX,
              expectedY,
            ],
          });
        }
      }
      items.push(current.item);
      previous = current;
    }
  }
  return {
    pageId: scene.page.id,
    width: scene.width,
    height: scene.height,
    items,
    text: items.map((item) => item.text).join(""),
  };
}
