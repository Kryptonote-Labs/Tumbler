import type { FormulaExpression } from "../ast.ts";
import type { FormulaScalarValue } from "../evaluator.ts";
import {
  functionError,
  functionNumber,
  functionNumeric,
  functionScalar,
  functionMatrix,
  type FunctionContext,
  type FunctionRegistry,
  type FunctionValue,
  type ExtendedFunction,
} from "../function-runtime.ts";

// All numeric iterations are finite and charged to the caller's operation budget.
class ExcelError {
  constructor(readonly value: FormulaScalarValue) {}
}
const fail = (code: `#${string}` = "#NUM!"): never => {
  throw new ExcelError(functionError(code));
};
const check = (condition: boolean, code: `#${string}` = "#NUM!") => {
  if (!condition) fail(code);
};
const probability = (p: number) => p >= 0 && p <= 1;
const clamp = (p: number) => Math.max(0, Math.min(1, p));
const coefficients = [
  676.5203681218851, -1259.1392167224028, 771.3234287776531, -176.6150291621406,
  12.507343278686905, -0.13857109526572012, 9.984369578019572e-6,
  1.5056327351493116e-7,
];
function lg(z: number): number {
  if (z < 0.5)
    return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - lg(1 - z);
  z--;
  let x = 0.99999999999980993;
  for (let i = 0; i < coefficients.length; i++)
    x += coefficients[i]! / (z + i + 1);
  const t = z + 7.5;
  return 0.9189385332046727 + (z + 0.5) * Math.log(t) - t + Math.log(x);
}
function beta(x: number, a: number, b: number, c: FunctionContext): number {
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
function gamma(
  a: number,
  x: number,
  upper: boolean,
  c: FunctionContext,
): number {
  if (x === 0) return upper ? 1 : 0;
  if (!Number.isFinite(x)) return upper ? 0 : 1;
  const scale = Math.exp(a * Math.log(x) - x - lg(a));
  if (x < a + 1) {
    let term = 1 / a,
      sum = term;
    for (let i = 1; i <= 4096; i++) {
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
    for (let i = 1; i <= 4096; i++) {
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
  return fail();
}
function normalTail(x: number, c: FunctionContext): number {
  const q = gamma(0.5, (x * x) / 2, true, c) / 2;
  return x >= 0 ? q : 1 - q;
}
function inverse(
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
function normInv(p: number, c: FunctionContext): number {
  check(p > 0 && p < 1);
  if (p === 0.5) return 0;
  return (
    (p < 0.5 ? -1 : 1) *
    inverse(Math.min(p, 1 - p), (x) => normalTail(x, c), c, 1, true)
  );
}
function fTail(x: number, a: number, b: number, c: FunctionContext): number {
  return beta(1 / (1 + (a * x) / b), b / 2, a / 2, c);
}
function tTail(x: number, df: number, c: FunctionContext): number {
  return x < Math.sqrt(df)
    ? (1 - beta((x * x) / (df + x * x), 0.5, df / 2, c)) / 2
    : beta(1 / (1 + (x * x) / df), df / 2, 0.5, c) / 2;
}
function binom(k: number, n: number, p: number, c: FunctionContext): number {
  if (k >= n) return 1;
  if (p === 0) return 1;
  if (p === 1) return 0;
  return beta(1 - p, n - k, k + 1, c);
}
function mass(k: number, n: number, p: number): number {
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
function isOmitted(v: FunctionValue): boolean {
  return "kind" in v && (v.kind as string) === "omitted";
}
function numeric(v: FunctionValue): number {
  if (isOmitted(v)) return 0;
  const n = functionNumeric(functionScalar(v));
  if (n.type === "error") throw new ExcelError(n);
  return n.type === "number" ? n.value : fail("#VALUE!");
}
function values(v: FunctionValue, c: FunctionContext): FormulaScalarValue[] {
  if (isOmitted(v)) return [];
  const rows = functionMatrix(v);
  let size = 0;
  for (const row of rows) {
    size += row.length;
    check(size <= c.maxArrayCells, "#NUM!");
  }
  c.operation(size);
  return rows.flat();
}
function data(v: FunctionValue, c: FunctionContext, literal = false): number[] {
  const out: number[] = [];
  for (const x of values(v, c)) {
    if (x.type === "error") throw new ExcelError(x);
    if (x.type === "number") out.push(x.value);
    else if (literal && x.type !== "blank") out.push(numeric(x));
  }
  return out;
}
function moments(xs: number[], sample: boolean): [number, number] {
  check(xs.length > (sample ? 1 : 0), "#DIV/0!");
  let mean = 0,
    m2 = 0;
  for (let i = 0; i < xs.length; i++) {
    const d = xs[i]! - mean;
    mean += d / (i + 1);
    m2 += d * (xs[i]! - mean);
  }
  return [mean, m2 / (xs.length - (sample ? 1 : 0))];
}
const registry = new Map<string, ExtendedFunction>();
function register(
  name: string,
  min: number,
  max: number,
  fn: (
    v: FunctionValue[],
    c: FunctionContext,
    args: readonly FormulaExpression[],
  ) => number | FunctionValue,
): void {
  registry.set(name, (args, c) => {
    try {
      check(args.length >= min && args.length <= max, "#VALUE!");
      c.operation(args.length);
      const evaluated = args.map((x) => c.evaluate(x));
      for (const value of evaluated)
        if (!("kind" in value) && value.type === "error")
          throw new ExcelError(value);
      const result = fn(evaluated, c, args);
      return typeof result === "number" ? functionNumber(result) : result;
    } catch (e) {
      if (e instanceof ExcelError) return e.value;
      throw e;
    }
  });
}
function scalar(
  name: string,
  min: number,
  max: number,
  fn: (v: (number | undefined)[], c: FunctionContext) => number,
) {
  register(name, min, max, (v, c) => {
    const calculate = (args: FunctionValue[]) =>
      fn(
        args.map((x) => (isOmitted(x) ? undefined : numeric(x))),
        c,
      );
    if (!v.some((x) => "kind" in x && x.kind === "array")) return calculate(v);
    const matrices = v.map((x) =>
      "kind" in x && x.kind === "array" ? x.rows : undefined,
    );
    const height = Math.max(1, ...matrices.map((x) => x?.length ?? 1));
    const width = Math.max(1, ...matrices.map((x) => x?.[0]?.length ?? 1));
    check(height * width <= c.maxArrayCells);
    c.operation(height * width * v.length);
    const rows: FormulaScalarValue[][] = [];
    for (let row = 0; row < height; row++) {
      const output: FormulaScalarValue[] = [];
      for (let col = 0; col < width; col++) {
        try {
          const args = v.map((value, i) => {
            const matrix = matrices[i];
            if (!matrix) return value;
            const r = matrix[matrix.length === 1 ? 0 : row];
            return r?.[r.length === 1 ? 0 : col] ?? functionError("#N/A");
          });
          output.push(functionNumber(calculate(args)));
        } catch (e) {
          if (!(e instanceof ExcelError)) throw e;
          output.push(e.value);
        }
      }
      rows.push(output);
    }
    return { kind: "array", rows };
  });
}
scalar("BETADIST", 3, 5, ([x = 0, a = 0, b = 0, lo = 0, hi = 1], c) => {
  check(a > 0 && b > 0 && lo < hi && x >= lo && x <= hi);
  return beta((x - lo) / (hi - lo), a, b, c);
});
scalar("BETAINV", 3, 5, ([p = 0, a = 0, b = 0, lo = 0, hi = 1], c) => {
  check(p > 0 && p < 1 && a > 0 && b > 0 && lo < hi);
  return lo + (hi - lo) * inverse(p, (x) => beta(x, a, b, c), c);
});
for (const name of ["CEILING", "FLOOR"])
  scalar(name, 2, 2, ([x = 0, s = 0]) => {
    if (s === 0) return name === "CEILING" ? 0 : fail("#DIV/0!");
    check(!(x > 0 && s < 0));
    const q = x / Math.abs(s),
      nearest = Math.round(q);
    const rounded =
      Math.abs(q - nearest) <= Math.abs(q) * 2e-15
        ? nearest
        : name === "CEILING"
          ? s < 0
            ? Math.floor(q)
            : Math.ceil(q)
          : s < 0
            ? Math.ceil(q)
            : Math.floor(q);
    return rounded === 0 ? 0 : rounded * Math.abs(s);
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
  check(
    N > 0 &&
      n >= 0 &&
      n <= N &&
      m >= 0 &&
      m <= N &&
      k >= 0,
  );
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
  if (df <= 2) return t * beta(df / (df + x * x), df / 2, 0.5, c) / 2;
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
for (const name of ["STDEV", "STDEVP", "VAR", "VARP", "MODE"])
  register(name, 1, 255, (v, c, args) => {
    const xs: number[] = [];
    for (let i = 0; i < v.length; i++) {
      const part = data(
        v[i]!,
        c,
        name !== "MODE" && args[i]!.kind !== "reference" && !("kind" in v[i]!),
      );
      check(xs.length + part.length <= c.maxArrayCells);
      for (const x of part) xs.push(x);
    }
    if (name === "MODE") {
      const counts = new Map<number, number>();
      let count = 1,
        result = Infinity;
      for (const x of xs) {
        counts.set(x, (counts.get(x) ?? 0) + 1);
      }
      for (const [x, n] of counts) {
        if (n > count) {
          count = n;
          result = x;
        }
      }
      check(count > 1, "#N/A");
      return result;
    }
    const variance = moments(xs, name === "STDEV" || name === "VAR")[1];
    return name.startsWith("STDEV") ? Math.sqrt(variance) : variance;
  });
for (const name of ["PERCENTILE", "QUARTILE", "PERCENTRANK"])
  register(name, 2, name === "PERCENTRANK" ? 3 : 2, (v, c) => {
    const xs = data(v[0]!, c);
    c.operation(xs.length * Math.ceil(Math.log2(xs.length + 1)));
    xs.sort((a, b) => a - b);
    check(xs.length > 0);
    let k = numeric(v[1]!);
    if (name === "QUARTILE") {
      k = Math.trunc(k);
      check(k >= 0 && k <= 4);
      k /= 4;
    }
    if (name !== "PERCENTRANK") {
      check(probability(k));
      const pos = (xs.length - 1) * k,
        i = Math.floor(pos);
      return (
        xs[i]! + (xs[Math.min(i + 1, xs.length - 1)]! - xs[i]!) * (pos - i)
      );
    }
    const sig =
      v[2] === undefined || isOmitted(v[2]) ? 3 : Math.trunc(numeric(v[2]));
    check(sig >= 1);
    check(k >= xs[0]! && k <= xs[xs.length - 1]!, "#N/A");
    if (xs.length === 1) return 0;
    let i = 0;
    while (xs[i]! < k) i++;
    let rank = i;
    if (xs[i] !== k) rank = i - 1 + (k - xs[i - 1]!) / (xs[i]! - xs[i - 1]!);
    const p = rank / (xs.length - 1),
      scale = 10 ** sig;
    return Number.isFinite(scale) ? Math.trunc(p * scale + 1e-12) / scale : p;
  });
register("RANK", 2, 3, (v, c) => {
  const x = numeric(v[0]!),
    xs = data(v[1]!, c),
    asc = v[2] !== undefined && numeric(v[2]) !== 0;
  check(xs.includes(x), "#N/A");
  return 1 + xs.filter((y) => (asc ? y < x : y > x)).length;
});
register("COVAR", 2, 2, (v, c) => {
  const a = values(v[0]!, c),
    b = values(v[1]!, c);
  check(a.length === b.length, "#N/A");
  const x: number[] = [],
    y: number[] = [];
  for (let i = 0; i < a.length; i++) {
    const u = a[i]!,
      w = b[i]!;
    if (u.type === "error") throw new ExcelError(u);
    if (w.type === "error") throw new ExcelError(w);
    if (u.type === "number" && w.type === "number") {
      x.push(u.value);
      y.push(w.value);
    }
  }
  const mx = moments(x, false)[0],
    my = moments(y, false)[0];
  return x.reduce((s, z, i) => s + (z - mx) * (y[i]! - my), 0) / x.length;
});
register("ZTEST", 2, 3, (v, c) => {
  const xs = data(v[0]!, c);
  check(xs.length > 0, "#N/A");
  const [m, variance] = moments(xs, v[2] === undefined || isOmitted(v[2])),
    s =
      v[2] === undefined || isOmitted(v[2])
        ? Math.sqrt(variance)
        : numeric(v[2]);
  check(s > 0, "#DIV/0!");
  return normalTail((m - numeric(v[1]!)) / (s / Math.sqrt(xs.length)), c);
});
register("FTEST", 2, 2, (v, c) => {
  const x = data(v[0]!, c),
    y = data(v[1]!, c),
    a = moments(x, true)[1],
    b = moments(y, true)[1];
  check(a > 0 && b > 0, "#DIV/0!");
  const p = fTail(a / b, x.length - 1, y.length - 1, c);
  return Math.min(1, 2 * Math.min(p, 1 - p));
});
register("TTEST", 4, 4, (v, c) => {
  const tails = Math.trunc(numeric(v[2]!)),
    type = Math.trunc(numeric(v[3]!));
  check((tails === 1 || tails === 2) && type >= 1 && type <= 3);
  let x = data(v[0]!, c),
    y = data(v[1]!, c);
  let t: number, df: number;
  if (type === 1) {
    const a = values(v[0]!, c),
      b = values(v[1]!, c);
    check(a.length === b.length, "#N/A");
    x = [];
    for (let i = 0; i < a.length; i++) {
      const u = a[i]!,
        w = b[i]!;
      if (u.type === "number" && w.type === "number") x.push(u.value - w.value);
    }
    const [m, s] = moments(x, true);
    check(s > 0, "#DIV/0!");
    t = Math.abs(m) / Math.sqrt(s / x.length);
    df = x.length - 1;
  } else {
    const [mx, sx] = moments(x, true),
      [my, sy] = moments(y, true);
    const a = sx / x.length,
      b = sy / y.length;
    check(a + b > 0, "#DIV/0!");
    if (type === 2) {
      df = x.length + y.length - 2;
      t =
        Math.abs(mx - my) /
        Math.sqrt(
          (((x.length - 1) * sx + (y.length - 1) * sy) / df) *
            (1 / x.length + 1 / y.length),
        );
    } else {
      df = (a + b) ** 2 / ((a * a) / (x.length - 1) + (b * b) / (y.length - 1));
      t = Math.abs(mx - my) / Math.sqrt(a + b);
    }
  }
  return tails * tTail(t, df, c);
});
register("CHITEST", 2, 2, (v, c) => {
  const a = functionMatrix(v[0]!),
    b = functionMatrix(v[1]!);
  check(
    a.length === b.length && a.every((row, i) => row.length === b[i]!.length),
    "#N/A",
  );
  const av = values(v[0]!, c),
    bv = values(v[1]!, c);
  let stat = 0;
  for (let i = 0; i < av.length; i++) {
    const x = av[i]!,
      e = bv[i]!;
    if (x.type === "error") throw new ExcelError(x);
    if (e.type === "error") throw new ExcelError(e);
    if (x.type !== "number" || e.type !== "number") continue;
    check(e.value !== 0, "#DIV/0!");
    check(e.value > 0);
    stat += (x.value - e.value) ** 2 / e.value;
  }
  const rows = a.length,
    cols = a[0]?.length ?? 0,
    df =
      rows === 1 ? cols - 1 : cols === 1 ? rows - 1 : (rows - 1) * (cols - 1);
  check(df >= 1, "#N/A");
  return gamma(df / 2, stat / 2, true, c);
});
export const compatibilityFunctions: FunctionRegistry = registry;
