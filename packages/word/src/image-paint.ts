import type { WordImageDrawing } from './drawings.ts';

/** Image pixels can extend outside an ink drawing's native layout/editing frame. */
export function wordImagePaintBounds(drawing: WordImageDrawing, width = drawing.widthPoints, height = drawing.heightPoints) {
  const bounds = drawing.inkProjection?.bounds;
  if (!bounds) return { x: 0, y: 0, width, height };
  const sx = width / drawing.widthPoints, sy = height / drawing.heightPoints;
  return { x: bounds.x * sx, y: bounds.y * sy, width: bounds.width * sx, height: bounds.height * sy };
}
