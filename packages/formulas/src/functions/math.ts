import type { FormulaExpression } from "../ast.ts";
import type { FormulaScalarValue } from "../evaluator.ts";
import { functionError as err, functionNumber as runtimeNumber, functionNumeric, functionMatrix as runtimeMatrix, functionText, type ExtendedFunction, type FunctionContext, type FunctionRegistry, type FunctionValue } from "../function-runtime.ts";

type Scalar = FormulaScalarValue;
type NumericResult = number | Scalar;
const registry = new Map<string, ExtendedFunction>();
// Excel worksheets do not retain IEEE subnormal results.
function num(value: number): Scalar { return runtimeNumber(Math.abs(value) < 2.2250738585072014e-308 ? 0 : value); }
const NUM = () => err("#NUM!");
const DIV = () => err("#DIV/0!");
// Compatible with the coordinator's omitted-argument runtime extension.
function omitted(v: FunctionValue): boolean { return "kind" in v && (v as { kind: string }).kind === "omitted"; }
function functionMatrix(v: FunctionValue): readonly (readonly Scalar[])[] {
  return omitted(v) ? [[num(0)]] : runtimeMatrix(v);
}
function bounded(c: FunctionContext, rows: number, cols: number): boolean {
  return Number.isSafeInteger(rows) && Number.isSafeInteger(cols) && rows > 0 && cols > 0 && rows <= 1048576 && cols <= 16384 && rows * cols <= c.maxArrayCells;
}
function array(c: FunctionContext, rows: number, cols: number, f: (r: number, col: number) => Scalar): FunctionValue {
  if (!bounded(c, rows, cols)) return NUM();
  c.operation(rows * cols);
  return { kind: "array", rows: Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, col) => f(r, col))) };
}
function register(name: string, min: number, max: number, f: (v: FunctionValue[], c: FunctionContext, a: readonly FormulaExpression[]) => FunctionValue) {
  registry.set(name, (a, c) => {
    c.operation();
    if (a.length < min || a.length > max) return err();
    return f(a.map(x => c.evaluate(x)), c, a);
  });
}
// Scalar math functions lift over rectangular arrays with singleton broadcasting.
function numeric(name: string, min: number, max: number, f: (v: number[], c: FunctionContext) => NumericResult, defaults: number[] = []) {
  register(name, min, max, (values, c) => {
    const matrices = values.map((v, i) => omitted(v) ? [[num(defaults[i] ?? 0)]] : functionMatrix(v));
    const h = Math.max(1, ...matrices.map(m => m.length));
    const w = Math.max(1, ...matrices.map(m => m[0]?.length ?? 0));
    if (!bounded(c, h, w)) return NUM();
    if (matrices.some(m => (m.length !== 1 && m.length !== h) || m.some(r => r.length !== 1 && r.length !== w))) return err("#N/A");
    const calculate = (r: number, col: number): Scalar => {
      c.operation();
      const ns = [...defaults];
      for (let i = 0; i < matrices.length; i++) {
        const m = matrices[i]!;
        const row = m[m.length === 1 ? 0 : r]!;
        const n = functionNumeric(row[row.length === 1 ? 0 : col]!);
        if (n.type !== "number") return n;
        ns[i] = n.value;
      }
      const result = f(ns, c);
      return typeof result === "number" ? num(result === 0 ? 0 : result) : result;
    };
    return values.some(v => "kind" in v && v.kind === "array") ? array(c, h, w, calculate) : calculate(0, 0);
  });
}
const unary: Record<string, (x: number) => NumericResult> = {
  ACOS: Math.acos, ACOSH: Math.acosh, ACOT: x => Math.atan2(1, x),
  ACOTH: x => Math.abs(x) <= 1 ? NUM() : .5 * Math.log1p(2 / (x - 1)),
  ASIN: Math.asin, ASINH: Math.asinh, ATAN: Math.atan, ATANH: Math.atanh,
  COS: Math.cos, COSH: Math.cosh, SIN: Math.sin, SINH: Math.sinh, TAN: Math.tan, TANH: Math.tanh,
  COT: x => x === 0 ? DIV() : 1 / Math.tan(x), COTH: x => x === 0 ? DIV() : 1 / Math.tanh(x),
  CSC: x => x === 0 ? DIV() : 1 / Math.sin(x), CSCH: x => x === 0 ? DIV() : 1 / Math.sinh(x),
  SEC: x => 1 / Math.cos(x), SECH: x => { const e = Math.exp(-Math.abs(x)); return 2 * e / (1 + e * e); },
  DEGREES: x => x * (180 / Math.PI), RADIANS: x => x * (Math.PI / 180),
  EXP: Math.exp, LN: x => x <= 0 ? NUM() : Math.log(x), LOG10: x => x <= 0 ? NUM() : Math.log10(x),
  SIGN: Math.sign, SQRT: Math.sqrt, SQRTPI: x => Math.sqrt(x) * Math.sqrt(Math.PI),
  EVEN: x => Math.sign(x) * Math.ceil(Math.abs(x) / 2) * 2,
  ODD: x => (x < 0 ? -1 : 1) * (2 * Math.ceil((Math.abs(x) - 1) / 2) + 1),
};
for (const [name, f] of Object.entries(unary)) numeric(name, 1, 1, ([x]) => {
  if (["COT", "CSC", "SEC"].includes(name) && Math.abs(x!) >= 2 ** 27) return NUM();
  return f(x!);
});
numeric("ATAN2", 2, 2, ([x, y]) => x === 0 && y === 0 ? DIV() : Math.atan2(y!, x!));
numeric("LOG", 1, 2, ([x, b]) => x! <= 0 || b! <= 0 || b === 1 ? NUM() : Math.log(x!) / Math.log(b!), [0, 10]);
numeric("POWER", 2, 2, ([x, p]) => x === 0 && p === 0 ? NUM() : x === 0 && p! < 0 ? DIV() : x! ** p!);
numeric("QUOTIENT", 2, 2, ([x, d]) => d === 0 ? DIV() : Math.trunc(x! / d!));
numeric("TRUNC", 1, 2, ([x, d]) => {
  d = Math.trunc(d!);
  if (x === 0 || d > 308) return x!;
  if (d < -308) return 0;
  const shift = (value: number, digits: number) => {
    const [mantissa, exponent] = value.toString().split("e");
    return Number(`${mantissa}e${Number(exponent ?? 0) + digits}`);
  };
  const scaled = shift(x!, d);
  return Number.isFinite(scaled) ? shift(Math.trunc(scaled), -d) : x!;
}, [0, 0]);
for (const name of ["CEILING.PRECISE", "ISO.CEILING", "FLOOR.PRECISE"]) numeric(name, 1, 2, ([x, s]) => {
  if (s === 0 || x === 0) return 0;
  const q = x! / Math.abs(s!);
  // Correct representational noise around exact decimal multiples.
  const nearest = Math.round(q), adjusted = Math.abs(q - nearest) <= 2 * Number.EPSILON * Math.abs(q) ? nearest : q;
  return (name === "FLOOR.PRECISE" ? Math.floor(adjusted) : Math.ceil(adjusted)) * Math.abs(s!);
}, [0, 1]);
numeric("MROUND", 2, 2, ([x, m]) => {
  if (x !== 0 && m !== 0 && Math.sign(x!) !== Math.sign(m!)) return NUM();
  if (m === 0) return 0;
  return Math.sign(x!) * Math.floor(Math.abs(x! / m!) + .5) * Math.abs(m!);
});
function factorial(n: number, step: number, c: FunctionContext): NumericResult {
  if (n < 0) return NUM();
  n = Math.trunc(n);
  if (n > (step === 1 ? 170 : 300)) return NUM();
  let result = 1;
  for (; n > 1; n -= step) { c.operation(); result *= n; }
  return result;
}
numeric("FACT", 1, 1, ([n], c) => factorial(n!, 1, c));
numeric("FACTDOUBLE", 1, 1, ([n], c) => factorial(n!, 2, c));
function combination(n: number, k: number, c: FunctionContext): NumericResult {
  if (n < 0 || k < 0 || n < k) return NUM();
  k = Math.min(k, n - k);
  let result = 1;
  for (let i = 1; i <= k; i++) { c.operation(); result *= (n - k + i) / i; if (!Number.isFinite(result)) return NUM(); }
  return result;
}
numeric("COMBIN", 2, 2, ([n, k], c) => n! < 0 || k! < 0 ? NUM() : combination(Math.trunc(n!), Math.trunc(k!), c));
numeric("COMBINA", 2, 2, ([n, k], c) => {
  if (n! < 0 || k! < 0) return NUM();
  n = Math.trunc(n!); k = Math.trunc(k!);
  return k === 0 ? 1 : combination(n + k - 1, k, c);
});
numeric("BASE", 2, 3, ([n, b, len]) => {
  if (n! < 0 || n! >= 2 ** 53 || b! < 2 || b! >= 37 || len! < 0 || len! >= 256) return NUM();
  return { type: "string", value: Math.trunc(n!).toString(Math.trunc(b!)).toUpperCase().padStart(Math.trunc(len!), "0") };
}, [0, 0, 0]);
register("DECIMAL", 2, 2, ([v, radix], c) => {
  const n = functionNumeric(functionMatrix(radix!)[0]![0]!);
  if (n.type !== "number") return n;
  const b = Math.trunc(n.value), value = functionMatrix(v!)[0]![0]!;
  if (value.type === "error") return value;
  const text = functionText(value).trim().toUpperCase();
  if (b < 2 || b > 36 || text.length > 255 || !/^[0-9A-Z]*$/.test(text)) return NUM();
  let result = 0;
  for (const char of text) { c.operation(); const digit = parseInt(char, 36); if (digit >= b) return NUM(); result = result * b + digit; }
  return num(result);
});
register("ARABIC", 1, 1, ([v], c) => {
  const value = functionMatrix(v!)[0]![0]!;
  if (value.type === "error") return value;
  if (value.type !== "string") return err();
  const text = value.value.trim().toUpperCase();
  if (value.value.length > 255 || !/^-?[IVXLCDM]*$/.test(text)) return err();
  const digits: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let result = 0;
  for (let i = text[0] === "-" ? 1 : 0; i < text.length; i++) { c.operation(); const d = digits[text[i]!]!; result += d < (digits[text[i + 1]!] ?? 0) ? -d : d; }
  return num(text[0] === "-" ? -result : result);
});
register("ROMAN", 1, 2, (v, c) => {
  const value = functionNumeric(functionMatrix(v[0]!)[0]![0]!);
  if (value.type !== "number") return value;
  let formValue = v[1] ? functionMatrix(v[1])[0]![0]! : num(0);
  if (formValue.type === "boolean") formValue = num(formValue.value ? 0 : 4);
  const form = functionNumeric(formValue);
  if (form.type !== "number") return form;
  if (value.value < 0 || value.value >= 4000 || form.value < 0 || form.value >= 5) return err();
  let n = Math.trunc(value.value), result = "";
  const vals = [1, 5, 10, 50, 100, 500, 1000], symbols = "IVXLCDM";
  // Each simplification level permits subtracting a symbol one position smaller.
  for (let i = 6; i >= 0; i--) {
    c.operation();
    while (n >= vals[i]!) { result += symbols[i]; n -= vals[i]!; }
    if (i === 0) continue;
    const base = i % 2 === 0 ? i - 2 : i - 1;
    for (let j = Math.max(0, base - Math.trunc(form.value)); j < i; j++) {
      if (n >= vals[i]! - vals[j]!) { result += symbols[j]! + symbols[i]!; n -= vals[i]! - vals[j]!; break; }
    }
  }
  return { type: "string", value: result };
});
// Aggregates coerce literal scalars, but ignore text/logicals/blanks in references/arrays.
function collect(values: FunctionValue[], expressions: readonly FormulaExpression[], c: FunctionContext): number[] | Scalar {
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    const indirect = expressions[i]?.kind === "reference" || "kind" in v;
    const m = functionMatrix(v);
    if (!bounded(c, m.length, m[0]?.length ?? 0)) return NUM();
    for (const row of m) for (const s of row) {
      c.operation();
      if (s.type === "error") return s;
      if (indirect && s.type !== "number") continue;
      const n = functionNumeric(s); if (n.type !== "number") return n;
      out.push(n.value);
    }
  }
  return out;
}
for (const name of ["GCD", "LCM", "MULTINOMIAL", "SUMSQ"]) register(name, 1, 255, (values, c, expressions) => {
  const ns = collect(values, expressions, c);
  if (!Array.isArray(ns)) return ns;
  if (name === "SUMSQ") return num(ns.reduce((s, n) => s + n * n, 0));
  if (ns.some(n => n < 0)) return NUM();
  const ints = ns.map(Math.trunc);
  if (name === "MULTINOMIAL") {
    let total = 0, result = 1;
    for (const n of ints) { const next = combination(total + n, n, c); if (typeof next !== "number") return next; result *= next; total += n; }
    return num(result);
  }
  if (ints.some(n => n >= 2 ** 53)) return NUM();
  const gcd = (a: number, b: number) => { while (b) { c.operation(); const next = a % b; a = b; b = next; } return a; };
  let result = name === "GCD" ? 0 : 1;
  for (const n of ints) { result = name === "GCD" ? gcd(result, n) : result === 0 || n === 0 ? 0 : result / gcd(result, n) * n; if (result >= 2 ** 53) return NUM(); }
  return num(result);
});
register("PERCENTOF", 2, 2, (v, c, a) => {
  const sums: number[] = [];
  for (let i = 0; i < 2; i++) { const ns = collect([v[i]!], [a[i]!], c); if (!Array.isArray(ns)) return ns; sums.push(ns.reduce((s, n) => s + n, 0)); }
  return sums[1] === 0 ? DIV() : num(sums[0]! / sums[1]!);
});
for (const name of ["SUMX2MY2", "SUMX2PY2", "SUMXMY2"]) register(name, 2, 2, (v, c) => {
  const flatten = (x: FunctionValue) => { const m = functionMatrix(x); if (!bounded(c, m.length, m[0]?.length ?? 0)) return undefined; c.operation(m.length * m[0]!.length); return m.flat(); };
  const x = flatten(v[0]!), y = flatten(v[1]!);
  if (!x || !y) return NUM();
  if (x.length !== y.length) return err("#N/A");
  let sum = 0;
  for (let i = 0; i < x.length; i++) { const a = x[i]!, b = y[i]!; if (a.type === "error") return a; if (b.type === "error") return b; if (a.type !== "number" || b.type !== "number") continue; sum += name === "SUMXMY2" ? (a.value - b.value) ** 2 : a.value ** 2 + (name === "SUMX2MY2" ? -1 : 1) * b.value ** 2; }
  return num(sum);
});
register("SERIESSUM", 4, 4, (v, c) => {
  const ns: number[] = [];
  for (const value of v.slice(0, 3)) { const n = functionNumeric(functionMatrix(value)[0]![0]!); if (n.type !== "number") return n; ns.push(n.value); }
  const m = functionMatrix(v[3]!); if (!bounded(c, m.length, m[0]?.length ?? 0)) return NUM();
  let sum = 0, i = 0;
  for (const row of m) for (const n of row) { c.operation(); if (n.type === "error") return n; if (n.type !== "number") return err(); sum += n.value * ns[0]! ** (ns[1]! + i++ * ns[2]!); }
  return num(sum);
});
numeric("PI", 0, 0, () => Math.PI);
numeric("RAND", 0, 0, (_, c) => c.random());
numeric("RANDBETWEEN", 2, 2, ([lo, hi], c) => { lo = Math.ceil(lo!); hi = Math.floor(hi!); return lo > hi ? NUM() : lo + Math.floor(c.random() * (hi - lo + 1)); });
for (const name of ["SEQUENCE", "RANDARRAY", "MUNIT"]) register(name, name === "RANDARRAY" ? 0 : 1, name === "MUNIT" ? 1 : name === "SEQUENCE" ? 4 : 5, (v, c) => {
  const ns = name === "SEQUENCE" ? [1, 1, 1, 1] : name === "RANDARRAY" ? [1, 1, 0, 1, 0] : [1];
  for (let i = 0; i < v.length; i++) { if (omitted(v[i]!)) continue; const n = functionNumeric(functionMatrix(v[i]!)[0]![0]!); if (n.type !== "number") return n; ns[i] = n.value; }
  const rows = Math.trunc(ns[0]!), cols = name === "MUNIT" ? rows : Math.trunc(ns[1]!);
  if (name === "RANDARRAY" && ns[2]! > ns[3]!) return err();
  if (name === "RANDARRAY" && ns[4] && Math.ceil(ns[2]!) > Math.floor(ns[3]!)) return err();
  return array(c, rows, cols, (r, col) => {
    if (name === "MUNIT") return num(r === col ? 1 : 0);
    if (name === "SEQUENCE") return num(ns[2]! + (r * cols + col) * ns[3]!);
    const lo = ns[4] ? Math.ceil(ns[2]!) : ns[2]!, hi = ns[4] ? Math.floor(ns[3]!) : ns[3]!;
    return num(ns[4] ? lo + Math.floor(c.random() * (hi - lo + 1)) : lo + c.random() * (hi - lo));
  });
});
function matrix(value: FunctionValue, c: FunctionContext): number[][] | Scalar {
  const rows = functionMatrix(value);
  if (!bounded(c, rows.length, rows[0]?.length ?? 0)) return NUM();
  const result: number[][] = [];
  for (const row of rows) { if (row.length !== rows[0]!.length) return err(); const out: number[] = []; for (const s of row) { c.operation(); if (s.type === "error") return s; if (s.type !== "number") return err(); out.push(s.value); } result.push(out); }
  return result;
}
register("MMULT", 2, 2, (v, c) => {
  const a = matrix(v[0]!, c), b = matrix(v[1]!, c);
  if (!Array.isArray(a)) return a; if (!Array.isArray(b)) return b;
  if (a[0]!.length !== b.length) return err();
  return array(c, a.length, b[0]!.length, (r, col) => { let sum = 0; for (let k = 0; k < b.length; k++) { c.operation(); sum += a[r]![k]! * b[k]![col]!; } return num(sum); });
});
for (const name of ["MDETERM", "MINVERSE"]) register(name, 1, 1, (v, c) => {
  const a = matrix(v[0]!, c); if (!Array.isArray(a)) return a;
  const n = a.length; if (a[0]!.length !== n) return err();
  const inverse = name === "MINVERSE" ? Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, col) => r === col ? 1 : 0) as number[]) : undefined;
  let determinant = 1, logMagnitude = 0, determinantSign = 1;
  for (let k = 0; k < n; k++) {
    let pivot = k;
    for (let r = k + 1; r < n; r++) { c.operation(); if (Math.abs(a[r]![k]!) > Math.abs(a[pivot]![k]!)) pivot = r; }
    if (a[pivot]![k] === 0) return inverse ? NUM() : num(0);
    if (pivot !== k) { [a[k], a[pivot]] = [a[pivot]!, a[k]!]; if (inverse) [inverse[k], inverse[pivot]] = [inverse[pivot]!, inverse[k]!]; determinant = -determinant; determinantSign = -determinantSign; }
    const p = a[k]![k]!; determinant *= p; logMagnitude += Math.log(Math.abs(p)); determinantSign *= Math.sign(p);
    if (inverse) for (let col = 0; col < n; col++) { c.operation(); inverse[k]![col] = inverse[k]![col]! / p; }
    for (let col = k + 1; col < n; col++) { c.operation(); a[k]![col] = a[k]![col]! / p; }
    a[k]![k] = 1;
    for (let r = inverse ? 0 : k + 1; r < n; r++) {
      if (r === k) continue;
      const factor = a[r]![k]!; a[r]![k] = 0;
      for (let col = k + 1; col < n; col++) { c.operation(); a[r]![col] = a[r]![col]! - factor * a[k]![col]!; }
      if (inverse) for (let col = 0; col < n; col++) { c.operation(); inverse[r]![col] = inverse[r]![col]! - factor * inverse[k]![col]!; }
    }
  }
  return inverse ? array(c, n, n, (r, col) => num(inverse[r]![col]!)) : num(Number.isFinite(determinant) && determinant !== 0 ? determinant : determinantSign * Math.exp(logMagnitude));
});
export const mathFunctions: FunctionRegistry = registry;
