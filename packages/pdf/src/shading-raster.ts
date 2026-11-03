import { colourSpace } from "./colour.ts";
import { evaluateFunction } from "./functions.ts";
import { inverse, multiply, transform, type PdfMatrix } from "./matrix.ts";
import { array, integer, invalid, number, type PdfDictionary, unsupported } from "./objects.ts";
import type { PdfImageData } from "./scene.ts";
import type { PdfSource } from "./source.ts";

/** Sample in device space so affine transforms and endpoint extension behave identically on every canvas host. */
export function rasterPdfShading(
  source: PdfSource,
  info: PdfDictionary,
  resources: PdfDictionary,
  mapping: PdfMatrix,
  width: number,
  height: number,
): PdfImageData {
  const kind = integer(info.get("ShadingType")),
    coords = array(source.resolve(info.get("Coords"))).map((value) => number(value));
  if (
    (kind !== 2 && kind !== 3) ||
    (kind === 2 && coords.length !== 4) ||
    (kind === 3 && coords.length !== 6)
  )
    return unsupported(`PDF shading type ${kind} needs a mesh/function rasterizer.`);
  const space = colourSpace(source, info.get("ColorSpace"), resources),
    rgba = new Uint8ClampedArray(width * height * 4);
  const domain = info.has("Domain")
    ? array(source.resolve(info.get("Domain"))).map((value) => number(value))
    : [0, 1];
  const extend = info.has("Extend") ? array(source.resolve(info.get("Extend"))) : [false, false];
  if (
    domain.length !== 2 ||
    extend.length !== 2 ||
    extend.some((value) => typeof value !== "boolean")
  )
    return invalid("Invalid PDF shading Domain or Extend.");
  const box = info.has("BBox")
    ? array(source.resolve(info.get("BBox"))).map((value) => number(value))
    : undefined;
  const back = inverse(mapping),
    lookup = Array.from({ length: 4097 }, (_, i) =>
      space.rgb(
        evaluateFunction(source, info.get("Function"), [
          domain[0]! + (i / 4096) * (domain[1]! - domain[0]!),
        ]),
      ),
    );
  const dx = coords[kind === 2 ? 2 : 3]! - coords[0]!,
    dy = coords[kind === 2 ? 3 : 4]! - coords[1]!;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const [px, py] = transform(back, x + 0.5, y + 0.5),
        at = (y * width + x) * 4;
      if (box && (px < box[0]! || py < box[1]! || px > box[2]! || py > box[3]!)) continue;
      let parameter: number;
      if (kind === 2) {
        const length = dx * dx + dy * dy;
        if (!length) continue;
        parameter = ((px - coords[0]!) * dx + (py - coords[1]!) * dy) / length;
      } else {
        const radius = coords[2]!,
          dr = coords[5]! - radius,
          rx = px - coords[0]!,
          ry = py - coords[1]!;
        const a = dx * dx + dy * dy - dr * dr,
          b = -2 * (rx * dx + ry * dy + radius * dr),
          c = rx * rx + ry * ry - radius * radius;
        const roots: number[] = [];
        if (Math.abs(a) < 1e-12) {
          if (Math.abs(b) > 1e-12) roots.push(-c / b);
        } else {
          const discriminant = b * b - 4 * a * c;
          if (discriminant >= 0) {
            roots.push(
              (-b - Math.sqrt(discriminant)) / (2 * a),
              (-b + Math.sqrt(discriminant)) / (2 * a),
            );
          }
        }
        const valid = roots.filter(
          (value) =>
            Number.isFinite(value) &&
            radius + value * dr >= 0 &&
            (value >= 0 || extend[0]) &&
            (value <= 1 || extend[1]),
        );
        if (!valid.length) continue;
        parameter = Math.max(...valid);
      }
      if ((parameter < 0 && !extend[0]) || (parameter > 1 && !extend[1])) continue;
      const sample = Math.max(0, Math.min(4096, parameter * 4096)),
        lower = Math.floor(sample),
        fraction = sample - lower;
      for (let channel = 0; channel < 3; channel++)
        rgba[at + channel] =
          lookup[lower]![channel]! * (1 - fraction) +
          lookup[Math.min(4096, lower + 1)]![channel]! * fraction;
      rgba[at + 3] = 255;
    }
  return {
    width,
    height,
    rgba,
    encoded: undefined,
    mime: undefined,
    interpolate: false,
    stencil: false,
  };
}
