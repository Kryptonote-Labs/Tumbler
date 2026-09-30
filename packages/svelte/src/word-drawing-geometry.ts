export type WordDrawingBox = { x: number; y: number; width: number; height: number };
export type WordDrawingHandle = { x: -1 | 0 | 1; y: -1 | 0 | 1 };

// One EMU in points, matching the headless engine's positive drawing extents.
const minimumSize = 1 / 12700;

/** Resize in document points. Clipping belongs to the view, not the stored geometry. */
export function resizeWordDrawingBox(
  original: WordDrawingBox,
  handle: WordDrawingHandle,
  dx: number,
  dy: number,
  inline: boolean,
): WordDrawingBox {
  let width = original.width;
  let height = original.height;
  if (handle.x !== 0 && handle.y !== 0) {
    const factor = 1 + (dx * handle.x * width + dy * handle.y * height) / (width * width + height * height);
    const ratio = Math.max(minimumSize / Math.min(width, height), factor);
    width *= ratio;
    height *= ratio;
  } else {
    if (handle.x !== 0) width = Math.max(minimumSize, width + dx * handle.x);
    if (handle.y !== 0) height = Math.max(minimumSize, height + dy * handle.y);
  }
  return {
    x: !inline && handle.x < 0 ? original.x + original.width - width : original.x,
    y: !inline && handle.y < 0 ? original.y + original.height - height : original.y,
    width,
    height,
  };
}
