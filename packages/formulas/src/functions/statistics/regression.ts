import {
  functionMatrix,
  functionNumber,
  functionError,
  type FunctionContext,
  type FunctionValue,
} from "../../function-runtime.ts";
import {
  register,
  check,
  numeric,
  data,
  values,
  moments,
  isOmitted,
  ExcelError,
} from "./runtime.ts";

function paired(v: FunctionValue[], c: FunctionContext): [number[], number[]] {
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
  return [x, y];
}
for (const name of [
  "CORREL",
  "PEARSON",
  "RSQ",
  "SLOPE",
  "INTERCEPT",
  "STEYX",
  "COVARIANCE.S",
])
  register(name, 2, 2, (v, c) => {
    // SLOPE/INTERCEPT/STEYX receive known_y first, known_x second.
    const [originalA, originalB] = paired(v, c);
    const scaling = (xs: number[]) => {
      const max = xs.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
      return max > 1e75 || (max > 0 && max < 1e-75) ? max : 1;
    };
    const scaleA = scaling(originalA),
      scaleB = scaling(originalB);
    const a = originalA.map((x) => x / scaleA),
      b = originalB.map((x) => x / scaleB);
    const n = a.length,
      [ma] = moments(a, false),
      [mb] = moments(b, false);
    let aa = 0,
      bb = 0,
      ab = 0;
    for (let i = 0; i < n; i++) {
      aa += (a[i]! - ma) ** 2;
      bb += (b[i]! - mb) ** 2;
      ab += (a[i]! - ma) * (b[i]! - mb);
    }
    if (name === "COVARIANCE.S") {
      check(n > 1, "#DIV/0!");
      return (ab / (n - 1)) * scaleA * scaleB;
    }
    if (name === "SLOPE" || name === "INTERCEPT") {
      check(bb > 0, "#DIV/0!");
      const slope = ab / bb;
      return name === "SLOPE"
        ? slope * (scaleA / scaleB)
        : (ma - slope * mb) * scaleA;
    }
    if (name === "STEYX") {
      check(n > 2 && bb > 0, "#DIV/0!");
      return Math.sqrt(Math.max(0, aa - (ab / bb) * ab) / (n - 2)) * scaleA;
    }
    check(aa > 0 && bb > 0, "#DIV/0!");
    const r = Math.max(-1, Math.min(1, ab / Math.sqrt(aa) / Math.sqrt(bb)));
    return name === "RSQ" ? r * r : r;
  });
for (const name of ["FORECAST", "FORECAST.LINEAR"])
  register(name, 3, 3, (v, c) => {
    const x = numeric(v[0]!),
      [ys, xs] = paired(v.slice(1), c),
      [my] = moments(ys, false),
      [mx] = moments(xs, false);
    let xx = 0,
      xy = 0;
    for (let i = 0; i < xs.length; i++) {
      xx += (xs[i]! - mx) ** 2;
      xy += (xs[i]! - mx) * (ys[i]! - my);
    }
    check(xx > 0, "#DIV/0!");
    return my + (xy / xx) * (x - mx);
  });

interface Regression {
  coefficients: number[];
  standardErrors: number[];
  intercept: number;
  interceptError: number;
  r2: number;
  se: number;
  f: number;
  df: number;
  ssreg: number;
  ssres: number;
}
/** Pivoted modified Gram-Schmidt with reorthogonalization. Dependent predictors
 * are removed, matching LINEST's zero coefficient/error convention. */
function fit(
  y: number[],
  x: number[][],
  constant: boolean,
  c: FunctionContext,
): Regression {
  const n = y.length,
    p = x[0]?.length ?? 0;
  check(n > 0 && x.length === n && p > 0, "#REF!");
  check(n * p <= c.maxArrayCells);
  c.operation(p * p + n * p);
  const my = constant ? moments(y, false)[0] : 0;
  const means = Array.from({ length: p }, (_, j) =>
    constant ? x.reduce((s, r) => s + r[j]!, 0) / n : 0,
  );
  const columns = means.map((mean, j) => x.map((r) => r[j]! - mean)),
    target = y.map((z) => z - my);
  const order = Array.from({ length: p }, (_, j) => j),
    q: number[][] = [],
    r = Array.from({ length: p }, () => Array<number>(p).fill(0));
  const qty: number[] = [],
    norm = (a: number[]) => a.reduce((length, z) => Math.hypot(length, z), 0);
  const initial = columns.map(norm);
  const predictorScales = initial.map((length) => length || 1);
  for (let j = 0; j < p; j++)
    columns[j] = columns[j]!.map((value) => value / predictorScales[j]!);
  const scale = 1;
  let rank = 0;
  for (let k = 0; k < p; k++) {
    c.operation((p - k) * n * 2);
    let pivot = k;
    for (let j = k + 1; j < p; j++)
      if (norm(columns[j]!) > norm(columns[pivot]!)) pivot = j;
    [columns[k], columns[pivot]] = [columns[pivot]!, columns[k]!];
    [order[k], order[pivot]] = [order[pivot]!, order[k]!];
    for (let i = 0; i < k; i++)
      [r[i]![k], r[i]![pivot]] = [r[i]![pivot]!, r[i]![k]!];
    const length = norm(columns[k]!);
    if (length <= scale * Number.EPSILON * Math.max(n, p) * 16 || length === 0)
      break;
    r[k]![k] = length;
    const unit = columns[k]!.map((z) => z / length);
    q.push(unit);
    qty.push(unit.reduce((s, z, i) => s + z * target[i]!, 0));
    for (let j = k + 1; j < p; j++)
      for (let pass = 0; pass < 2; pass++) {
        const dot = unit.reduce((s, z, i) => s + z * columns[j]![i]!, 0);
        r[k]![j] = r[k]![j]! + dot;
        columns[j] = columns[j]!.map((z, i) => z - dot * unit[i]!);
      }
    rank++;
  }
  const active = Array<number>(rank).fill(0);
  for (let i = rank - 1; i >= 0; i--) {
    let z = qty[i]!;
    for (let j = i + 1; j < rank; j++) z -= r[i]![j]! * active[j]!;
    active[i] = z / r[i]![i]!;
  }
  const coefficients = Array<number>(p).fill(0);
  for (let i = 0; i < rank; i++)
    coefficients[order[i]!] = active[i]! / predictorScales[order[i]!]!;
  const intercept = my - means.reduce((s, z, i) => s + z * coefficients[i]!, 0);
  let ssres = 0;
  for (let i = 0; i < n; i++) {
    c.operation(p);
    const predicted =
      intercept + x[i]!.reduce((s, z, j) => s + z * coefficients[j]!, 0);
    ssres += (y[i]! - predicted) ** 2;
  }
  const total = target.reduce((s, z) => s + z * z, 0),
    ssreg = Math.max(0, total - ssres),
    df = n - rank - (constant ? 1 : 0),
    variance = df > 0 ? ssres / df : NaN;
  const inverse = Array.from({ length: rank }, () =>
    Array<number>(rank).fill(0),
  );
  for (let col = 0; col < rank; col++)
    for (let i = rank - 1; i >= 0; i--) {
      c.operation(rank);
      let z = i === col ? 1 : 0;
      for (let j = i + 1; j < rank; j++) z -= r[i]![j]! * inverse[j]![col]!;
      inverse[i]![col] = z / r[i]![i]!;
    }
  const standardErrors = Array<number>(p).fill(0);
  for (let i = 0; i < rank; i++)
    standardErrors[order[i]!] =
      Math.sqrt(inverse[i]!.reduce((s, z) => s + z * z, 0) * variance) /
      predictorScales[order[i]!]!;
  let interceptVar = constant ? 1 / n : 0;
  for (let col = 0; col < rank; col++) {
    const z = inverse.reduce(
      (s, row, i) =>
        s + (means[order[i]!]! / predictorScales[order[i]!]!) * row[col]!,
      0,
    );
    interceptVar += z * z;
  }
  return {
    coefficients,
    standardErrors,
    intercept,
    interceptError: constant ? Math.sqrt(interceptVar * variance) : NaN,
    r2: total === 0 ? NaN : Math.max(0, 1 - ssres / total),
    se: Math.sqrt(variance),
    f: rank > 0 ? ssreg / rank / variance : NaN,
    df,
    ssreg,
    ssres,
  };
}
function numericMatrix(value: FunctionValue, c: FunctionContext): number[][] {
  const matrix = functionMatrix(value);
  c.operation(matrix.length * (matrix[0]?.length ?? 0));
  return matrix.map((row) =>
    row.map((cell) => {
      if (cell.type === "error") throw new ExcelError(cell);
      check(cell.type === "number", "#VALUE!");
      return cell.value;
    }),
  );
}
function optionalBoolean(
  value: FunctionValue | undefined,
  fallback: boolean,
): boolean {
  if (value === undefined || isOmitted(value)) return fallback;
  if (!("kind" in value) && value.type === "string") {
    check(/^(TRUE|FALSE)$/i.test(value.value), "#VALUE!");
    return value.value.toUpperCase() === "TRUE";
  }
  return numeric(value) !== 0;
}
for (const name of ["LINEST", "LOGEST", "TREND", "GROWTH"])
  register(name, 1, 4, (v, c) => {
    const exponential = name === "LOGEST" || name === "GROWTH",
      prediction = name === "TREND" || name === "GROWTH";
    const yMatrix = numericMatrix(v[0]!, c),
      horizontal = yMatrix.length === 1;
    check(horizontal || yMatrix[0]!.length === 1, "#REF!");
    const originalY = yMatrix.flat(),
      y = originalY.map((z) => {
        if (exponential) {
          check(z > 0);
          return Math.log(z);
        }
        return z;
      });
    let x: number[][];
    if (v[1] === undefined || isOmitted(v[1])) x = y.map((_, i) => [i + 1]);
    else {
      const matrix = numericMatrix(v[1], c);
      x = horizontal
        ? (matrix[0] ?? []).map((_, j) => matrix.map((row) => row[j]!))
        : matrix;
      check(x.length === y.length, "#REF!");
    }
    const constant = optionalBoolean(v[prediction ? 3 : 2], true),
      model = fit(y, x, constant, c);
    if (prediction) {
      const newX =
        v[2] === undefined || isOmitted(v[2])
          ? x
          : (() => {
              const matrix = numericMatrix(v[2], c);
              return horizontal
                ? matrix[0]!.map((_, j) => matrix.map((row) => row[j]!))
                : matrix;
            })();
      check(
        newX.every((row) => row.length === model.coefficients.length),
        "#REF!",
      );
      check(newX.length <= c.maxArrayCells);
      const result = newX.map((row) => {
        c.operation(row.length);
        const z =
          model.intercept +
          row.reduce((s, a, j) => s + a * model.coefficients[j]!, 0);
        return functionNumber(exponential ? Math.exp(z) : z);
      });
      return {
        kind: "array",
        rows: horizontal ? [result] : result.map((z) => [z]),
      };
    }
    const coefficients = [...model.coefficients]
      .reverse()
      .map((z) => functionNumber(exponential ? Math.exp(z) : z));
    coefficients.push(
      functionNumber(exponential ? Math.exp(model.intercept) : model.intercept),
    );
    if (!optionalBoolean(v[3], false))
      return { kind: "array", rows: [coefficients] };
    const width = coefficients.length,
      na = () => functionError("#N/A"),
      row = (a: number, b: number) => [
        functionNumber(a),
        functionNumber(b),
        ...Array.from({ length: Math.max(0, width - 2) }, na),
      ];
    return {
      kind: "array",
      rows: [
        coefficients,
        [...model.standardErrors]
          .reverse()
          .map(functionNumber)
          .concat(constant ? functionNumber(model.interceptError) : na()),
        row(model.r2, model.se),
        row(model.f, model.df),
        row(model.ssreg, model.ssres),
      ],
    };
  });
