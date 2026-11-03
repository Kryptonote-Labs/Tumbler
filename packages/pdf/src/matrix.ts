import { array, invalid, number, type PdfValue } from "./objects.ts";

export type PdfMatrix = readonly [number, number, number, number, number, number];
export const identity: PdfMatrix = [1, 0, 0, 1, 0, 0];
export function multiply(a: PdfMatrix, b: PdfMatrix): PdfMatrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}
export function transform(matrix: PdfMatrix, x: number, y: number): readonly [number, number] {
  return [matrix[0] * x + matrix[2] * y + matrix[4], matrix[1] * x + matrix[3] * y + matrix[5]];
}
export function inverse(value: PdfMatrix): PdfMatrix {
  const [a, b, c, d, e, f] = value,
    determinant = a * d - b * c;
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-20)
    return invalid("Singular PDF transformation matrix.");
  return [
    d / determinant,
    -b / determinant,
    -c / determinant,
    a / determinant,
    (c * f - d * e) / determinant,
    (b * e - a * f) / determinant,
  ];
}
export function matrix(value: PdfValue | undefined, fallback: PdfMatrix = identity): PdfMatrix {
  if (value === undefined || value === null) return fallback;
  const numbers = array(value).map((item) => number(item));
  if (numbers.length !== 6) return invalid("PDF affine matrix must have six numbers.");
  return [numbers[0]!, numbers[1]!, numbers[2]!, numbers[3]!, numbers[4]!, numbers[5]!];
}
