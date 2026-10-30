import { transformPoint } from "./geometry.ts";
import type { SlideObject } from "./model.ts";

export type SlideSelectionRect = { x: number; y: number; width: number; height: number };

/** Require every transformed corner to be enclosed, leaving larger backgrounds unselected. */
export function slideObjectEnclosed(object: SlideObject, rect: SlideSelectionRect, height = object.transform.height) {
  return ([[0, 0], [object.transform.width, 0], [0, height], [object.transform.width, height]] as const).every(([x, y]) => {
    const point = transformPoint(object.matrix, x, y);
    return point.x >= rect.x && point.x <= rect.x + rect.width &&
      point.y >= rect.y && point.y <= rect.y + rect.height;
  });
}

/** Convert a slide-space movement into the object's parent coordinates, including scaled groups. */
export function translateSlideObject(object: SlideObject, dx: number, dy: number) {
  const [a, b, c, d] = object.parentMatrix ?? [1, 0, 0, 1];
  const determinant = a * d - b * c;
  if (Math.abs(determinant) < 1e-12) return object.transform;
  return {
    ...object.transform,
    x: object.transform.x + (d * dx - c * dy) / determinant,
    y: object.transform.y + (a * dy - b * dx) / determinant,
  };
}
