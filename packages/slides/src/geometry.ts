import type { Matrix, SlideTransform } from "./model.ts";
export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
export const EMUS_PER_PIXEL = 9525;
/** Compose affine transforms in source order; coordinates are CSS pixels at 96 DPI. */
export function multiply(left: Matrix, right: Matrix): Matrix {
  const [a, b, c, d, e, f] = left,
    [g, h, i, j, k, l] = right;
  return [
    a * g + c * h,
    b * g + d * h,
    a * i + c * j,
    b * i + d * j,
    a * k + c * l + e,
    b * k + d * l + f,
  ];
}
export function shapeMatrix(transform: SlideTransform): Matrix {
  const { x, y, width, height, rotation, flipH, flipV } = transform;
  const angle = (rotation * Math.PI) / 180,
    cos = Math.cos(angle),
    sin = Math.sin(angle);
  const sx = flipH ? -1 : 1,
    sy = flipV ? -1 : 1;
  const a = cos * sx,
    b = sin * sx,
    c = -sin * sy,
    d = cos * sy;
  return [
    a,
    b,
    c,
    d,
    x + width / 2 - (a * width) / 2 - (c * height) / 2,
    y + height / 2 - (b * width) / 2 - (d * height) / 2,
  ];
}
export function transformPoint(matrix: Matrix, x: number, y: number) {
  return {
    x: matrix[0] * x + matrix[2] * y + matrix[4],
    y: matrix[1] * x + matrix[3] * y + matrix[5],
  };
}

/** Resize along local axes, fixing the opposite edge/corner. Aspect locking applies only to corners. */
export function resizeSlideTransform(
  transform: SlideTransform,
  handle: { readonly x: -1 | 0 | 1; readonly y: -1 | 0 | 1 },
  dx: number,
  dy: number,
  options: { readonly preserveAspectRatio?: boolean } = {},
): SlideTransform {
  const [a, b, c, d] = shapeMatrix(transform);
  const localX = a * dx + b * dy,
    localY = c * dx + d * dy;
  let width =
    handle.x === 0
      ? transform.width
      : Math.max(8, transform.width + handle.x * localX);
  let height =
    handle.y === 0
      ? transform.height
      : Math.max(8, transform.height + handle.y * localY);
  if (
    options.preserveAspectRatio &&
    handle.x !== 0 &&
    handle.y !== 0 &&
    transform.width > 0 &&
    transform.height > 0
  ) {
    // Project the dragged corner onto the original diagonal in local space.
    const { width: w, height: h } = transform;
    const scale = Math.max(
      8 / w,
      8 / h,
      1 + (handle.x * localX * w + handle.y * localY * h) / (w * w + h * h),
    );
    width = w * scale;
    height = h * scale;
  }
  const dw = width - transform.width,
    dh = height - transform.height;
  const cx = (handle.x * dw) / 2,
    cy = (handle.y * dh) / 2;
  return {
    ...transform,
    width,
    height,
    x: transform.x + a * cx + c * cy - dw / 2,
    y: transform.y + b * cx + d * cy - dh / 2,
  };
}
