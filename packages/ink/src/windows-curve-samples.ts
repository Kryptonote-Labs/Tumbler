import { windowsInkBezier } from './windows-curve.ts';
import type { CurvePoint } from './windows-cusps.ts';
type Sample = CurvePoint & { r: number; angle: number };

/** Flatten fitted Windows ink while retaining analytic extrema and interpolating channel values by distance. */
export function fitWindowsInkCurve(samples: readonly Sample[], tolerance: number, maxPoints: number): Sample[] {
  if (samples.length < 3) return [...samples];
  const control = windowsInkBezier(samples);
  if (control.length < 4) return [...samples];
  const result: CurvePoint[] = [control[0]!];
  for (let i = 0; i + 3 < control.length; i += 3) {
    const a = control[i]!, b = control[i + 1]!, c = control[i + 2]!, d = control[i + 3]!;
    const at = (t: number): CurvePoint => { const u = 1 - t; return { x: u ** 3 * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t ** 3 * d.x, y: u ** 3 * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t ** 3 * d.y }; };
    const extrema = (key: 'x' | 'y') => {
      const aa = -a[key] + 3 * b[key] - 3 * c[key] + d[key], bb = 2 * (a[key] - 2 * b[key] + c[key]), cc = b[key] - a[key];
      if (Math.abs(aa) < 1e-12) return Math.abs(bb) < 1e-12 ? [] : [-cc / bb];
      const discriminant = bb * bb - 4 * aa * cc;
      return discriminant < 0 ? [] : [(-bb - Math.sqrt(discriminant)) / (2 * aa), (-bb + Math.sqrt(discriminant)) / (2 * aa)];
    };
    const flatten = (start: number, end: number, depth: number) => {
      const p = at(start), q = at(end);
      const error = [0.25, .5, .75].reduce((maximum, f) => { const value = at(start + (end - start) * f); return Math.max(maximum, Math.hypot(value.x - p.x - (q.x - p.x) * f, value.y - p.y - (q.y - p.y) * f)); }, 0);
      if (error <= tolerance || depth >= 20) {
        if (result.length >= maxPoints) throw new RangeError('Ink curve exceeds the configured point budget.');
        result.push(q); return;
      }
      flatten(start, (start + end) / 2, depth + 1); flatten((start + end) / 2, end, depth + 1);
    };
    const stops = [0, ...extrema('x'), ...extrema('y'), 1].filter(t => t >= 0 && t <= 1).sort((a, b) => a - b);
    for (let j = 1; j < stops.length; j++) if (stops[j]! > stops[j - 1]!) flatten(stops[j - 1]!, stops[j]!, 0);
  }
  const distance = (a: CurvePoint, b: CurvePoint) => Math.hypot(a.x - b.x, a.y - b.y);
  const nodes = [0];
  for (let i = 1; i < samples.length; i++) nodes.push(nodes.at(-1)! + distance(samples[i - 1]!, samples[i]!));
  let walked = 0, sample = 1;
  return result.map((point, i) => {
    if (i) walked += distance(result[i - 1]!, point);
    while (sample < samples.length - 1 && walked >= nodes[sample]!) sample++;
    const previous = samples[sample - 1]!, next = samples[sample]!;
    const ratio = i === result.length - 1 ? 1 : Math.min(1, Math.max(0, (walked - nodes[sample - 1]!) / (nodes[sample]! - nodes[sample - 1]! || 1)));
    return { ...point, r: previous.r + (next.r - previous.r) * ratio, angle: previous.angle + (next.angle - previous.angle) * ratio };
  });
}
