import type { FormulaExpression } from "../../ast.ts";
import {
  functionNumber,
  type FunctionContext,
  type FunctionValue,
} from "../../function-runtime.ts";
import {
  register,
  scalar,
  check,
  numeric,
  data,
  values,
  moments,
  isOmitted,
  ExcelError,
} from "./runtime.ts";

/** Excel distinguishes direct logical/numeric-text arguments from range contents. */
function aggregateData(
  v: FunctionValue[],
  c: FunctionContext,
  args: readonly FormulaExpression[],
  includeText = false,
): number[] {
  const out: number[] = [];
  for (let i = 0; i < v.length; i++) {
    const value = v[i]!;
    const literal =
      args[i]!.kind !== "reference" &&
      args[i]!.kind !== "name" &&
      args[i]!.kind !== "spill" &&
      !("kind" in value);
    for (const cell of values(value, c)) {
      if (cell.type === "error") throw new ExcelError(cell);
      if (cell.type === "number") out.push(cell.value);
      else if (cell.type !== "blank") {
        if (includeText)
          out.push(
            cell.type === "boolean" ? +cell.value : literal ? numeric(cell) : 0,
          );
        else if (literal) out.push(numeric(cell));
      }
    }
    check(out.length <= c.maxArrayCells);
  }
  return out;
}
for (const name of [
  "AVEDEV",
  "AVERAGEA",
  "DEVSQ",
  "GEOMEAN",
  "HARMEAN",
  "KURT",
  "MAXA",
  "MINA",
  "SKEW",
  "SKEW.P",
  "STDEVA",
  "STDEVPA",
  "VARA",
  "VARPA",
  "MEDIAN",
  "AVERAGE",
  "MIN",
  "MAX",
]) {
  register(name, 1, 255, (v, c, args) => {
    const includeText = [
      "AVERAGEA",
      "MAXA",
      "MINA",
      "STDEVA",
      "STDEVPA",
      "VARA",
      "VARPA",
    ].includes(name);
    const xs = aggregateData(v, c, args, includeText),
      n = xs.length;
    if (["MAXA", "MINA", "MAX", "MIN"].includes(name))
      return xs.reduce(
        (a, b) => (name.startsWith("MAX") ? Math.max(a, b) : Math.min(a, b)),
        xs[0] ?? 0,
      );
    if (name === "MEDIAN") {
      check(n > 0, "#NUM!");
      c.operation(n * Math.ceil(Math.log2(n + 1)));
      xs.sort((a, b) => a - b);
      return n % 2 ? xs[Math.floor(n / 2)]! : (xs[n / 2 - 1]! + xs[n / 2]!) / 2;
    }
    if (name === "GEOMEAN" || name === "HARMEAN") {
      check(n > 0 && xs.every((x) => x > 0));
      return name === "GEOMEAN"
        ? Math.exp(xs.reduce((s, x) => s + Math.log(x), 0) / n)
        : n / xs.reduce((s, x) => s + 1 / x, 0);
    }
    if (name === "KURT" || name === "SKEW" || name === "SKEW.P") {
      check(n >= (name === "KURT" ? 4 : 3), "#DIV/0!");
      const [mean, variance] = moments(xs, name !== "SKEW.P");
      check(variance > 0, "#DIV/0!");
      if (name === "KURT")
        return (
          ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) *
            xs.reduce(
              (s, x) => s + ((x - mean) / Math.sqrt(variance)) ** 4,
              0,
            ) -
          (3 * (n - 1) ** 2) / ((n - 2) * (n - 3))
        );
      const third = xs.reduce(
        (s, x) => s + ((x - mean) / Math.sqrt(variance)) ** 3,
        0,
      );
      return name === "SKEW.P" ? third / n : (n / ((n - 1) * (n - 2))) * third;
    }
    const [mean, variance] = moments(xs, name === "STDEVA" || name === "VARA");
    if (name === "AVERAGEA" || name === "AVERAGE") return mean;
    if (name === "AVEDEV")
      return xs.reduce((s, x) => s + Math.abs(x - mean), 0) / n;
    if (name === "DEVSQ") return variance * n;
    return name.startsWith("STDEV") ? Math.sqrt(variance) : variance;
  });
}
for (const name of ["LARGE", "SMALL"])
  register(name, 2, 2, (v, c) => {
    const xs = data(v[0]!, c),
      k = Math.ceil(numeric(v[1]!));
    check(k >= 1 && k <= xs.length);
    c.operation(xs.length * Math.ceil(Math.log2(xs.length + 1)));
    xs.sort((a, b) => (name === "LARGE" ? b - a : a - b));
    return xs[k - 1]!;
  });
register("MODE.MULT", 1, 255, (v, c, args) => {
  const counts = new Map<number, number>();
  for (const x of aggregateData(v, c, args))
    counts.set(x, (counts.get(x) ?? 0) + 1);
  const max = [...counts.values()].reduce((a, b) => Math.max(a, b), 1);
  check(max > 1, "#N/A");
  return {
    kind: "array",
    rows: [...counts]
      .filter(([, n]) => n === max)
      .map(([x]) => [functionNumber(x)]),
  };
});
for (const name of ["PERCENTILE.EXC", "QUARTILE.EXC", "PERCENTRANK.EXC"])
  register(name, 2, name === "PERCENTRANK.EXC" ? 3 : 2, (v, c) => {
    const xs = data(v[0]!, c);
    c.operation(xs.length * Math.ceil(Math.log2(xs.length + 1)));
    xs.sort((a, b) => a - b);
    check(xs.length > 0);
    let k = numeric(v[1]!);
    if (name === "QUARTILE.EXC") {
      k = Math.trunc(k);
      check(k >= 1 && k <= 3);
      k /= 4;
    }
    if (name !== "PERCENTRANK.EXC") {
      check(k > 0 && k < 1);
      const pos = (xs.length + 1) * k - 1;
      check(pos >= 0 && pos <= xs.length - 1);
      const i = Math.floor(pos);
      return (
        xs[i]! + (xs[Math.min(i + 1, xs.length - 1)]! - xs[i]!) * (pos - i)
      );
    }
    check(k >= xs[0]! && k <= xs.at(-1)!, "#N/A");
    const sig =
      v[2] === undefined || isOmitted(v[2]) ? 3 : Math.trunc(numeric(v[2]));
    check(sig >= 1);
    let i = 0;
    while (xs[i]! < k) i++;
    const position =
      xs[i] === k ? i : i - 1 + (k - xs[i - 1]!) / (xs[i]! - xs[i - 1]!);
    const p = (position + 1) / (xs.length + 1),
      scale = 10 ** sig;
    return Number.isFinite(scale) ? Math.trunc(p * scale + 1e-12) / scale : p;
  });
register("RANK.AVG", 2, 3, (v, c) => {
  const x = numeric(v[0]!),
    xs = data(v[1]!, c),
    ascending = v[2] !== undefined && numeric(v[2]) !== 0;
  const equal = xs.filter((y) => y === x).length;
  check(equal > 0, "#N/A");
  return (
    1 + xs.filter((y) => (ascending ? y < x : y > x)).length + (equal - 1) / 2
  );
});
register("TRIMMEAN", 2, 2, (v, c) => {
  const xs = data(v[0]!, c),
    p = numeric(v[1]!);
  check(xs.length > 0 && p >= 0 && p < 1);
  c.operation(xs.length * Math.ceil(Math.log2(xs.length + 1)));
  xs.sort((a, b) => a - b);
  const trim = Math.floor((xs.length * p) / 2),
    kept = xs.slice(trim, xs.length - trim);
  return moments(kept, false)[0];
});
register("FREQUENCY", 2, 2, (v, c) => {
  const xs = data(v[0]!, c),
    bins = data(v[1]!, c),
    sorted = [...bins].sort((a, b) => a - b),
    counts = new Map<number, number>();
  const output = Array<number>(sorted.length + 1).fill(0);
  check(output.length <= c.maxArrayCells);
  for (const x of xs) {
    let lo = 0,
      hi = sorted.length;
    while (lo < hi) {
      c.operation();
      const mid = Math.floor((lo + hi) / 2);
      if (x <= sorted[mid]!) hi = mid;
      else lo = mid + 1;
    }
    output[lo] = output[lo]! + 1;
  }
  for (let i = 0; i < sorted.length; i++)
    if (!counts.has(sorted[i]!)) counts.set(sorted[i]!, output[i]!);
  return {
    kind: "array",
    rows: [
      ...bins.map((b) => {
        const count = counts.get(b) ?? 0;
        counts.delete(b);
        return [functionNumber(count)];
      }),
      [functionNumber(output.at(-1)!)],
    ],
  };
});
register("PROB", 3, 4, (v, c) => {
  const xs = data(v[0]!, c),
    ps = data(v[1]!, c),
    lo = numeric(v[2]!),
    hi = v[3] === undefined || isOmitted(v[3]) ? lo : numeric(v[3]);
  check(xs.length === ps.length, "#N/A");
  check(ps.length > 0 && ps.every((p) => p > 0 && p <= 1));
  check(Math.abs(ps.reduce((s, p) => s + p, 0) - 1) < 1e-12);
  return xs.reduce((s, x, i) => s + (x >= lo && x <= hi ? ps[i]! : 0), 0);
});
