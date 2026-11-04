import type { PdfPaintOptions } from "@tumblerjs/pdf";

/** Match a full-page texture's clamped edges rather than filtering content outside the crop.
 * The tile intersects the page; its context is in device pixels with source-over composition. */
export function extendPdfTileEdges<Image>(
  image: Image,
  context: {
    imageSmoothingEnabled: boolean;
    clearRect(x: number, y: number, width: number, height: number): void;
    drawImage(
      image: Image,
      sx: number,
      sy: number,
      sw: number,
      sh: number,
      dx: number,
      dy: number,
      dw: number,
      dh: number,
    ): void;
  },
  region: NonNullable<PdfPaintOptions["region"]>,
  pageWidth: number,
  pageHeight: number,
) {
  const left = Math.max(0, -region.x),
    top = Math.max(0, -region.y);
  const right = Math.min(region.width, pageWidth - region.x),
    bottom = Math.min(region.height, pageHeight - region.y);
  if (left >= right || top >= bottom) return;
  const smoothing = context.imageSmoothingEnabled;
  context.imageSmoothingEnabled = false;
  try {
    if (left) {
      context.clearRect(0, 0, left, region.height);
      context.drawImage(image, left, 0, 1, region.height, 0, 0, left, region.height);
    }
    if (right < region.width) {
      context.clearRect(right, 0, region.width - right, region.height);
      context.drawImage(
        image,
        right - 1,
        0,
        1,
        region.height,
        right,
        0,
        region.width - right,
        region.height,
      );
    }
    if (top) {
      context.clearRect(0, 0, region.width, top);
      context.drawImage(image, 0, top, region.width, 1, 0, 0, region.width, top);
    }
    if (bottom < region.height) {
      context.clearRect(0, bottom, region.width, region.height - bottom);
      context.drawImage(
        image,
        0,
        bottom - 1,
        region.width,
        1,
        0,
        bottom,
        region.width,
        region.height - bottom,
      );
    }
  } finally {
    context.imageSmoothingEnabled = smoothing;
  }
}
