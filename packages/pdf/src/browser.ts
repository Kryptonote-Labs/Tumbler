import type { PdfImageData } from "./scene.ts";
import type { PdfPaintHost } from "./canvas-paint.ts";

/** Each view owns and releases its decoded image cache independently of the document graph. */
export function browserPdfPaintHost(): PdfPaintHost<ImageBitmap | OffscreenCanvas, Path2D> & {
  close(): void;
} {
  const images = new WeakMap<PdfImageData, Promise<ImageBitmap>>(),
    decoded = new Set<ImageBitmap>();
  let closed = false;
  return {
    path: (svg) => new Path2D(svg),
    surface(width, height) {
      const image = new OffscreenCanvas(width, height),
        context = image.getContext("2d");
      if (!context) throw new Error("A 2D canvas is required to render this PDF.");
      return { image, context };
    },
    image(data) {
      if (closed) return Promise.reject(new Error("PDF paint host is closed."));
      let pending = images.get(data);
      if (!pending) {
        pending = data.rgba
          ? createImageBitmap(
              new ImageData(new Uint8ClampedArray(data.rgba), data.width, data.height),
            )
          : createImageBitmap(
              new Blob([Uint8Array.from(data.encoded!).buffer], { type: data.mime! }),
            );
        images.set(data, pending);
        void pending
          .then((image) => {
            if (closed) image.close();
            else decoded.add(image);
          })
          .catch(() => {});
      }
      return pending;
    },
    release(image) {
      if (image instanceof ImageBitmap) {
        image.close();
        decoded.delete(image);
      }
    },
    close() {
      if (closed) return;
      closed = true;
      for (const image of decoded) image.close();
      decoded.clear();
    },
  };
}
