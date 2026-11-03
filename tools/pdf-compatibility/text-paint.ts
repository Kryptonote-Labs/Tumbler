export type TextRegion = readonly [number, number, number, number];
const SHAPE_ERROR_LIMIT = 0.25;

/** Compare painted glyph shapes with a one-device-pixel neighborhood for rasterisation variance.
 * Checks each glyph region separately so a blank glyph cannot hide in the rest of a text page. */
export function compareTextPaint(
  actual: Uint8Array,
  reference: Uint8Array,
  width: number,
  height: number,
  regions: readonly TextRegion[],
) {
  const errors: string[] = [];
  let checked = 0,
    maxError = 0;
  const inkColor = (pixels: Uint8Array, at: number, background: readonly number[]) => {
    const vector = [0, 1, 2].map((channel) => background[channel]! - pixels[at + channel]!);
    const magnitude = Math.max(...vector.map((value) => Math.abs(value)));
    return magnitude > 12 ? vector.map((value) => value / magnitude) : undefined;
  };
  const matches = (
    pixels: Uint8Array,
    x: number,
    y: number,
    color: readonly number[],
    background: readonly number[],
  ) => {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx,
          yy = y + dy;
        if (xx < 0 || xx >= width || yy < 0 || yy >= height) continue;
        const candidate = inkColor(pixels, (yy * width + xx) * 4, background);
        if (
          candidate &&
          candidate.every((value, channel) => Math.abs(value - color[channel]!) < 0.25)
        )
          return true;
      }
    return false;
  };
  for (const [left, top, right, bottom] of regions) {
    const x0 = Math.max(0, left),
      y0 = Math.max(0, top),
      x1 = Math.min(width, right),
      y1 = Math.min(height, bottom);
    if (x1 <= x0 || y1 <= y0) continue;
    const border: number[][] = [[], [], []];
    for (let y = y0; y < y1; y++)
      for (const x of [x0, x1 - 1])
        for (let c = 0; c < 3; c++) border[c]!.push(reference[(y * width + x) * 4 + c]!);
    for (let x = x0; x < x1; x++)
      for (const y of [y0, y1 - 1])
        for (let c = 0; c < 3; c++) border[c]!.push(reference[(y * width + x) * 4 + c]!);
    const background = border.map(
      (values) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)]!,
    );
    let ink = 0,
      referenceInk = 0,
      actualInk = 0,
      unmatched = 0;
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const at = (y * width + x) * 4;
        for (const [source, target] of [
          [reference, actual],
          [actual, reference],
        ] as const) {
          const color = inkColor(source, at, background);
          if (!color) continue;
          ink++;
          if (source === reference) referenceInk++;
          else actualInk++;
          if (!matches(target, x, y, color, background)) unmatched++;
        }
      }
    if (!ink) continue;
    checked++;
    const error = unmatched / ink;
    maxError = Math.max(maxError, error);
    // A few boundary samples can differ completely on tiny punctuation at 72 DPI.
    if (
      (referenceInk > 0 && actualInk === 0 && unmatched > 0) ||
      (unmatched > 3 && error > SHAPE_ERROR_LIMIT)
    )
      errors.push(
        `Painted text at ${x0},${y0} differs in ${(error * 100).toFixed(2)}% of ink samples, exceeding ${SHAPE_ERROR_LIMIT * 100}%.`,
      );
  }
  return { checked, maxError, errors };
}
