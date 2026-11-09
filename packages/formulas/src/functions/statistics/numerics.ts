import type { FunctionContext } from "../../function-runtime.ts";
import { check, fail } from "./runtime.ts";

export const probability = (p: number) => p >= 0 && p <= 1;
export const clamp = (p: number) => Math.max(0, Math.min(1, p));
const coefficients = [
  676.5203681218851, -1259.1392167224028, 771.3234287776531, -176.6150291621406,
  12.507343278686905, -0.13857109526572012, 9.984369578019572e-6,
  1.5056327351493116e-7,
];
export function lg(z: number): number {
  if (z < 0.5)
    return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - lg(1 - z);
  z--;
  let x = 0.99999999999980993;
  for (let i = 0; i < coefficients.length; i++)
    x += coefficients[i]! / (z + i + 1);
  const t = z + 7.5;
  return 0.9189385332046727 + (z + 0.5) * Math.log(t) - t + Math.log(x);
}
export function beta(
  x: number,
  a: number,
  b: number,
  c: FunctionContext,
): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  if (x > (a + 1) / (a + b + 2)) return clamp(1 - beta(1 - x, b, a, c));
  const tiny = 1e-300;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d,
    cc = 1;
  for (let m = 1; m <= 1024; m++) {
    c.operation();
    let step = 0;
    for (const aa of [
      (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m)),
      (-(a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1)),
    ]) {
      d = 1 + aa * d;
      if (Math.abs(d) < tiny) d = tiny;
      cc = 1 + aa / cc;
      if (Math.abs(cc) < tiny) cc = tiny;
      d = 1 / d;
      const delta = d * cc;
      h *= delta;
      if (++step === 2 && Math.abs(delta - 1) < 2e-15)
        return clamp(
          (Math.exp(
            lg(a + b) - lg(a) - lg(b) + a * Math.log(x) + b * Math.log1p(-x),
          ) *
            h) /
            a,
        );
    }
  }
  return fail();
}
/** Regularized gamma, computing the requested tail directly to avoid cancellation. */
export function gamma(
  a: number,
  x: number,
  upper: boolean,
  c: FunctionContext,
): number {
  if (x === 0) return upper ? 1 : 0;
  if (!Number.isFinite(x)) return upper ? 0 : 1;
  // Avoid subtracting two values of order a*log(a) near the central region.
  const delta = (x - a) / a;
  const correction = 1 / (12 * a) - 1 / (360 * a ** 3) + 1 / (1260 * a ** 5);
  const logScale =
    a >= 16 && Math.abs(delta) < 0.5
      ? a * (Math.log1p(delta) - delta) +
        0.5 * Math.log(a / (2 * Math.PI)) -
        correction
      : a * Math.log(x) - x - lg(a);
  const scale = Math.exp(logScale);
  if (x < a + 1) {
    let term = 1 / a,
      sum = term;
    for (let i = 1; i <= 1_000_000; i++) {
      c.operation();
      term *= x / (a + i);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 2e-15)
        return clamp(upper ? 1 - sum * scale : sum * scale);
    }
  } else {
    let b = x + 1 - a,
      cc = 1e300,
      d = 1 / b,
      h = d;
    for (let i = 1; i <= 1_000_000; i++) {
      c.operation();
      const an = -i * (i - a);
      b += 2;
      d = an * d + b;
      if (Math.abs(d) < 1e-300) d = 1e-300;
      cc = b + an / cc;
      if (Math.abs(cc) < 1e-300) cc = 1e-300;
      d = 1 / d;
      const delta = d * cc;
      h *= delta;
      if (Math.abs(delta - 1) < 2e-15)
        return clamp(upper ? scale * h : 1 - scale * h);
    }
  }
  return c.unavailable("The incomplete gamma calculation did not converge.");
}
export function normalTail(x: number, c: FunctionContext): number {
  const q = gamma(0.5, (x * x) / 2, true, c) / 2;
  return x >= 0 ? q : 1 - q;
}
export function inverse(
  p: number,
  fn: (x: number) => number,
  c: FunctionContext,
  hi = 1,
  decreasing = false,
): number {
  let lo = 0;
  for (let i = 0; i < 1024 && (decreasing ? fn(hi) > p : fn(hi) < p); i++) {
    c.operation();
    hi *= 2;
    if (!Number.isFinite(hi)) return fail();
  }
  for (let i = 0; i < 1100; i++) {
    c.operation();
    const mid = lo + (hi - lo) / 2;
    if (mid === lo || mid === hi) return mid;
    if (decreasing ? fn(mid) > p : fn(mid) < p) lo = mid;
    else hi = mid;
    if (hi - lo < Math.max(Number.MIN_VALUE, Math.abs(mid) * 2e-15))
      return lo + (hi - lo) / 2;
  }
  return fail();
}
export function normInv(p: number, c: FunctionContext): number {
  check(p > 0 && p < 1);
  if (p === 0.5) return 0;
  return (
    (p < 0.5 ? -1 : 1) *
    inverse(Math.min(p, 1 - p), (x) => normalTail(x, c), c, 1, true)
  );
}
export function fTail(
  x: number,
  a: number,
  b: number,
  c: FunctionContext,
): number {
  return beta(1 / (1 + (a * x) / b), b / 2, a / 2, c);
}
export function tTail(x: number, df: number, c: FunctionContext): number {
  return x < Math.sqrt(df)
    ? (1 - beta((x * x) / (df + x * x), 0.5, df / 2, c)) / 2
    : beta(1 / (1 + (x * x) / df), df / 2, 0.5, c) / 2;
}
export function binom(
  k: number,
  n: number,
  p: number,
  c: FunctionContext,
): number {
  if (k >= n) return 1;
  if (p === 0) return 1;
  if (p === 1) return 0;
  return beta(1 - p, n - k, k + 1, c);
}
export function mass(k: number, n: number, p: number): number {
  if (p === 0) return k === 0 ? 1 : 0;
  if (p === 1) return k === n ? 1 : 0;
  return Math.exp(
    lg(n + 1) -
      lg(k + 1) -
      lg(n - k + 1) +
      k * Math.log(p) +
      (n - k) * Math.log1p(-p),
  );
}
