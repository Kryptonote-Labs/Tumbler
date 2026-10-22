import { wordPicturePaintBounds } from './picture-geometry.ts';
import type { WordImageDrawing } from './drawings.ts';

/** Compositing AABB relative to the editing frame. Includes picture rotation and ink overflow.
 * Use the original frame for DOM placement and editing; these bounds are for region selection. */
export function wordImagePaintBounds(drawing: WordImageDrawing, width = drawing.widthPoints, height = drawing.heightPoints) {
  const bounds = drawing.inkProjection?.bounds;
  if (!bounds) return drawing.picture ? wordPicturePaintBounds(drawing.picture, width, height) : { x: 0, y: 0, width, height };
  const sx = width / drawing.widthPoints, sy = height / drawing.heightPoints;
  return { x: bounds.x * sx, y: bounds.y * sy, width: bounds.width * sx, height: bounds.height * sy };
}
