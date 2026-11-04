import { expect, test } from "bun:test";
import { createCanvas } from "@napi-rs/canvas";
import { extendPdfTileEdges } from "../src/pdf/tile-edges.ts";
for (const alpha of [1, 0.5])
  test(`tile gutters extend cropped edge pixels with alpha ${alpha}`, () => {
    const canvas = createCanvas(4, 4),
      context = canvas.getContext("2d");
    context.fillStyle = "black";
    context.fillRect(0, 0, 4, 4);
    context.clearRect(1, 1, 2, 2);
    context.fillStyle = `rgba(20,80,140,${alpha})`;
    context.fillRect(1, 1, 2, 2);
    const edge = Array.from(context.getImageData(1, 1, 1, 1).data);
    extendPdfTileEdges(canvas, context, { x: -1, y: -1, width: 4, height: 4 }, 2, 2);
    const pixels = context.getImageData(0, 0, 4, 4).data;
    for (let at = 0; at < pixels.length; at += 4)
      expect(Array.from(pixels.slice(at, at + 4))).toEqual(edge);
  });
