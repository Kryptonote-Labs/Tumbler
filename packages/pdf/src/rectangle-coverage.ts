import { multiply, transform, type PdfMatrix } from "./matrix.ts";
import type { PdfPathElement } from "./scene.ts";

/** Device coverage for an axis-aligned PDF rectangle, including subpixel table rules. */
export function rectangleCoverage(element: PdfPathElement, viewport: PdfMatrix) {
  const points: (readonly [number, number])[] = [];
  for (const command of element.path) {
    if (command.kind === "close") continue;
    if (command.kind === "curve" || (command.kind === "move" && points.length)) return;
    points.push(
      transform(
        multiply(viewport, command.transform ?? element.state.transform),
        command.x,
        command.y,
      ),
    );
  }
  if (points.length === 5 && points[0]![0] === points[4]![0] && points[0]![1] === points[4]![1])
    points.pop();
  if (points.length !== 4) return;
  for (let i = 0; i < 4; i++) {
    const a = points[i]!,
      b = points[(i + 1) % 4]!;
    if (Math.abs(a[0] - b[0]) > 1e-7 && Math.abs(a[1] - b[1]) > 1e-7) return;
  }
  const left = Math.min(...points.map((p) => p[0])),
    top = Math.min(...points.map((p) => p[1]));
  const right = Math.max(...points.map((p) => p[0])),
    bottom = Math.max(...points.map((p) => p[1]));
  if (right <= left || bottom <= top) return;
  const area =
    Math.abs(
      points.reduce((sum, point, i) => {
        const next = points[(i + 1) % points.length]!;
        return sum + point[0] * next[1] - next[0] * point[1];
      }, 0),
    ) / 2;
  if (Math.abs(area - (right - left) * (bottom - top)) > 1e-7) return;
  const x = right - left < 1 ? Math.floor((left + right) / 2) : Math.round(left);
  const y = bottom - top < 1 ? Math.floor((top + bottom) / 2) : Math.round(top);
  return [x, y, Math.max(1, Math.round(right) - x), Math.max(1, Math.round(bottom) - y)] as const;
}
