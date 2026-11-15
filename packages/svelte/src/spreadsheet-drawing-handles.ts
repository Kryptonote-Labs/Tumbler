import type { SpreadsheetDrawingBounds } from "@tumblerjs/sheets";
import type { ObjectHandle } from "./object-selection.ts";

const minimumSize = 8;

/**
 * Drags one handle by (dx, dy) sheet pixels. The opposite side stays fixed, and a corner keeps
 * the original aspect ratio when `keepAspect` is set, as Shift does in Office.
 */
export function resizeDrawingBounds(
  bounds: SpreadsheetDrawingBounds,
  handle: Pick<ObjectHandle, "x" | "y">,
  dx: number,
  dy: number,
  keepAspect = false,
): SpreadsheetDrawingBounds {
  let width = Math.max(minimumSize, bounds.width + handle.x * dx);
  let height = Math.max(minimumSize, bounds.height + handle.y * dy);
  if (keepAspect && handle.x !== 0 && handle.y !== 0) {
    const scale = Math.max(width / bounds.width, height / bounds.height);
    width = Math.max(minimumSize, bounds.width * scale);
    height = Math.max(minimumSize, bounds.height * scale);
  }
  return {
    ...bounds,
    x: handle.x === -1 ? bounds.x + bounds.width - width : bounds.x,
    y: handle.y === -1 ? bounds.y + bounds.height - height : bounds.y,
    width: handle.x === 0 ? bounds.width : width,
    height: handle.y === 0 ? bounds.height : height,
  };
}
