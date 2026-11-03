import { transform } from "../../packages/pdf/src/matrix.ts";
import type { PdfPageScene, PdfSceneElement } from "../../packages/pdf/src/index.ts";
import type { OraclePage } from "./precision.ts";

function bounds(element: PdfSceneElement) {
  const points: (readonly [number, number])[] = [];
  if (element.kind === "image") {
    for (const [x, y] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ])
      points.push(transform(element.state.transform, x!, y!));
  } else if (element.kind === "path") {
    let current: readonly [number, number] = [0, 0];
    for (const command of element.path) {
      if (command.kind === "close") continue;
      const mapping = command.transform ?? element.state.transform,
        end = transform(mapping, command.x, command.y);
      if (command.kind === "curve") {
        const one = transform(mapping, command.x1, command.y1),
          two = transform(mapping, command.x2, command.y2),
          p0 = current;
        const evaluate = (t: number): readonly [number, number] =>
          [0, 1].map(
            (axis) =>
              (1 - t) ** 3 * p0[axis]! +
              3 * (1 - t) ** 2 * t * one[axis]! +
              3 * (1 - t) * t * t * two[axis]! +
              t ** 3 * end[axis]!,
          ) as [number, number];
        for (let axis = 0; axis < 2; axis++) {
          const a = -p0[axis]! + 3 * one[axis]! - 3 * two[axis]! + end[axis]!,
            b = 2 * (p0[axis]! - 2 * one[axis]! + two[axis]!),
            c = one[axis]! - p0[axis]!;
          const roots =
            Math.abs(a) < 1e-12
              ? Math.abs(b) < 1e-12
                ? []
                : [-c / b]
              : b * b - 4 * a * c < 0
                ? []
                : [
                    (-b - Math.sqrt(b * b - 4 * a * c)) / (2 * a),
                    (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a),
                  ];
          for (const t of roots) if (t > 0 && t < 1) points.push(evaluate(t));
        }
      }
      points.push(end);
      current = end;
    }
  }
  return [
    Math.min(...points.map((point) => point[0])),
    Math.min(...points.map((point) => point[1])),
    Math.max(...points.map((point) => point[0])),
    Math.max(...points.map((point) => point[1])),
  ] as const;
}
/** Missing small vector objects must not disappear into the whole-page pixel allowance. */
export function comparePrimitives(scene: PdfPageScene, oracle: OraclePage) {
  const actual = scene.elements
    .filter(
      (element) =>
        !element.source.instance.startsWith("annotation:") &&
        !element.source.instance.includes(":glyph:") &&
        (element.kind === "image" || (element.kind === "path" && element.fill && !element.stroke)),
    )
    .map((element) => ({ kind: element.kind, bounds: bounds(element) }));
  const errors: string[] = [];
  if (actual.length !== oracle.objects.length)
    errors.push(`Non-font object count ${actual.length}, expected ${oracle.objects.length}.`);
  for (const expected of oracle.objects) {
    let selected = -1,
      distance = Infinity;
    actual.forEach((candidate, index) => {
      if (candidate.kind !== expected.kind) return;
      const error = Math.max(
        ...candidate.bounds.map((value, i) => Math.abs(value - expected.bounds[i]!)),
      );
      if (error < distance) {
        distance = error;
        selected = index;
      }
    });
    if (selected < 0) {
      errors.push(`Missing ${expected.kind} object.`);
      continue;
    }
    actual.splice(selected, 1);
    if (distance > 0.05)
      errors.push(
        `${expected.kind} bounds differ by ${distance.toFixed(5)} pt, exceeding 0.05 pt.`,
      );
  }
  return errors;
}
