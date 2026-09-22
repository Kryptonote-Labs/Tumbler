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

/** Resize along local axes while keeping the opposite edge/corner fixed in slide space. */
export function resizeSlideTransform(
  transform: SlideTransform,
  handle: { readonly x: -1 | 0 | 1; readonly y: -1 | 0 | 1 },
  dx: number,
  dy: number,
): SlideTransform {
  const [a, b, c, d] = shapeMatrix(transform);
  const localX = a * dx + b * dy,
    localY = c * dx + d * dy;
  const width =
    handle.x === 0
      ? transform.width
      : Math.max(8, transform.width + handle.x * localX);
  const height =
    handle.y === 0
      ? transform.height
      : Math.max(8, transform.height + handle.y * localY);
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
