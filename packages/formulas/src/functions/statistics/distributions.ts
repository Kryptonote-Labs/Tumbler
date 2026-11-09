import { functionNumber } from "../../function-runtime.ts";
import { check, fail, registry, scalar } from "./runtime.ts";
import {
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
  probability,
} from "./numerics.ts";

// Older ECMA names and modern MS-XLSX names share implementations only where
// their signatures and semantics agree.
const aliases = {
  "BETA.INV": "BETAINV",
  "BINOM.DIST": "BINOMDIST",
  "BINOM.INV": "CRITBINOM",
  "CHISQ.DIST.RT": "CHIDIST",
  "CHISQ.INV.RT": "CHIINV",
  "CHISQ.TEST": "CHITEST",
  "CONFIDENCE.NORM": "CONFIDENCE",
  "EXPON.DIST": "EXPONDIST",
  "F.DIST.RT": "FDIST",
  "F.INV.RT": "FINV",
  "F.TEST": "FTEST",
  "GAMMA.DIST": "GAMMADIST",
  "GAMMA.INV": "GAMMAINV",
  "LOGNORM.INV": "LOGINV",
  "NORM.DIST": "NORMDIST",
  "NORM.INV": "NORMINV",
  "NORM.S.INV": "NORMSINV",
  "POISSON.DIST": "POISSON",
  "T.INV.2T": "TINV",
  "T.TEST": "TTEST",
  "WEIBULL.DIST": "WEIBULL",
  "Z.TEST": "ZTEST",
  "STDEV.S": "STDEV",
  "STDEV.P": "STDEVP",
  "VAR.S": "VAR",
  "VAR.P": "VARP",
  "PERCENTILE.INC": "PERCENTILE",
  "PERCENTRANK.INC": "PERCENTRANK",
  "QUARTILE.INC": "QUARTILE",
  "RANK.EQ": "RANK",
  "MODE.SNGL": "MODE",
  "COVARIANCE.P": "COVAR",
} as const;
for (const [modern, legacy] of Object.entries(aliases)) {
  const implementation = registry.get(legacy);
  if (!implementation)
    throw new Error(`Missing statistical implementation: ${legacy}`);
  registry.set(modern, implementation);
}
scalar(
  "BETA.DIST",
  4,
  6,
  ([x = 0, a = 0, b = 0, cumulative = 0, lo = 0, hi = 1], c) => {
    check(a > 0 && b > 0 && lo < hi && x >= lo && x <= hi);
    const z = (x - lo) / (hi - lo);
    if (cumulative) return beta(z, a, b, c);
    if (z === 0) return a === 1 ? b / (hi - lo) : a > 1 ? 0 : fail();
    if (z === 1) return b === 1 ? a / (hi - lo) : b > 1 ? 0 : fail();
    return (
      Math.exp(
        (a - 1) * Math.log(z) +
          (b - 1) * Math.log1p(-z) +
          lg(a + b) -
          lg(a) -
          lg(b),
      ) /
      (hi - lo)
    );
  },
);
scalar("BETA.INV", 3, 5, ([p = 0, a = 0, b = 0, lo = 0, hi = 1], c) => {
  check(probability(p) && a > 0 && b > 0 && lo < hi);
  return p === 0
    ? lo
    : p === 1
      ? hi
      : lo + (hi - lo) * inverse(p, (x) => beta(x, a, b, c), c);
});
scalar("BINOM.INV", 3, 3, ([n = 0, p = 0, alpha = 0], c) => {
  n = Math.trunc(n);
  check(n >= 0 && probability(p) && probability(alpha));
  if (alpha === 0 || p === 0) return 0;
  if (p === 1) return n;
  let lo = 0,
    hi = n;
  while (lo < hi) {
    c.operation();
    const mid = lo + Math.floor((hi - lo) / 2);
    if (binom(mid, n, p, c) >= alpha) hi = mid;
    else lo = mid + 1;
  }
  return lo;
});
scalar("BINOM.DIST.RANGE", 3, 4, ([n = 0, p = 0, lo = 0, hi = lo], c) => {
  n = Math.trunc(n);
  lo = Math.trunc(lo);
  hi = Math.trunc(hi);
  check(n >= 0 && probability(p) && lo >= 0 && hi >= lo && hi <= n);
  // Sum the requested interval directly, retaining narrow far-tail probabilities.
  let total = 0;
  for (let k = lo; k <= hi; k++) {
    c.operation();
    total += mass(k, n, p);
  }
  return Math.min(1, total);
});
scalar("CHISQ.DIST", 3, 3, ([x = 0, df = 0, cumulative = 0], c) => {
  df = Math.trunc(df);
  check(x >= 0 && df >= 1 && df <= 1e10);
  if (cumulative) return gamma(df / 2, x / 2, false, c);
  if (x === 0) return df === 2 ? 0.5 : df > 2 ? 0 : fail("#DIV/0!");
  return Math.exp((df / 2 - 1) * Math.log(x / 2) - x / 2 - lg(df / 2)) / 2;
});
scalar("CHISQ.INV", 2, 2, ([p = 0, df = 0], c) => {
  df = Math.trunc(df);
  check(p >= 0 && p < 1 && df >= 1 && df <= 1e10);
  return p === 0 ? 0 : inverse(p, (x) => gamma(df / 2, x / 2, false, c), c, df);
});
scalar("CONFIDENCE.T", 3, 3, ([alpha = 0, s = 0, n = 0], c) => {
  n = Math.trunc(n);
  check(alpha > 0 && alpha < 1 && s > 0 && n >= 1);
  check(n > 1, "#DIV/0!");
  return (
    (inverse(alpha / 2, (x) => tTail(x, n - 1, c), c, 1, true) * s) /
    Math.sqrt(n)
  );
});
scalar("F.DIST", 4, 4, ([x = 0, a = 0, b = 0, cumulative = 0], c) => {
  a = Math.trunc(a);
  b = Math.trunc(b);
  check(x >= 0 && a >= 1 && b >= 1 && a < 1e10 && b < 1e10);
  if (cumulative) return beta(1 / (1 + b / (a * x)), a / 2, b / 2, c);
  if (x === 0) return a === 2 ? 1 : a > 2 ? 0 : fail("#DIV/0!");
  return Math.exp(
    (a / 2) * Math.log(a / b) +
      (a / 2 - 1) * Math.log(x) -
      ((a + b) / 2) * Math.log1p((a * x) / b) +
      lg((a + b) / 2) -
      lg(a / 2) -
      lg(b / 2),
  );
});
scalar("F.INV", 3, 3, ([p = 0, a = 0, b = 0], c) => {
  a = Math.trunc(a);
  b = Math.trunc(b);
  check(p >= 0 && p < 1 && a >= 1 && b >= 1 && a < 1e10 && b < 1e10);
  return p === 0
    ? 0
    : inverse(p, (x) => beta(1 / (1 + b / (a * x)), a / 2, b / 2, c), c);
});
scalar("GAMMA", 1, 1, ([x = 0]) => {
  check(!(x <= 0 && x === Math.trunc(x)));
  return x > 0
    ? Math.exp(lg(x))
    : Math.PI / (Math.sin(Math.PI * x) * Math.exp(lg(1 - x)));
});
for (const name of ["GAMMALN", "GAMMALN.PRECISE"])
  scalar(name, 1, 1, ([x = 0]) => {
    check(x > 0);
    return lg(x);
  });
scalar("GAMMA.DIST", 4, 4, ([x = 0, a = 0, b = 0, cumulative = 0], c) => {
  check(x >= 0 && a > 0 && b > 0);
  if (cumulative) return gamma(a, x / b, false, c);
  if (x === 0) return a === 1 ? 1 / b : a > 1 ? 0 : fail("#DIV/0!");
  return Math.exp((a - 1) * Math.log(x) - x / b - lg(a) - a * Math.log(b));
});
scalar(
  "GAUSS",
  1,
  1,
  ([x = 0], c) => (Math.sign(x) * gamma(0.5, (x * x) / 2, false, c)) / 2,
);
scalar(
  "PHI",
  1,
  1,
  ([x = 0]) => Math.exp((-x * x) / 2) / Math.sqrt(2 * Math.PI),
);
scalar("NORM.S.DIST", 2, 2, ([x = 0, cumulative = 0], c) =>
  cumulative
    ? normalTail(-x, c)
    : Math.exp((-x * x) / 2) / Math.sqrt(2 * Math.PI),
);
scalar("LOGNORM.DIST", 4, 4, ([x = 0, mean = 0, s = 0, cumulative = 0], c) => {
  check(x > 0 && s > 0);
  const z = (Math.log(x) - mean) / s;
  return cumulative
    ? normalTail(-z, c)
    : Math.exp((-z * z) / 2) / (x * s * Math.sqrt(2 * Math.PI));
});
scalar("NEGBINOM.DIST", 4, 4, ([k = 0, r = 0, p = 0, cumulative = 0], c) => {
  k = Math.trunc(k);
  r = Math.trunc(r);
  check(k >= 0 && r >= 1 && probability(p));
  if (p === 0) return 0;
  if (p === 1) return cumulative || k === 0 ? 1 : 0;
  return cumulative
    ? beta(p, r, k + 1, c)
    : Math.exp(
        lg(k + r) - lg(k + 1) - lg(r) + r * Math.log(p) + k * Math.log1p(-p),
      );
});
scalar(
  "HYPGEOM.DIST",
  5,
  5,
  ([k = 0, n = 0, m = 0, N = 0, cumulative = 0], c) => {
    k = Math.trunc(k);
    n = Math.trunc(n);
    m = Math.trunc(m);
    N = Math.trunc(N);
    check(
      N > 0 &&
        n >= 0 &&
        n <= N &&
        m >= 0 &&
        m <= N &&
        k >= Math.max(0, n - N + m) &&
        k <= Math.min(n, m),
    );
    const choose = (a: number, b: number) =>
      lg(a + 1) - lg(b + 1) - lg(a - b + 1);
    const pmf = (j: number) =>
      Math.exp(choose(m, j) + choose(N - m, n - j) - choose(N, n));
    if (!cumulative) return pmf(k);
    let sum = 0;
    for (let j = Math.max(0, n - N + m); j <= k; j++) {
      c.operation();
      sum += pmf(j);
    }
    return Math.min(1, sum);
  },
);
scalar("T.DIST", 3, 3, ([x = 0, df = 0, cumulative = 0], c) => {
  df = Math.trunc(df);
  check(df >= 1);
  if (cumulative) return x < 0 ? tTail(-x, df, c) : 1 - tTail(x, df, c);
  return Math.exp(
    lg((df + 1) / 2) -
      lg(df / 2) -
      0.5 * Math.log(df * Math.PI) -
      ((df + 1) / 2) * Math.log1p((x * x) / df),
  );
});
scalar("T.DIST.RT", 2, 2, ([x = 0, df = 0], c) => {
  df = Math.trunc(df);
  check(df >= 1);
  return x < 0 ? 1 - tTail(-x, df, c) : tTail(x, df, c);
});
scalar("T.DIST.2T", 2, 2, ([x = 0, df = 0], c) => {
  df = Math.trunc(df);
  check(x >= 0 && df >= 1);
  return 2 * tTail(x, df, c);
});
scalar("T.INV", 2, 2, ([p = 0, df = 0], c) => {
  df = Math.trunc(df);
  check(p > 0 && p < 1 && df >= 1);
  return p === 0.5
    ? 0
    : (p < 0.5 ? -1 : 1) *
        inverse(Math.min(p, 1 - p), (x) => tTail(x, df, c), c, 1, true);
});
scalar("FISHER", 1, 1, ([x = 0]) => {
  check(Math.abs(x) < 1);
  return Math.atanh(x);
});
scalar("FISHERINV", 1, 1, ([x = 0]) => Math.tanh(x));
scalar("STANDARDIZE", 3, 3, ([x = 0, m = 0, s = 0]) => {
  check(s > 0);
  return (x - m) / s;
});
scalar("PERMUT", 2, 2, ([n = 0, k = 0], c) => {
  n = Math.trunc(n);
  k = Math.trunc(k);
  check(n > 0 && k >= 0 && k <= n);
  let result = 1;
  for (let i = 0; i < k; i++) {
    c.operation();
    result *= n - i;
    if (!Number.isFinite(result)) return fail();
  }
  return result;
});
scalar("PERMUTATIONA", 2, 2, ([n = 0, k = 0]) => {
  n = Math.trunc(n);
  k = Math.trunc(k);
  check(n >= 0 && k >= 0);
  return n ** k;
});
