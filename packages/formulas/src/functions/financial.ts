import type { FormulaExpression } from "../ast.ts";
import type { FormulaScalarValue } from "../evaluator.ts";
import {
  functionError,
  functionNumber,
  functionNumeric,
  functionScalar,
  type ExtendedFunction,
  type FunctionContext,
  type FunctionRegistry,
  type FunctionValue,
} from "../function-runtime.ts";

class FinancialError {
  constructor(readonly value: FormulaScalarValue) {}
}
function fail(code: `#${string}` = "#NUM!"): never {
  throw new FinancialError(functionError(code));
}
function check(ok: boolean, code: `#${string}` = "#NUM!"): void {
  if (!ok) fail(code);
}
function omitted(v: unknown): boolean {
  return (
    typeof v === "object" && v !== null && "kind" in v && v.kind === "omitted"
  );
}
function numeric(v: FunctionValue): number {
  if (omitted(v)) return 0;
  const n = functionNumeric(functionScalar(v));
  if (n.type === "error") throw new FinancialError(n);
  return n.type === "number" ? n.value : fail("#VALUE!");
}
const registry = new Map<string, ExtendedFunction>();
function define(
  name: string,
  min: number,
  max: number,
  calculate: (n: number[], c: FunctionContext) => number,
): void {
  registry.set(name, (args, c) => {
    if (args.length < min || args.length > max) return functionError();
    try {
      c.operation();
      return functionNumber(
        calculate(
          args.map((a, i) => {
            const value = c.evaluate(a);
            return omitted(value) &&
              (i >= min || (name === "ACCRINT" && i === 4))
              ? (undefined as unknown as number)
              : numeric(value);
          }),
          c,
        ),
      );
    } catch (e) {
      if (e instanceof FinancialError) return e.value;
      throw e;
    }
  });
}
const trunc = Math.trunc;
function type(t: number): number {
  check(t === 0 || t === 1);
  return t;
}
function growth(r: number, n: number): number {
  return Math.pow(1 + r, n);
}
function annuity(r: number, n: number): number {
  return r === 0
    ? n
    : r > -1
      ? Math.expm1(n * Math.log1p(r)) / r
      : (growth(r, n) - 1) / r;
}
function payment(r: number, n: number, p: number, f = 0, t = 0): number {
  type(t);
  check(n !== 0, "#DIV/0!");
  const den = (1 + r * t) * annuity(r, n);
  check(den !== 0, "#DIV/0!");
  return -(p * growth(r, n) + f) / den;
}
function future(r: number, n: number, pmt: number, p = 0, t = 0): number {
  type(t);
  return -(p * growth(r, n) + pmt * (1 + r * t) * annuity(r, n));
}
function interest(
  r: number,
  per: number,
  n: number,
  p: number,
  f = 0,
  t = 0,
): number {
  type(t);
  check(per >= 1 && per <= n);
  if (t === 1 && per === 1) return 0;
  return (
    (future(r, per - 1, payment(r, n, p, f, t), p, t) * r) /
    (t === 1 ? 1 + r : 1)
  );
}
// Trial-relative residual: discounting every term toward zero does not
// constitute convergence. Log scaling keeps genuine cancellations representable.
type RateResidual = ((r: number) => number) & { readonly logRate?: (q: number) => number };
function discountedResidual(values: readonly number[], time: (index: number) => number, c: FunctionContext): RateResidual {
  // Net identical exponents exactly in units of the least binary64 value.
  // The accumulator is bounded by binary64's 2098-bit span plus log2(count).
  // This avoids both intermediate overflow and losing small uncancelled flows.
  const grouped = new Map<number, bigint>();
  const bits = new DataView(new ArrayBuffer(8));
  values.forEach((value, index) => {
    c.operation();
    check(Number.isFinite(value));
    if (value === 0) return;
    bits.setFloat64(0, value);
    const encoded = bits.getBigUint64(0);
    const exponent = Number((encoded >> 52n) & 2047n);
    const significand = (encoded & ((1n << 52n) - 1n)) | (exponent ? 1n << 52n : 0n);
    c.operation(1 + Math.ceil((exponent + 52) / 64));
    const units = significand << BigInt(exponent ? exponent - 1 : 0);
    const at = time(index);
    grouped.set(at, (grouped.get(at) ?? 0n) + (value < 0 ? -units : units));
  });
  const terms: {sign: number; log: number; time: number}[] = [];
  for (const [at, net] of grouped) {
    c.operation(34 + Math.ceil(Math.log2(values.length + 1) / 64));
    if (net === 0n) continue;
    const magnitude = net < 0n ? -net : net;
    const shift = Math.max(0, magnitude.toString(2).length - 53);
    const leading = Number(magnitude >> BigInt(shift));
    const coefficient = leading * Math.pow(2, shift - 1074);
    const log = Number.isFinite(coefficient) ? Math.log(coefficient) : Math.log(leading) + (shift - 1074) * Math.LN2;
    terms.push({sign: net < 0n ? -1 : 1, log, time: at});
  }
  const logRate = (q: number) => {
    let largest = -Infinity;
    for (const term of terms) { c.operation(); largest = Math.max(largest, term.log - term.time * q); }
    let residual = 0, magnitude = 0;
    for (const term of terms) {
      c.operation();
      const weight = Math.exp(term.log - term.time * q - largest);
      residual += term.sign * weight; magnitude += weight;
    }
    return terms.length ? residual / magnitude : 0;
  };
  return Object.assign((r: number) => { check(r > -1); return logRate(Math.log1p(r)); }, {logRate});
}
// Newton in log(1+r), followed by bounded bracketing; no unbounded iteration.
function solve(
  fn: RateResidual,
  guess: number,
  c: FunctionContext,
  bracket = true,
  iterations = 80,
  residualTolerance = 1e-10,
): number {
  check(guess > -1);
  // Cash-flow residuals retain the solver coordinate near r=-1, where
  // expm1(x) followed by log1p(r) would lose significant digits.
  const evaluate = fn.logRate ?? ((q: number) => fn(Math.expm1(q)));
  let x = Math.log1p(guess);
  for (let i = 0; i < iterations; i++) {
    c.operation(3);
    const y = evaluate(x);
    if (Number.isFinite(y) && Math.abs(y) < residualTolerance) return Math.expm1(x);
    const h = 1e-5;
    const d = (evaluate(x + h) - evaluate(x - h)) / (2 * h);
    if (!Number.isFinite(d) || d === 0) break;
    const next = x - y / d;
    if (!Number.isFinite(next) || next < -35 || next > 700) break;
    if (next === x) break;
    x = next;
  }
  if (!bracket) return fail();
  let lo = -25,
    a = evaluate(lo);
  for (let hi = -24.5; hi <= 50; hi += 0.5) {
    c.operation();
    if (a === 0) return Math.expm1(lo);
    const b = evaluate(hi);
    if (b === 0) return Math.expm1(hi);
    if (Number.isFinite(a) && Number.isFinite(b) && (a > 0) !== (b > 0)) {
      let left = lo,
        right = hi;
      for (let j = 0; j < 100; j++) {
        c.operation();
        const mid = (left + right) / 2,
          y = evaluate(mid);
        if (Number.isFinite(y) && Math.abs(y) < residualTolerance) return Math.expm1(mid);
        if (right - left < 1e-13) break;
        if (y > 0 === a > 0) {
          left = mid;
          a = y;
        } else right = mid;
      }
    }
    lo = hi;
    a = b;
  }
  return fail();
}
define("FV", 3, 5, ([r, n, p, pv = 0, t = 0]) => future(r!, n!, p!, pv, t));
define("PV", 3, 5, ([r, n, p, f = 0, t = 0]) => {
  type(t);
  const g = growth(r!, n!);
  check(g !== 0, "#DIV/0!");
  return -(f + p! * (1 + r! * t) * annuity(r!, n!)) / g;
});
define("PMT", 3, 5, ([r, n, p, f = 0, t = 0]) => payment(r!, n!, p!, f, t));
define("IPMT", 4, 6, ([r, k, n, p, f = 0, t = 0]) =>
  interest(r!, k!, n!, p!, f, t),
);
define(
  "PPMT",
  4,
  6,
  ([r, k, n, p, f = 0, t = 0]) =>
    payment(r!, n!, p!, f, t) - interest(r!, k!, n!, p!, f, t),
);
define("NPER", 3, 5, ([r, p, pv, f = 0, t = 0]) => {
  type(t);
  if (r === 0) {
    check(p !== 0, "#DIV/0!");
    return -(pv! + f) / p!;
  }
  const a = (p! * (1 + r! * t)) / r!;
  check(1 + r! > 0 && (a - f) / (pv! + a) > 0);
  return Math.log((a - f) / (pv! + a)) / Math.log1p(r!);
});
define("RATE", 3, 6, ([n, p, pv, f = 0, t = 0, g = 0.1], c) => {
  type(t);
  check(n! > 0);
  // Scale each trial by its cash-flow magnitudes in log space. A tiny
  // terminal value must not make an unrelated rate appear converged, and
  // underflow of a lone discounted cash flow must never manufacture a root.
  check(pv !== 0 || p !== 0 || f !== 0);
  return solve((r) => {
    const q = Math.log1p(r), power = n! * q;
    const logAnnuity = r === 0 ? Math.log(n!) :
      (power > 700 ? power : Math.log(Math.abs(Math.expm1(power)))) - Math.log(Math.abs(r));
    const terms = [
      {sign: Math.sign(pv!), log: Math.log(Math.abs(pv!)) + power},
      {sign: Math.sign(p!), log: Math.log(Math.abs(p!)) + Math.log1p(r * t) + logAnnuity},
      {sign: Math.sign(f), log: Math.log(Math.abs(f))},
    ].filter(term => term.sign !== 0);
    const largest = Math.max(...terms.map(term => term.log));
    let sum = 0, magnitude = 0;
    for (const term of terms) {
      const weight = Math.exp(term.log - largest);
      sum += term.sign * weight; magnitude += weight;
    }
    return sum / magnitude;
  }, g, c, false, 20);
});
for (const name of ["CUMIPMT", "CUMPRINC"])
  define(name, 6, 6, ([r, n, p, s, e, t], c) => {
    check(r! > 0 && n! > 0 && p! > 0);
    s = trunc(s!);
    e = trunc(e!);
    check(s >= 1 && e >= s && e <= n!);
    type(t!);
    let sum = 0;
    for (let k = s; k <= e; k++) {
      c.operation();
      const ip = interest(r!, k, n!, p!, 0, t!);
      sum += name === "CUMIPMT" ? ip : payment(r!, n!, p!, 0, t!) - ip;
    }
    return sum;
  });
define("ISPMT", 4, 4, ([r, p, n, pv]) => {
  check(n !== 0, "#DIV/0!");
  return pv! * r! * (p! / n! - 1);
});
define("EFFECT", 2, 2, ([r, n]) => {
  n = trunc(n!);
  check(r! > 0 && n >= 1);
  return Math.expm1(n * Math.log1p(r! / n));
});
define("NOMINAL", 2, 2, ([r, n]) => {
  n = trunc(n!);
  check(r! > 0 && n >= 1);
  return n * Math.expm1(Math.log1p(r!) / n);
});
define("PDURATION", 3, 3, ([r, p, f]) => {
  check(r! > 0 && p! > 0 && f! > 0);
  return Math.log(f! / p!) / Math.log1p(r!);
});
define("RRI", 3, 3, ([n, p, f]) => {
  check(n! > 0);
  check(p !== 0, "#DIV/0!");
  check(f! / p! >= 0);
  return Math.pow(f! / p!, 1 / n!) - 1;
});
for (const name of ["DOLLARDE", "DOLLARFR"])
  define(name, 2, 2, ([d, f]) => {
    f = trunc(f!);
    check(f >= 0);
    check(f !== 0, "#DIV/0!");
    const scale = 10 ** Math.ceil(Math.log10(f));
    return (
      trunc(d!) +
      (d! - trunc(d!)) * (name === "DOLLARDE" ? scale / f : f / scale)
    );
  });
define("SLN", 3, 3, ([c, s, l]) => {
  check(l !== 0, "#DIV/0!");
  return (c! - s!) / l!;
});
define("SYD", 4, 4, ([c, s, l, p]) => {
  check(l! > 0 && p! > 0 && p! <= l!);
  return ((c! - s!) * (l! - p! + 1) * 2) / (l! * (l! + 1));
});
define("DDB", 4, 5, ([c, s, l, p, f = 2]) => {
  check(c! >= 0 && s! >= 0 && l! > 0 && p! > 0 && p! <= l! && f > 0);
  const rate = Math.min(1, f / l!);
  const before = c! * Math.pow(1 - rate, p! - 1);
  return Math.max(0, Math.min(before * rate, before - s!));
});
define("DB", 4, 5, ([cost, s, l, p, m = 12], c) => {
  p = trunc(p!);
  m = trunc(m);
  check(
    cost! >= 0 &&
      s! >= 0 &&
      l! > 0 &&
      p >= 1 &&
      p <= l! + 1 &&
      m >= 1 &&
      m <= 12,
  );
  if (cost === 0) return 0;
  const r = Math.round((1 - Math.pow(s! / cost!, 1 / l!)) * 1000) / 1000;
  let book = cost!,
    dep = 0;
  for (let i = 1; i <= p; i++) {
    c.operation();
    dep =
      i === 1
        ? (cost! * r * m) / 12
        : i > l!
          ? (book * r * (12 - m)) / 12
          : book * r;
    book -= dep;
  }
  return dep;
});
define("VDB", 5, 7, ([cost, s, l, start, end, f = 2, no = 0], c) => {
  check(
    cost! >= 0 &&
      s! >= 0 &&
      l! > 0 &&
      start! >= 0 &&
      end! >= start! &&
      end! <= l! &&
      f > 0,
  );
  let book = cost!,
    sum = 0;
  for (let i = 0; i < Math.ceil(end!); i++) {
    c.operation();
    let dep = Math.min((book * f) / l!, Math.max(0, book - s!));
    if (!no) dep = Math.max(dep, (book - s!) / (l! - i));
    dep = Math.max(0, dep);
    sum += dep * Math.max(0, Math.min(end!, i + 1) - Math.max(start!, i));
    book -= dep;
  }
  return sum;
});

// Serial arithmetic retains Excel's fictitious 1900-02-29.
const DAY = 86400000;
function dateParts(s: number, c: FunctionContext): [number, number, number] {
  s = trunc(s);
  check(s >= 0 && s <= (c.dateSystem === "1904" ? 2957003 : 2958465));
  if (c.dateSystem === "1900" && s === 60) return [1900, 2, 29];
  const d = new Date(
    Date.UTC(
      c.dateSystem === "1904" ? 1904 : 1899,
      c.dateSystem === "1904" ? 0 : 11,
      c.dateSystem === "1904" ? 1 : 31,
    ) +
      (s - (c.dateSystem === "1900" && s > 60 ? 1 : 0)) * DAY,
  );
  return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
}
function serial(y: number, m: number, d: number, c: FunctionContext): number {
  if (c.dateSystem === "1900" && y === 1900 && m === 2 && d === 29) return 60;
  const v =
    (Date.UTC(y, m - 1, d) -
      Date.UTC(
        c.dateSystem === "1904" ? 1904 : 1899,
        c.dateSystem === "1904" ? 0 : 11,
        c.dateSystem === "1904" ? 1 : 31,
      )) /
    DAY;
  return v + (c.dateSystem === "1900" && v >= 60 ? 1 : 0);
}
function monthDays(y: number, m: number): number {
  return y === 1900 && m === 2 ? 29 : new Date(Date.UTC(y, m, 0)).getUTCDate();
}
function shift(s: number, months: number, c: FunctionContext): number {
  const [y, m, d] = dateParts(s, c);
  const total = y * 12 + m - 1 + months,
    yy = Math.floor(total / 12),
    mm = total - yy * 12 + 1;
  return serial(
    yy,
    mm,
    d === monthDays(y, m) ? monthDays(yy, mm) : Math.min(d, monthDays(yy, mm)),
    c,
  );
}
function basis(b: number): number {
  b = trunc(b);
  check(b >= 0 && b <= 4);
  return b;
}
function days(a: number, b: number, base: number, c: FunctionContext): number {
  if (base !== 0 && base !== 4) return trunc(b) - trunc(a);
  const [y, m, d] = dateParts(a, c),
    [yy, mm, dd] = dateParts(b, c);
  let d1 = d,
    d2 = dd;
  if (base === 4) {
    d1 = Math.min(d, 30);
    d2 = Math.min(dd, 30);
  } else {
    const feb = m === 2 && d === monthDays(y, m),
      feb2 = mm === 2 && dd === monthDays(yy, mm);
    if (feb) d1 = 30;
    if (feb && feb2) d2 = 30;
    if (d1 === 31) d1 = 30;
    if (d2 === 31 && d1 >= 30) d2 = 30;
  }
  return (yy - y) * 360 + (mm - m) * 30 + d2 - d1;
}
function yearDays(
  a: number,
  b: number,
  base: number,
  c: FunctionContext,
): number {
  if (base === 0 || base === 2 || base === 4) return 360;
  if (base === 3) return 365;
  const [y, m, d] = dateParts(a, c),
    [yy, mm, dd] = dateParts(b, c);
  const leap = (v: number) =>
    (v === 1900 && c.dateSystem === "1900") ||
    (v % 4 === 0 && (v % 100 !== 0 || v % 400 === 0));
  if (y === yy) return leap(y) ? 366 : 365;
  if (yy === y + 1 && (mm < m || (mm === m && dd <= d))) {
    return (leap(y) && m < 3) ||
      (leap(yy) && (mm > 2 || (mm === 2 && dd === 29)))
      ? 366
      : 365;
  }
  let sum = 0;
  for (let k = y; k <= yy; k++) {
    c.operation();
    sum += leap(k) ? 366 : 365;
  }
  return sum / (yy - y + 1);
}
function coupon(
  s: number,
  m: number,
  f: number,
  b: number,
  c: FunctionContext,
) {
  s = trunc(s);
  m = trunc(m);
  dateParts(s, c);
  dateParts(m, c);
  f = trunc(f);
  b = basis(b);
  check(s < m && [1, 2, 4].includes(f));
  let n = 1,
    next = m,
    prev = shift(m, -12 / f, c);
  while (prev > s) {
    c.operation();
    n++;
    next = prev;
    prev = shift(m, (-n * 12) / f, c);
  }
  const e = b === 1 ? next - prev : (b === 3 ? 365 : 360) / f;
  return {
    prev,
    next,
    n,
    e,
    a: days(prev, s, b, c),
    d: b === 0 ? e - days(prev, s, b, c) : days(s, next, b, c),
    f,
    b,
  };
}
for (const name of [
  "COUPDAYBS",
  "COUPDAYS",
  "COUPDAYSNC",
  "COUPNCD",
  "COUPNUM",
  "COUPPCD",
])
  define(name, 3, 4, ([s, m, f, b = 0], c) => {
    const q = coupon(s!, m!, f!, b, c);
    return {
      COUPDAYBS: q.a,
      COUPDAYS: q.e,
      COUPDAYSNC: q.d,
      COUPNCD: q.next,
      COUPNUM: q.n,
      COUPPCD: q.prev,
    }[name]!;
  });
function bond(
  s: number,
  m: number,
  r: number,
  y: number,
  red: number,
  f: number,
  b: number,
  c: FunctionContext,
): number {
  const q = coupon(s, m, f, b, c);
  check(r >= 0 && red > 0 && y > -q.f);
  const t = q.d / q.e,
    cp = (100 * r) / q.f;
  if (q.n === 1) return (red + cp) / (1 + (y / q.f) * t) - (cp * q.a) / q.e;
  let pv = 0;
  for (let k = 0; k < q.n; k++) {
    c.operation();
    pv += (cp + (k === q.n - 1 ? red : 0)) / Math.pow(1 + y / q.f, k + t);
  }
  return pv - (cp * q.a) / q.e;
}
define("PRICE", 6, 7, ([s, m, r, y, red, f, b = 0], c) => {
  check(y! >= 0);
  return bond(s!, m!, r!, y!, red!, f!, b, c);
});
define("YIELD", 6, 7, ([s, m, r, p, red, f, b = 0], c) => {
  check(p! > 0);
  return solve((y) => bond(s!, m!, r!, y, red!, f!, b, c) - p!, 0.1, c);
});
for (const name of ["DURATION", "MDURATION"])
  define(name, 5, 6, ([s, m, r, y, f, b = 0], c) => {
    check(r! >= 0 && y! >= 0);
    const q = coupon(s!, m!, f!, b, c);
    let pv = 0,
      weighted = 0;
    for (let k = 0; k < q.n; k++) {
      c.operation();
      const t = k + q.d / q.e,
        v =
          ((100 * r!) / q.f + (k === q.n - 1 ? 100 : 0)) /
          Math.pow(1 + y! / q.f, t);
      pv += v;
      weighted += t * v;
    }
    return weighted / pv / q.f / (name === "MDURATION" ? 1 + y! / q.f : 1);
  });
for (const name of ["DISC", "INTRATE", "RECEIVED", "PRICEDISC", "YIELDDISC"])
  define(name, 4, 5, ([s, m, p, red, b = 0], c) => {
    dateParts(s!, c);
    dateParts(m!, c);
    s = trunc(s!);
    m = trunc(m!);
    b = basis(b);
    check(s < m && p! > 0 && red! > 0);
    const yf = days(s, m, b, c) / yearDays(s, m, b, c);
    if (name === "DISC") return (red! - p!) / red! / yf;
    if (name === "INTRATE") return (red! - p!) / p! / yf;
    if (name === "PRICEDISC") return red! * (1 - p! * yf);
    if (name === "YIELDDISC") return (red! - p!) / p! / yf;
    check(1 - red! * yf > 0);
    return p! / (1 - red! * yf);
  });
for (const name of ["PRICEMAT", "YIELDMAT"])
  define(name, 5, 6, ([s, m, i, r, v, b = 0], c) => {
    s = trunc(s!);
    m = trunc(m!);
    i = trunc(i!);
    dateParts(s, c);
    dateParts(m, c);
    dateParts(i, c);
    b = basis(b);
    check(
      i <= s &&
        s < m &&
        r! >= 0 &&
        v! >= (name === "PRICEMAT" ? 0 : Number.MIN_VALUE),
    );
    const den = yearDays(s, m, b, c),
      a = days(i, s, b, c) / den,
      d = days(s, m, b, c) / den,
      t = days(i, m, b, c) / den;
    return name === "PRICEMAT"
      ? (100 * (1 + r! * t)) / (1 + v! * d) - 100 * r! * a
      : ((100 * (1 + r! * t)) / (v! + 100 * r! * a) - 1) / d;
  });
for (const name of ["TBILLEQ", "TBILLPRICE", "TBILLYIELD"])
  define(name, 3, 3, ([s, m, v], c) => {
    dateParts(s!, c);
    dateParts(m!, c);
    const d = trunc(m!) - trunc(s!);
    check(d >= 0 && d <= 365 && v! > 0);
    if (name === "TBILLEQ") return (365 * v!) / (360 - v! * d);
    if (name === "TBILLPRICE") {
      check(d > 0);
      return 100 * (1 - (v! * d) / 360);
    }
    check(d !== 0);
    return (((100 - v!) / v!) * 360) / d;
  });
define("ACCRINTM", 3, 5, ([i, s, r, p = 1000, b = 0], c) => {
  dateParts(i!, c);
  dateParts(s!, c);
  b = basis(b);
  check(trunc(i!) < trunc(s!) && r! > 0 && p > 0);
  return (p * r! * days(i!, s!, b, c)) / yearDays(i!, s!, b, c);
});
// Sum fractional quasi-coupon periods against an anchored coupon calendar.
function fraction(
  a: number,
  z: number,
  anchor: number,
  f: number,
  b: number,
  c: FunctionContext,
): number {
  let end = anchor,
    k = 0;
  while (end < z) {
    c.operation();
    end = shift(anchor, (++k * 12) / f, c);
  }
  let sum = 0;
  while (end > a) {
    c.operation();
    const start = shift(anchor, (--k * 12) / f, c),
      lo = Math.max(a, start),
      hi = Math.min(z, end);
    if (hi > lo)
      sum +=
        days(lo, hi, b, c) /
        (b === 1 ? end - start : (b === 3 ? 365 : 360) / f);
    end = start;
  }
  return sum;
}
define(
  "ACCRINT",
  6,
  8,
  ([i, first, s, r, p = 1000, f, b = 0, method = 1], c) => {
    dateParts(i!, c);
    dateParts(first!, c);
    dateParts(s!, c);
    i = trunc(i!);
    s = trunc(s!);
    first = trunc(first!);
    b = basis(b);
    f = trunc(f!);
    check(i < s && r! > 0 && p! > 0 && [1, 2, 4].includes(f));
    return (
      ((p! * r!) / f) *
      fraction(!method && s > first ? first : i, s, first, f, b, c)
    );
  },
);
for (const name of ["ODDLPRICE", "ODDLYIELD"])
  define(name, 7, 8, ([s, m, last, r, v, red, f, b = 0], c) => {
    s = trunc(s!);
    m = trunc(m!);
    last = trunc(last!);
    dateParts(s, c);
    dateParts(m, c);
    dateParts(last, c);
    b = basis(b);
    f = trunc(f!);
    check(
      last < s &&
        s < m &&
        r! >= 0 &&
        v! >= 0 &&
        red! > 0 &&
        [1, 2, 4].includes(f),
    );
    const whole = fraction(last, m, last, f, b, c),
      accr = fraction(last, s, last, f, b, c),
      remain = fraction(s, m, last, f, b, c),
      cp = (100 * r!) / f;
    return name === "ODDLPRICE"
      ? (red! + cp * whole) / (1 + (v! / f) * remain) - cp * accr
      : (((red! + cp * whole) / (v! + cp * accr) - 1) * f) / remain;
  });
function oddFirst(
  s: number,
  m: number,
  i: number,
  first: number,
  r: number,
  y: number,
  red: number,
  f: number,
  b: number,
  c: FunctionContext,
): number {
  s = trunc(s);
  m = trunc(m);
  i = trunc(i);
  first = trunc(first);
  [s, m, i, first].forEach((v) => dateParts(v, c));
  f = trunc(f);
  b = basis(b);
  check(
    i < s &&
      s < first &&
      first < m &&
      r >= 0 &&
      y > -f &&
      red > 0 &&
      [1, 2, 4].includes(f),
  );
  const q = coupon(first, m, f, b, c);
  check(q.prev === first);
  const cp = (100 * r) / f,
    initial = fraction(i, first, first, f, b, c),
    t = fraction(s, first, first, f, b, c);
  let pv = (cp * initial) / Math.pow(1 + y / f, t);
  for (let k = 1; k <= q.n; k++) {
    c.operation();
    pv += (cp + (k === q.n ? red : 0)) / Math.pow(1 + y / f, k + t);
  }
  return pv - cp * fraction(i, s, first, f, b, c);
}
define("ODDFPRICE", 8, 9, ([s, m, i, first, r, y, red, f, b = 0], c) => {
  check(y! >= 0);
  return oddFirst(s!, m!, i!, first!, r!, y!, red!, f!, b, c);
});
define("ODDFYIELD", 8, 9, ([s, m, i, first, r, p, red, f, b = 0], c) => {
  check(p! > 0);
  return solve(
    (y) => oddFirst(s!, m!, i!, first!, r!, y, red!, f!, b, c) - p!,
    0.1,
    c,
  );
});
for (const name of ["AMORLINC", "AMORDEGRC"])
  define(name, 6, 7, ([cost, purchase, first, s, p, r, b = 0], c) => {
    dateParts(purchase!, c);
    dateParts(first!, c);
    b = basis(b);
    p = trunc(p!);
    check(
      b !== 2 &&
        cost! >= 0 &&
        s! >= 0 &&
        s! <= cost! &&
        purchase! <= first! &&
        p >= 0 &&
        r! > 0,
    );
    const yf =
      days(purchase!, first!, b, c) / yearDays(purchase!, first!, b, c);
    if (name === "AMORLINC") {
      const initial = Math.min(cost! - s!, cost! * r! * yf);
      return p === 0
        ? initial
        : Math.max(
            0,
            Math.min(cost! * r!, cost! - s! - initial - (p - 1) * cost! * r!),
          );
    }
    const life = 1 / r!;
    check(life >= 3 && !(life > 4 && life < 5));
    const rate = r! * (life < 5 ? 1.5 : life <= 6 ? 2 : 2.5);
    let dep = Math.round(cost! * rate * yf),
      book = cost! - dep;
    if (p === 0) return dep;
    for (let k = 1; k <= p; k++) {
      c.operation();
      dep = Math.round(book * rate);
      if (book - dep < s!) {
        dep = k === p ? Math.round(book * 0.5) : 0;
        return dep;
      }
      book -= dep;
    }
    return dep;
  });

function vector(
  expr: FormulaExpression,
  c: FunctionContext,
  coerce = false,
  strict = false,
): number[] {
  const v = c.evaluate(expr);
  const ref = expr.kind === "reference";
  const rows =
    "kind" in v ? (v.kind === "array" ? v.rows : fail("#VALUE!")) : [[v]];
  let count = 0;
  const out: number[] = [];
  for (const row of rows)
    for (const item of row) {
      c.operation();
      check(++count <= c.maxArrayCells);
      if (item.type === "error") throw new FinancialError(item);
      if (item.type === "number") out.push(item.value);
      else if (strict) {
        check(item.type === "blank", "#VALUE!");
        out.push(0);
      } else if (coerce || (!ref && !("kind" in v))) out.push(numeric(item));
    }
  return out;
}
for (const name of ["NPV", "IRR", "MIRR", "FVSCHEDULE", "XNPV", "XIRR"])
  registry.set(name, (args, c) => {
    const limits: Record<string, [number, number]> = {
      NPV: [2, 255],
      IRR: [1, 2],
      MIRR: [3, 3],
      FVSCHEDULE: [2, 2],
      XNPV: [3, 3],
      XIRR: [2, 3],
    };
    const [min, max] = limits[name]!;
    if (args.length < min || args.length > max) return functionError();
    try {
      c.operation();
      const scalar = (i: number, d = 0) => {
        if (!args[i]) return d;
        const value = c.evaluate(args[i]!);
        return omitted(value) ? d : numeric(value);
      };
      if (name === "NPV") {
        const r = scalar(0);
        check(r !== -1, "#DIV/0!");
        let sum = 0,
          k = 1;
        for (const arg of args.slice(1))
          for (const v of vector(arg, c)) {
            sum += v / Math.pow(1 + r, k++);
          }
        return functionNumber(sum);
      }
      if (name === "FVSCHEDULE") {
        let p = scalar(0);
        for (const r of vector(args[1]!, c, false, true)) p *= 1 + r;
        return functionNumber(p);
      }
      const values = vector(
        args[name === "XNPV" ? 1 : 0]!,
        c,
        false,
        name === "XNPV" || name === "XIRR",
      );
      check(values.length > 0);
      if (name === "XNPV" || name === "XIRR") {
        const dates = vector(args[name === "XNPV" ? 2 : 1]!, c, true).map(
          trunc,
        );
        check(dates.length === values.length);
        for (const d of dates) {
          dateParts(d, c);
          check(d >= dates[0]!);
        }
        const npv = (r: number) => {
          check(r > -1);
          let sum = 0;
          for (let i = 0; i < values.length; i++) {
            c.operation();
            sum += values[i]! / Math.pow(1 + r, (dates[i]! - dates[0]!) / 365);
          }
          return sum;
        };
        if (name === "XNPV") return functionNumber(npv(scalar(0)));
        check(values.some((v) => v > 0) && values.some((v) => v < 0));
        const residual = discountedResidual(values, i => (dates[i]! - dates[0]!) / 365, c);
        return functionNumber(solve(residual, scalar(2, 0.1), c, true, 80, 1e-13));
      }
      check(values.some((v) => v > 0) && values.some((v) => v < 0));
      if (name === "MIRR") {
        const f = scalar(1),
          r = scalar(2);
        check(f !== -1 && r !== -1, "#DIV/0!");
        let pos = 0,
          neg = 0;
        for (let i = 0; i < values.length; i++) {
          c.operation();
          if (values[i]! > 0)
            pos += values[i]! * Math.pow(1 + r, values.length - 1 - i);
          else neg += values[i]! / Math.pow(1 + f, i);
        }
        return functionNumber(
          Math.pow(-pos / neg, 1 / (values.length - 1)) - 1,
        );
      }
      return functionNumber(solve(discountedResidual(values, i => i, c), scalar(1, 0.1), c, true, 80, 1e-13));
    } catch (e) {
      if (e instanceof FinancialError) return e.value;
      throw e;
    }
  });
export const financialFunctions: FunctionRegistry = registry;
