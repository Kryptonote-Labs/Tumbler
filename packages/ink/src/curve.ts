/** A deterministic interpolating cubic for Office's fitToCurve flag.
 * InkML specifies curved rendering, not a particular fitting algorithm. Repeated
 * samples and sharp turns stay endpoints rather than creating loops at cusps.
 */
export function fitInkCurve(points: readonly { x: number; y: number; r: number; angle: number }[], tolerance = 0.05, maxPoints = Infinity) {
  if (points.length < 3) return [...points];
  const result = [points[0]!];
  for (let index = 0; index < points.length - 1; index++) {
    const a = points[Math.max(0, index - 1)]!, b = points[index]!, c = points[index + 1]!, d = points[Math.min(points.length - 1, index + 2)]!;
    const control = (p: typeof a, q: typeof a, r: typeof a, forward: boolean) => {
      const ux = q.x - p.x, uy = q.y - p.y, vx = r.x - q.x, vy = r.y - q.y;
      const before = Math.hypot(ux, uy), after = Math.hypot(vx, vy);
      if (!before || !after || (ux * vx + uy * vy) / (before * after) < 0.5) return q;
      const distance = (forward ? after : before) / 3;
      const tx = ux / before + vx / after, ty = uy / before + vy / after, length = Math.hypot(tx, ty);
      return { ...q, x: q.x + (forward ? 1 : -1) * tx / length * distance, y: q.y + (forward ? 1 : -1) * ty / length * distance };
    };
    const p = control(a, b, c, true), q = control(b, c, d, false);
    const flatten = (t0: number, t1: number, start: typeof b, end: typeof b, depth: number) => {
      const t = (t0 + t1) / 2, u = 1 - t;
      const middle = { x: u ** 3 * b.x + 3 * u * u * t * p.x + 3 * u * t * t * q.x + t ** 3 * c.x,
        y: u ** 3 * b.y + 3 * u * u * t * p.y + 3 * u * t * t * q.y + t ** 3 * c.y,
        r: b.r + (c.r - b.r) * t, angle: b.angle + (c.angle - b.angle) * t };
      // Check quarter points too: an S curve can have its midpoint on the chord.
      const quarter = (at: number) => { const v = 1 - at; return { x: v ** 3 * b.x + 3 * v * v * at * p.x + 3 * v * at * at * q.x + at ** 3 * c.x,
        y: v ** 3 * b.y + 3 * v * v * at * p.y + 3 * v * at * at * q.y + at ** 3 * c.y }; };
      const error = [0.25, 0.5, 0.75].reduce((max, fraction) => { const value = quarter(t0 + (t1 - t0) * fraction); return Math.max(max, Math.hypot(value.x - (start.x + (end.x - start.x) * fraction), value.y - (start.y + (end.y - start.y) * fraction))); }, 0);
      if (error <= tolerance || depth === 20) { if (result.length >= maxPoints) throw new RangeError('Ink curve exceeds the configured point budget.'); result.push(end); return; }
      flatten(t0, t, start, middle, depth + 1); flatten(t, t1, middle, end, depth + 1);
    };
    flatten(0, 1, b, c, 0);
  }
  return result;
}
