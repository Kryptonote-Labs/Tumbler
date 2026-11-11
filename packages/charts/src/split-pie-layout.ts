import type { ChartRect } from './layout.ts';
import type { SupportedChartModel } from './model.ts';

/** Fit both plots together. Office measures the gap in primary-pie radii. */
export function splitPieFrames(model: SupportedChartModel, width: number, height: number) {
  const size = Math.max(.05, Math.min(2, (model.secondPieSize ?? 75) / 100));
  const gap = Math.max(0, Math.min(5, (model.gapWidth ?? 100) / 100));
  const secondaryWidth = (model.splitType === 'bar' ? 1 : 2) * size;
  const extent = 2 + gap + secondaryWidth;
  const radius = Math.max(0, Math.min(width / extent, height / (2 * Math.max(1, size))));
  const x = (width - extent * radius) / 2, cy = height / 2;
  const primary: ChartRect = { x, y: cy - radius, width: radius * 2, height: radius * 2 };
  const secondary: ChartRect = { x: x + (2 + gap) * radius, y: cy - size * radius, width: secondaryWidth * radius, height: size * radius * 2 };
  return { primary, secondary };
}

/** Connect the combined wedge to the secondary plot without crossing either pie. */
export function splitPieConnectors(primary: ChartRect, secondary: ChartRect, fraction: number, bar: boolean) {
  const radius = primary.width / 2, smallRadius = secondary.height / 2;
  const cx = primary.x + radius, cy = primary.y + radius;
  const right = bar ? secondary.x : secondary.x + secondary.width / 2;
  const distance = right - cx;
  if (radius <= 0 || smallRadius <= 0 || distance <= 0) return [];
  const tangent = bar
    ? Math.atan2(smallRadius, distance) + Math.acos(Math.min(1, radius / Math.hypot(distance, smallRadius)))
    : Math.acos(Math.max(-1, Math.min(1, (radius - smallRadius) / distance)));
  const angle = Math.min(Math.max(0, fraction) * Math.PI, tangent);
  const x1 = cx + Math.cos(angle) * radius, upper = cy - Math.sin(angle) * radius;
  let x2 = right, y2 = cy - smallRadius;
  if (!bar) {
    const px = x1 - right, py = upper - cy, squared = px * px + py * py;
    if (squared > 0) {
      const scale = smallRadius * smallRadius / squared;
      const tangentScale = smallRadius * Math.sqrt(Math.max(0, squared - smallRadius * smallRadius)) / squared;
      const candidates = [-1, 1].map(sign => ({ x: right + scale * px - sign * tangentScale * py, y: cy + scale * py + sign * tangentScale * px }));
      const top = candidates[0]!.y < candidates[1]!.y ? candidates[0]! : candidates[1]!;
      x2 = top.x; y2 = top.y;
    }
  }
  return [{ x1, y1: upper, x2, y2 }, { x1, y1: 2 * cy - upper, x2, y2: 2 * cy - y2 }];
}
