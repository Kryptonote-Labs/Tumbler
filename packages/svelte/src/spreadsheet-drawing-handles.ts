import type { SpreadsheetDrawingBounds } from "@tumblerjs/sheets";

/** A side or corner of a selected drawing, as -1 (start), 0 (middle) or 1 (end) on each axis. */
export interface DrawingHandle {
  readonly x: -1 | 0 | 1;
  readonly y: -1 | 0 | 1;
  readonly name: string;
  readonly cursor: string;
}

/** The eight resize handles Office shows around a selected drawing. */
export const drawingHandles: readonly DrawingHandle[] = [
  { x: -1, y: -1, name: "top left", cursor: "nwse-resize" },
  { x: 0, y: -1, name: "top", cursor: "ns-resize" },
  { x: 1, y: -1, name: "top right", cursor: "nesw-resize" },
  { x: -1, y: 0, name: "left", cursor: "ew-resize" },
  { x: 1, y: 0, name: "right", cursor: "ew-resize" },
  { x: -1, y: 1, name: "bottom left", cursor: "nesw-resize" },
  { x: 0, y: 1, name: "bottom", cursor: "ns-resize" },
  { x: 1, y: 1, name: "bottom right", cursor: "nwse-resize" },
];

const minimumSize = 8;

/**
 * Drags one handle by (dx, dy) sheet pixels. The opposite side stays fixed, and a corner keeps
 * the original aspect ratio when `keepAspect` is set, as Shift does in Office.
 */
export function resizeDrawingBounds(
  bounds: SpreadsheetDrawingBounds,
  handle: Pick<DrawingHandle, "x" | "y">,
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
