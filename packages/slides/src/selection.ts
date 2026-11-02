import { resizeSlideTransform, shapeMatrix, transformPoint } from "./geometry.ts";
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

/** Resize each selected object by the active object's size ratios, keeping its opposite handle fixed. */
export function resizeSlideSelection(
  objects: readonly SlideObject[],
  active: SlideObject,
  handle: { readonly x: -1 | 0 | 1; readonly y: -1 | 0 | 1 },
  dx: number,
  dy: number,
  options: { readonly preserveAspectRatio?: boolean } = {},
) {
  const resized = resizeSlideTransform(active.transform, handle, dx, dy, {
    preserveAspectRatio: active.kind === "picture" || !!options.preserveAspectRatio,
  });
  const sx = active.transform.width > 0 ? resized.width / active.transform.width : 1;
  const sy = active.transform.height > 0 ? resized.height / active.transform.height : 1;
  return objects.filter(object => object.movable).map(object => {
    if (object.key === active.key) return { objectKey: object.key, ...resized };
    const transform = object.transform;
    const [a, b, c, d] = shapeMatrix(transform);
    const localX = handle.x * (transform.width > 0 && active.transform.width > 0
      ? transform.width * (sx - 1) : resized.width - active.transform.width);
    const localY = handle.y * (transform.height > 0 && active.transform.height > 0
      ? transform.height * (sy - 1) : resized.height - active.transform.height);
    return {
      objectKey: object.key,
      ...resizeSlideTransform(transform, handle, a * localX + c * localY, b * localX + d * localY, {
        preserveAspectRatio: object.kind === "picture" || !!options.preserveAspectRatio,
      }),
    };
  });
}
