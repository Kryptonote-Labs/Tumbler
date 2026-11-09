import { functionMatrix } from "../../function-runtime.ts";
import {
  scalar,
  register,
  check,
  fail,
  numeric,
  values,
  data,
  moments,
  isOmitted,
  ExcelError,
} from "./runtime.ts";
import {
  probability,
  beta,
  gamma,
  lg,
  inverse,
  normInv,
  normalTail,
  fTail,
  tTail,
  binom,
  mass,
} from "./numerics.ts";

scalar("BETADIST", 3, 5, ([x = 0, a = 0, b = 0, lo = 0, hi = 1], c) => {
  check(a > 0 && b > 0 && lo < hi && x >= lo && x <= hi);
  return beta((x - lo) / (hi - lo), a, b, c);
});
scalar("BETAINV", 3, 5, ([p = 0, a = 0, b = 0, lo = 0, hi = 1], c) => {
  check(p > 0 && p < 1 && a > 0 && b > 0 && lo < hi);
  return lo + (hi - lo) * inverse(p, (x) => beta(x, a, b, c), c);
});
scalar("BINOMDIST", 4, 4, ([k = 0, n = 0, p = 0, cum = 0], c) => {
  k = Math.trunc(k);
  n = Math.trunc(n);
  check(n >= 0 && k >= 0 && k <= n && probability(p));
  return cum ? binom(k, n, p, c) : mass(k, n, p);
});
scalar("CRITBINOM", 3, 3, ([n = 0, p = 0, a = 0], c) => {
  n = Math.trunc(n);
  check(n >= 0 && p > 0 && p < 1 && a > 0 && a < 1);
  let lo = 0,
    hi = n;
  for (let i = 0; i < 1024 && lo < hi; i++) {
    c.operation();
    const mid = lo + Math.floor((hi - lo) / 2);
    if (binom(mid, n, p, c) >= a) hi = mid;
    else lo = mid + 1;
  }
  return lo;
});
scalar("CHIDIST", 2, 2, ([x = 0, df = 0], c) => {
  df = Math.trunc(df);
  check(x >= 0 && df >= 1 && df <= 1e10);
  return gamma(df / 2, x / 2, true, c);
});
scalar("CHIINV", 2, 2, ([p = 0, df = 0], c) => {
  df = Math.trunc(df);
  check(p > 0 && p <= 1 && df >= 1 && df <= 1e10);
  return p === 1
    ? 0
    : inverse(p, (x) => gamma(df / 2, x / 2, true, c), c, df, true);
});
scalar("CONFIDENCE", 3, 3, ([a = 0, s = 0, n = 0], c) => {
  n = Math.trunc(n);
  check(a > 0 && a < 1 && s > 0 && n >= 1);
  return (-normInv(a / 2, c) * s) / Math.sqrt(n);
});
scalar("EXPONDIST", 3, 3, ([x = 0, rate = 0, cum = 0]) => {
  check(x >= 0 && rate > 0);
  return cum ? -Math.expm1(-rate * x) : rate * Math.exp(-rate * x);
});
for (const name of ["FDIST", "FINV"])
  scalar(name, 3, 3, ([x = 0, a = 0, b = 0], c) => {
    a = Math.trunc(a);
    b = Math.trunc(b);
    check(a >= 1 && b >= 1 && a < 1e10 && b < 1e10);
    if (name === "FDIST") {
      check(x >= 0);
      return fTail(x, a, b, c);
    }
    check(x > 0 && x <= 1);
    return x === 1 ? 0 : inverse(x, (z) => fTail(z, a, b, c), c, 1, true);
  });
scalar("GAMMADIST", 4, 4, ([x = 0, a = 0, b = 0, cum = 0], c) => {
  check(x >= 0 && a > 0 && b > 0);
  if (cum) return gamma(a, x / b, false, c);
  if (x === 0) return a > 1 ? 0 : fail();
  return Math.exp((a - 1) * Math.log(x) - x / b - lg(a) - a * Math.log(b));
});
scalar("GAMMAINV", 3, 3, ([p = 0, a = 0, b = 0], c) => {
  check(probability(p) && p < 1 && a > 0 && b > 0);
  return p === 0
    ? 0
    : inverse(p, (x) => gamma(a, x, false, c), c, Math.max(1, a)) * b;
});
scalar("HYPGEOMDIST", 4, 4, ([k = 0, n = 0, m = 0, N = 0]) => {
  k = Math.trunc(k);
  n = Math.trunc(n);
  m = Math.trunc(m);
  N = Math.trunc(N);
  check(N > 0 && n >= 0 && n <= N && m >= 0 && m <= N && k >= 0);
  if (k < Math.max(0, n - N + m) || k > Math.min(n, m)) return 0;
  const choose = (a: number, b: number) =>
    lg(a + 1) - lg(b + 1) - lg(a - b + 1);
  return Math.exp(choose(m, k) + choose(N - m, n - k) - choose(N, n));
});
scalar("LOGINV", 3, 3, ([p = 0, m = 0, s = 0], c) => {
  check(s > 0);
  return Math.exp(m + s * normInv(p, c));
});
scalar("LOGNORMDIST", 3, 3, ([x = 0, m = 0, s = 0], c) => {
  check(x > 0 && s > 0);
  return normalTail(-(Math.log(x) - m) / s, c);
});
scalar("NEGBINOMDIST", 3, 3, ([k = 0, r = 0, p = 0]) => {
  k = Math.trunc(k);
  r = Math.trunc(r);
  check(k >= 0 && r >= 1 && probability(p));
  if (p === 0) return 0;
  if (p === 1) return k === 0 ? 1 : 0;
  return Math.exp(
    lg(k + r) - lg(k + 1) - lg(r) + r * Math.log(p) + k * Math.log1p(-p),
  );
});
scalar("NORMDIST", 4, 4, ([x = 0, m = 0, s = 0, cum = 0], c) => {
  check(s > 0);
  const z = (x - m) / s;
  return cum
    ? normalTail(-z, c)
    : Math.exp((-z * z) / 2) / Math.sqrt(2 * Math.PI) / s;
});
scalar("NORMINV", 3, 3, ([p = 0, m = 0, s = 0], c) => {
  check(s > 0);
  return m + s * normInv(p, c);
});
scalar("NORMSDIST", 1, 1, ([x = 0], c) => normalTail(-x, c));
scalar("NORMSINV", 1, 1, ([p = 0], c) => normInv(p, c));
scalar("POISSON", 3, 3, ([x = 0, m = 0, cum = 0], c) => {
  x = Math.trunc(x);
  check(x >= 0 && m >= 0);
  if (m === 0) return cum || x === 0 ? 1 : 0;
  return cum
    ? gamma(x + 1, m, true, c)
    : Math.exp(x * Math.log(m) - m - lg(x + 1));
});
scalar("TDIST", 3, 3, ([x = 0, df = 0, t = 0], c) => {
  df = Math.trunc(df);
  t = Math.trunc(t);
  check(x >= 0 && df >= 1 && (t === 1 || t === 2));
  // Excel's legacy df=1/2 paths retain rounding from the upper-beta argument.
  // Keep the stable helper for inverses/tests and the higher-degree paths.
  if (df <= 2) return (t * beta(df / (df + x * x), df / 2, 0.5, c)) / 2;
  return t * tTail(x, df, c);
});
scalar("TINV", 2, 2, ([p = 0, df = 0], c) => {
  df = Math.trunc(df);
  check(p > 0 && p <= 1 && df >= 1);
  return p === 1 ? 0 : inverse(p / 2, (x) => tTail(x, df, c), c, 1, true);
});
scalar("WEIBULL", 4, 4, ([x = 0, a = 0, b = 0, cum = 0]) => {
  check(x >= 0 && a > 0 && b > 0);
  const logRatio = Math.log(x) - Math.log(b);
  const power = Math.exp(a * logRatio);
  if (cum) return -Math.expm1(-power);
  if (x === 0) return 0;
  return Math.exp(Math.log(a) - Math.log(b) + (a - 1) * logRatio - power);
});
