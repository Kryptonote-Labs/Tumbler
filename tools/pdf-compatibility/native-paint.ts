import {
  createCanvas,
  ImageData,
  loadImage,
  Path2D,
  type Canvas,
  type Image,
} from "@napi-rs/canvas";
import {
  openPdfDocument,
  PdfInterpreter,
  paintPdfPage,
  type PdfPaintHost,
  type PdfPageScene,
} from "../../packages/pdf/src/index.ts";

export function nativePdfHost(): PdfPaintHost<Canvas | Image, Path2D> {
  return {
    path: (svg) => new Path2D(svg),
    surface(width, height) {
      const image = createCanvas(width, height);
      return { image, context: image.getContext("2d") };
    },
    async image(data) {
      if (data.rgba) {
        const canvas = createCanvas(data.width, data.height);
        canvas
          .getContext("2d")
          .putImageData(
            new ImageData(new Uint8ClampedArray(data.rgba), data.width, data.height),
            0,
            0,
          );
        return canvas;
      }
      return loadImage(Buffer.from(data.encoded!));
    },
  };
}
export async function renderNativePdf(
  bytes: Uint8Array,
  password?: string,
  indexes?: readonly number[],
) {
  const document = openPdfDocument(bytes, password ? { password } : {}),
    interpreter = new PdfInterpreter(document);
  const pages: { scene: PdfPageScene; png: Buffer }[] = [];
  for (const index of indexes ?? document.pages.map((_, index) => index)) {
    const scene = interpreter.page(index),
      canvas = createCanvas(Math.ceil(scene.width), Math.ceil(scene.height));
    await paintPdfPage(canvas.getContext("2d"), scene, document.source, nativePdfHost(), {
      scale: 1,
    });
    pages.push({ scene, png: canvas.toBuffer("image/png") });
  }
  return pages;
}
