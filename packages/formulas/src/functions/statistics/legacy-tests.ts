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
  return Math.min(
    1,
    2 * Math.min(p, fTail(b / a, y.length - 1, x.length - 1, c)),
  );
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
