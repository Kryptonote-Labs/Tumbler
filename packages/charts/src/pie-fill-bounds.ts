import type { ChartRect } from './layout.ts';

/** Office stretches pictures to the individual wedge's bounds, including its inner arc. */
export function pieFillBounds(cx: number, cy: number, outer: number, inner: number, start: number, end: number, tilt = 1): ChartRect {
  const angles = [start, end], turn = Math.PI * 2;
  for (let quarter = 0; quarter < 4; quarter++) {
    const angle = quarter * Math.PI / 2, first = Math.ceil((start - angle) / turn), last = Math.floor((end - angle) / turn);
    if (first <= last) angles.push(angle + first * turn);
  }
  const points = angles.flatMap(angle => [outer, inner].map(radius => ({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius * tilt })));
  const x = Math.min(...points.map(point => point.x)), y = Math.min(...points.map(point => point.y));
  return { x, y, width: Math.max(...points.map(point => point.x)) - x, height: Math.max(...points.map(point => point.y)) - y };
}
