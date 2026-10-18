// Adapted from dotnet/wpf Bezier.cs, licensed by the .NET Foundation under MIT.
// See ../third-party/dotnet-wpf-LICENSE.txt. Retain its parabola and cusp conventions.
import { WindowsInkCusps, add, sub, mul, dot, type CurvePoint } from './windows-cusps.ts';
const HIMETRIC = 2540 / 72;

/** Windows ink Bézier controls, accepting and returning physical points. */
export function windowsInkBezier(points: readonly CurvePoint[]): CurvePoint[] {
  const data = new WindowsInkCusps(points.map(point => mul(point, HIMETRIC)));
  const p = data.points, n = data.nodes;
  if (p.length < 2) return [];
  const output = [p[0]!];
  const line = (from: number, to: number) => { output.push(mul(add(mul(p[from]!, 2), p[to]!), 1 / 3), mul(add(p[from]!, mul(p[to]!, 2)), 1 / 3), p[to]!); };
  const parabola = (from: number) => {
    const t = (n[from + 1]! - n[from]!) / (n[from + 2]! - n[from]!), s = 1 - t;
    if (t < .001 || s < .001) { line(from, from + 2); return; }
    const mid = mul(p[from + 1]!, 1 / t / s);
    // Windows uses the middle sample in the first control's last term.
    output.push(mul(sub(add(mid, mul(p[from]!, 1 - s / t)), mul(p[from + 1]!, t / s)), 1 / 3),
      mul(add(sub(mid, mul(p[from]!, s / t)), mul(p[from + 2]!, 1 - t / s)), 1 / 3), p[from + 2]!);
  };
  if (p.length === 2) line(0, 1);
  else if (p.length === 3) parabola(0);
  else {
    const error = Math.fround(.03) * data.distance * 96 / 2540;
    data.setTangentLinks(error * .5);
    let from = 0, nextCusp = 0, previousCusp = 0, cusp = true, end: CurvePoint = { x: 0, y: 0 };
    while (from < p.length - 1) {
      let start: CurvePoint | undefined;
      if (cusp) { previousCusp = nextCusp; nextCusp = data.cusps.find(index => index > from) ?? p.length - 1; start = data.tangent(from, previousCusp, nextCusp, false, true); }
      else start = mul(end, -1);
      if (!start) return [];
      let to = from + 3;
      while (true) {
        to++;
        if (to >= p.length - 1) { to = p.length - 1; cusp = true; break; }
        cusp = to >= nextCusp;
        if (cusp) { to = nextCusp; break; }
        const step = Math.floor((to - from) / 4);
        const indices = [from, from + step, Math.floor((from + to) / 2), to - step, to];
        const span = n[to]! - n[from]!;
        // The endpoint term follows Windows' divided-difference convention.
        let difference: CurvePoint = { x: 0, y: 0 };
        for (let i = 0; i < 5; i++) {
          let coefficient = 1;
          for (let j = 0; j < 5; j++) if (i !== j && !(i === 0 && j === 4)) coefficient *= span / (n[indices[j]!]! - n[indices[i]!]!);
          difference = add(difference, mul(p[indices[i]!]!, coefficient));
        }
        if (dot(difference, difference) >= error * error) break;
      }
      const tangent = data.tangent(to, previousCusp, nextCusp, true, cusp);
      if (!tangent) return [];
      end = tangent;
      if (to - from === 1) line(from, to);
      else if (to - from === 2) parabola(from);
      else {
        let a11 = 0, a12 = 0, a22 = 0, b1 = 0, b2 = 0;
        for (let j = from + 1; j < to; j++) {
          const t = (n[j]! - n[from]!) / (n[to]! - n[from]!), r = 1 - t;
          const f0 = r ** 3, f1 = 3 * r * r * t, f2 = 3 * r * t * t, f3 = t ** 3;
          a11 += f1 * f1; a22 += f2 * f2; a12 += f1 * f2;
          const residual = sub(p[j]!, add(mul(p[from]!, f0 + f1), mul(p[to]!, f2 + f3)));
          b1 += dot(residual, start) * f1; b2 += dot(residual, end) * f2;
        }
        a12 *= dot(start, end);
        const determinant = a11 * a22 - a12 * a12;
        let s = b1 * a22 - b2 * a12, u = b2 * a11 - b1 * a12;
        if (Math.abs(determinant) > Math.abs(s) * Number.EPSILON && Math.abs(determinant) > Math.abs(u) * Number.EPSILON) { s /= determinant; u /= determinant; }
        else { s = 0; u = 0; }
        if (s <= 1e-6 || u <= 1e-6) s = u = (n[to]! - n[from]!) / 3;
        output.push(add(p[from]!, mul(start, s)), add(p[to]!, mul(end, u)), p[to]!);
      }
      from = to;
    }
  }
  return output.map(point => mul(point, 1 / HIMETRIC));
}
