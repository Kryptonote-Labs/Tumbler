import { functionError as error, functionNumber as number, functionNumeric, functionText, functionMatrix, type FunctionContext, type FunctionRegistry, type FunctionValue, type ExtendedFunction } from '../function-runtime.ts';
import type { FormulaScalarValue as Scalar } from '../evaluator.ts';

const registry = new Map<string, ExtendedFunction>();
const text = (value: string): Scalar => ({ type: 'string', value });
type ScalarHandler = (values: readonly Scalar[], context: FunctionContext) => Scalar;
// Broadcast singleton dimensions, retaining individual element errors.
function define(name: string, min: number, max: number, handler: ScalarHandler) {
  registry.set(name, (args, context) => {
    if (args.length < min || args.length > max) return error();
    const evaluated = args.map(arg => context.evaluate(arg));
    // Parent runtime represents omitted arguments with kind:'omitted'. Keep
    // trailing optional omissions absent; required omissions coerce as blanks.
    const omitted = (v: FunctionValue) => 'kind' in v && String(v.kind) === 'omitted';
    while (evaluated.length > min && omitted(evaluated[evaluated.length - 1]!)) evaluated.pop();
    const matrices = evaluated.map(v => functionMatrix(omitted(v) ? {type:'blank'} : v));
    const height = Math.max(1, ...matrices.map(m => m.length));
    const width = Math.max(1, ...matrices.map(m => m[0]?.length ?? 0));
    if (height * width > context.maxArrayCells) return error('#NUM!');
    if (matrices.some(m => (m.length !== 1 && m.length !== height) || m.some(r => r.length !== 1 && r.length !== width))) return error('#N/A');
    const rows: Scalar[][] = [];
    for (let r = 0; r < height; r++) {
      const row: Scalar[] = [];
      for (let c = 0; c < width; c++) {
        context.operation();
        const values = matrices.map(m => m[m.length === 1 ? 0 : r]![m[0]!.length === 1 ? 0 : c]!);
        row.push(values.find(v => v.type === 'error') ?? handler(values, context));
      }
      rows.push(row);
    }
    return matrices.some(m => m.length > 1 || m[0]!.length > 1) ? { kind: 'array', rows } : rows[0]![0]!;
  });
}
function numeric(name: string, min: number, max: number, handler: (values: number[], context: FunctionContext) => Scalar) {
  define(name, min, max, (values, ctx) => {
    const converted = values.map(functionNumeric);
    const failure = converted.find(v => v.type !== 'number');
    return failure ?? handler(converted.map(v => (v as { value: number }).value), ctx);
  });
}

const bases: Record<string, number> = { BIN: 2, OCT: 8, HEX: 16, DEC: 10 };
for (const [from, base] of Object.entries(bases)) for (const [to, target] of Object.entries(bases)) {
  if (from === to) continue;
  define(`${from}2${to}`, 1, to === 'DEC' ? 1 : 2, values => {
    let value: number;
    if (base === 10) {
      const n = functionNumeric(values[0]!);
      if (n.type !== 'number') return n;
      value = Math.trunc(n.value);
    } else {
      const s = values[0]!.type === 'blank' ? '0' : functionText(values[0]!);
      if (!new RegExp(`^[0-${base === 2 ? '1' : base === 8 ? '7' : '9A-Fa-f'}]{1,10}$`).test(s)) return error('#NUM!');
      value = parseInt(s, base);
      if (s.length === 10 && value >= base ** 10 / 2) value -= base ** 10;
    }
    if (target === 10) return number(value);
    if (value < -(target ** 10 / 2) || value >= target ** 10 / 2) return error('#NUM!');
    if (value < 0) return text((value + target ** 10).toString(target).toUpperCase());
    let s = value.toString(target).toUpperCase();
    if (values[1]) {
      const p = functionNumeric(values[1]);
      if (p.type !== 'number') return p;
      const places = Math.trunc(p.value);
      if (places < 1 || places > 10 || places < s.length) return error('#NUM!');
      s = s.padStart(places, '0');
    }
    return text(s);
  });
}
const bitMax = 2 ** 48 - 1;
for (const name of ['BITAND', 'BITOR', 'BITXOR', 'BITLSHIFT', 'BITRSHIFT']) numeric(name, 2, 2, ([a = 0, b = 0]) => {
  if (!Number.isInteger(a) || a < 0 || a > bitMax) return error('#NUM!');
  if (name.endsWith('SHIFT')) {
    if (!Number.isInteger(b) || Math.abs(b) > 53) return error('#NUM!');
    const shift = name === 'BITLSHIFT' ? b : -b;
    const result = shift >= 0 ? a * 2 ** shift : Math.floor(a / 2 ** -shift);
    return result > bitMax ? error('#NUM!') : number(result);
  }
  if (!Number.isInteger(b) || b < 0 || b > bitMax) return error('#NUM!');
  const x = BigInt(a), y = BigInt(b);
  return number(Number(name === 'BITAND' ? x & y : name === 'BITOR' ? x | y : x ^ y));
});
numeric('DELTA', 1, 2, ([a, b = 0]) => number(a === b ? 1 : 0));
numeric('GESTEP', 1, 2, ([a = 0, b = 0]) => number(a >= b ? 1 : 0));

// Regularized gamma(1/2,x²): convergent series near zero, continued fraction
// in the tail. Computing erfc directly avoids catastrophic tail cancellation.
function erfc(x: number, ctx: FunctionContext): number {
  if (x < 0) return 2 - erfc(-x, ctx);
  if (x === 0) return 1;
  if (x > 27.3) return 0;
  const z = x * x, scale = Math.exp(-z + Math.log(x) - Math.log(Math.PI) / 2);
  if (z < 1.5) {
    let term = 2, sum = term;
    for (let k = 1; k <= 256; k++) { ctx.operation(); term *= z / (k + 0.5); sum += term; if (Math.abs(term) < Math.abs(sum) * 2e-16) break; }
    return 1 - scale * sum;
  }
  let b = z + 0.5, c = 1e300, d = 1 / b, h = d;
  for (let k = 1; k <= 512; k++) {
    ctx.operation(); const a = -k * (k - 0.5); b += 2;
    d = a * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + a / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d; const delta = d * c; h *= delta;
    if (Math.abs(delta - 1) < 4e-16) break;
  }
  return scale * h;
}
function erf(x: number, ctx: FunctionContext): number {
  if (Math.abs(x) >= 1) return x < 0 ? erfc(-x, ctx) - 1 : 1 - erfc(x, ctx);
  let term = x, sum = x;
  for (let k = 1; k <= 128; k++) { ctx.operation(); term *= -x * x / k; const add = term / (2 * k + 1); sum += add; if (Math.abs(add) <= Math.abs(sum) * 2e-16) break; }
  return 2 / Math.sqrt(Math.PI) * sum;
}
for (const name of ['ERF', 'ERF.PRECISE', 'ERFC', 'ERFC.PRECISE']) numeric(name, 1, name === 'ERF' ? 2 : 1, ([a = 0, b], ctx) => number(name.startsWith('ERFC') ? erfc(a, ctx) : b === undefined ? erf(a, ctx) : erf(b, ctx) - erf(a, ctx)));

type Complex = { re: number; im: number; suffix: string };
const realPattern = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?';
function complex(value: Scalar): Complex | Scalar {
  if (value.type === 'boolean') return error();
  if (value.type === 'number' || value.type === 'blank') return { re: value.type === 'blank' ? 0 : value.value, im: 0, suffix: 'i' };
  if (value.type === 'error') return value;
  const s = value.value;
  if (new RegExp(`^${realPattern}$`).test(s)) return Number.isFinite(Number(s)) ? { re: Number(s), im: 0, suffix: 'i' } : error('#NUM!');
  const match = s.match(new RegExp(`^(?:(${realPattern})(?=[+-]))?([+-]?(?:(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?)?)([ij])$`));
  if (!match) return error('#NUM!');
  const z = { re: match[1] ? Number(match[1]) : 0, im: match[2] === '-' ? -1 : match[2] === '+' || match[2] === '' ? 1 : Number(match[2]), suffix: match[3]! };
  return Number.isFinite(z.re) && Number.isFinite(z.im) ? z : error('#NUM!');
}
function coefficient(value: number): string {
  const [mantissa, exponent] = value.toPrecision(15).split('e');
  if (exponent !== undefined && (Number(exponent) <= -20 || Number(exponent) >= 21)) {
    const significant = mantissa!.includes('.') ? mantissa!.replace(/0+$/, '').replace(/\.$/, '') : mantissa!;
    return `${significant}E${Number(exponent) >= 0 ? '+' : ''}${Number(exponent)}`;
  }
  const plain = exponent === undefined ? mantissa! : (() => {
    const negative = mantissa!.startsWith('-');
    const digits = mantissa!.replace('-', '').replace('.', '');
    const point = 1 + Number(exponent);
    const magnitude = point <= 0 ? `0.${'0'.repeat(-point)}${digits}`
      : point >= digits.length ? digits + '0'.repeat(point - digits.length)
      : `${digits.slice(0, point)}.${digits.slice(point)}`;
    return negative ? '-' + magnitude : magnitude;
  })();
  return plain.includes('.') ? plain.replace(/0+$/, '').replace(/\.$/, '') : plain;
}
function format(z: Complex): Scalar {
  if (!Number.isFinite(z.re) || !Number.isFinite(z.im)) return error('#NUM!');
  const re = Object.is(z.re, -0) ? 0 : z.re, im = Object.is(z.im, -0) ? 0 : z.im;
  if (im === 0) return text(coefficient(re));
  return text(`${re === 0 ? '' : coefficient(re)}${im < 0 ? '-' : re === 0 ? '' : '+'}${Math.abs(im) === 1 ? '' : coefficient(Math.abs(im))}${z.suffix}`);
}
const mul = (a: Complex, b: Complex): Complex => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re, suffix: a.suffix });
function div(a: Complex, b: Complex): Complex {
  // Scale by the larger denominator component to avoid squaring overflow.
  const scale = Math.max(Math.abs(b.re), Math.abs(b.im));
  const r = b.re / scale, i = b.im / scale, d = r * r + i * i;
  return { re: ((a.re / scale) * r + (a.im / scale) * i) / d, im: ((a.im / scale) * r - (a.re / scale) * i) / d, suffix: a.suffix };
}
define('COMPLEX', 2, 3, values => {
  const a = functionNumeric(values[0]!), b = functionNumeric(values[1]!);
  if (a.type !== 'number') return a; if (b.type !== 'number') return b;
  const suffix = values[2] ? functionText(values[2]) : 'i';
  return suffix === 'i' || suffix === 'j' ? format({ re: a.value, im: b.value, suffix }) : error();
});
for (const name of ['IMABS','IMAGINARY','IMARGUMENT','IMCONJUGATE','IMCOS','IMCOSH','IMCOT','IMCSC','IMCSCH','IMDIV','IMEXP','IMLN','IMLOG10','IMLOG2','IMPOWER','IMREAL','IMSEC','IMSECH','IMSIN','IMSINH','IMSQRT','IMSUB','IMTAN']) {
  define(name, name === 'IMDIV' || name === 'IMSUB' || name === 'IMPOWER' ? 2 : 1, name === 'IMDIV' || name === 'IMSUB' || name === 'IMPOWER' ? 2 : 1, (values, ctx) => {
    const a = complex(values[0]!); if ('type' in a) return a;
    const { re: x, im: y, suffix } = a;
    const z = (re: number, im: number): Complex => ({ re, im, suffix });
    const one = z(1, 0);
    if (name === 'IMABS') return number(Math.hypot(x, y));
    if (name === 'IMREAL') return number(x);
    if (name === 'IMAGINARY') return number(y);
    if (name === 'IMARGUMENT') return x === 0 && y === 0 ? error('#DIV/0!') : number(Math.atan2(y, x));
    if (name === 'IMCONJUGATE') return format(z(x, -y));
    if (name === 'IMSUB' || name === 'IMDIV') {
      const b = complex(values[1]!); if ('type' in b) return b;
      if (a.suffix !== b.suffix && y !== 0 && b.im !== 0) return error('#NUM!');
      const out = name === 'IMSUB' ? z(x - b.re, y - b.im) : div(a, b);
      out.suffix = y === 0 ? b.suffix : suffix;
      return format(out);
    }
    if (name === 'IMLN' || name === 'IMLOG10' || name === 'IMLOG2') {
      if (x === 0 && y === 0) return error('#NUM!');
      const base = name === 'IMLN' ? 1 : Math.log(name === 'IMLOG10' ? 10 : 2);
      return format(z(Math.log(Math.hypot(x, y)) / base, Math.atan2(y, x) / base));
    }
    if (name === 'IMPOWER' || name === 'IMSQRT') {
      const p = name === 'IMSQRT' ? number(0.5) : functionNumeric(values[1]!);
      if (p.type !== 'number') return p;
      if (x === 0 && y === 0) return name === 'IMSQRT' ? text('0') : error('#NUM!');
      if (name === 'IMPOWER' && Number.isSafeInteger(p.value)) {
        let exponent = Math.abs(p.value), base = a, result = one;
        while (exponent > 0) { ctx.operation(); if (exponent % 2) result = mul(result, base); exponent = Math.floor(exponent / 2); if (exponent) base = mul(base, base); }
        return format(p.value < 0 ? div(one, result) : result);
      }
      if (name === 'IMSQRT') {
        const radius = Math.hypot(x, y);
        if (x >= 0) { const re = Math.sqrt(radius / 2 + x / 2); return format(z(re, y / (2 * re))); }
        const im = (y < 0 ? -1 : 1) * Math.sqrt(radius / 2 - x / 2);
        return format(z(Math.abs(y) / (2 * Math.abs(im)), im));
      }
      const radius = Math.hypot(x, y) ** p.value, angle = Math.atan2(y, x) * p.value;
      return format(z(radius * Math.cos(angle), radius * Math.sin(angle)));
    }
    if (name === 'IMEXP') return format(z(Math.exp(x) * Math.cos(y), Math.exp(x) * Math.sin(y)));
    const sin = z(Math.sin(x) * Math.cosh(y), Math.cos(x) * Math.sinh(y));
    const cos = z(Math.cos(x) * Math.cosh(y), -Math.sin(x) * Math.sinh(y));
    const sinh = z(Math.sinh(x) * Math.cos(y), Math.cosh(x) * Math.sin(y));
    const cosh = z(Math.cosh(x) * Math.cos(y), Math.sinh(x) * Math.sin(y));
    return format(name === 'IMSIN' ? sin : name === 'IMCOS' ? cos : name === 'IMSINH' ? sinh : name === 'IMCOSH' ? cosh : name === 'IMTAN' ? div(sin, cos) : name === 'IMCOT' ? div(cos, sin) : div(one, name === 'IMSEC' ? cos : name === 'IMCSC' ? sin : name === 'IMCSCH' ? sinh : cosh));
  });
}
for (const name of ['IMSUM', 'IMPRODUCT']) registry.set(name, (args, ctx) => {
  if (args.length < 1 || args.length > 255) return error();
  let result: Complex = { re: name === 'IMSUM' ? 0 : 1, im: 0, suffix: 'i' }, count = 0;
  let selected: string | undefined;
  for (const arg of args) {
    const evaluated = ctx.evaluate(arg);
    if ('kind' in evaluated && String(evaluated.kind) === 'omitted') continue;
    const matrix = functionMatrix(evaluated);
    for (const row of matrix) for (const value of row) {
      ctx.operation(); if (++count > ctx.maxArrayCells) return error('#NUM!');
      if (value.type === 'blank') continue;
      const b = complex(value); if ('type' in b) return b;
      if (b.im !== 0) { if (selected && selected !== b.suffix) return error('#NUM!'); selected = b.suffix; }
      result = name === 'IMSUM' ? { re: result.re + b.re, im: result.im + b.im, suffix: result.suffix } : mul(result, b);
    }
  }
  result.suffix = selected ?? 'i'; return format(result);
});

function integrate(f: (x: number) => number, a: number, b: number, ctx: FunctionContext): number {
  const evaluate = (x: number) => { ctx.operation(); return f(x); };
  const fa = evaluate(a), fb = evaluate(b), fm = evaluate((a + b) / 2);
  function recurse(l: number, r: number, fl: number, fr: number, mid: number, whole: number, tolerance: number, depth: number): number {
    const m = (l + r) / 2, leftMid = evaluate((l + m) / 2), rightMid = evaluate((m + r) / 2);
    const left = (m - l) * (fl + 4 * leftMid + mid) / 6, right = (r - m) * (mid + 4 * rightMid + fr) / 6;
    const delta = left + right - whole;
    if (depth === 0 || !Number.isFinite(delta) || Math.abs(delta) <= 15 * tolerance) return left + right + delta / 15;
    return recurse(l, m, fl, mid, leftMid, left, tolerance / 2, depth - 1) + recurse(m, r, mid, fr, rightMid, right, tolerance / 2, depth - 1);
  }
  const whole = (b - a) * (fa + 4 * fm + fb) / 6;
  return recurse(a, b, fa, fb, fm, whole, Math.max(1e-300, Math.abs(whole)) * 2e-13, 18);
}
function logCosh(x: number) { return Math.abs(x) + Math.log1p(Math.exp(-2 * Math.abs(x))) - Math.LN2; }
function besselAsymptotic(x: number, n: number, y: boolean, ctx: FunctionContext): number {
  let term = 1, p = 1, q = 0, previous = Infinity;
  for (let k = 1; k <= 64; k++) {
    ctx.operation(); term *= (4 * n * n - (2 * k - 1) ** 2) / (8 * x * k);
    if (Math.abs(term) > previous) break;
    previous = Math.abs(term);
    if (k % 2) q += (k % 4 === 1 ? 1 : -1) * term; else p += (k % 4 === 0 ? 1 : -1) * term;
    if (Math.abs(term) < 1e-17) break;
  }
  const phase = x - n * Math.PI / 2 - Math.PI / 4;
  return Math.sqrt(2 / (Math.PI * x)) * (y ? p * Math.sin(phase) + q * Math.cos(phase) : p * Math.cos(phase) - q * Math.sin(phase));
}
for (const name of ['BESSELI','BESSELJ','BESSELK','BESSELY']) numeric(name, 2, 2, ([input = 0, order = 0], ctx) => {
  const n = Math.trunc(order), x = Math.abs(input), sign = input < 0 && n % 2 ? -1 : 1;
  if (order < 0 || n > 4096 || ((name === 'BESSELK' || name === 'BESSELY') && input <= 0)) return error('#NUM!');
  if (x === 0) return number(n === 0 ? 1 : 0);
  if (name === 'BESSELI') {
    if (x > 10000) return error('#NUM!');
    let logTerm = n * Math.log(x / 2);
    for (let k = 2; k <= n; k++) { ctx.operation(); logTerm -= Math.log(k); }
    let peak = logTerm, sum = 1;
    for (let k = 1; k <= 20000; k++) {
      ctx.operation(); logTerm += 2 * Math.log(x / 2) - Math.log(k) - Math.log(n + k);
      if (logTerm > peak) { sum = sum * Math.exp(peak - logTerm) + 1; peak = logTerm; }
      else { const term = Math.exp(logTerm - peak); sum += term; if (term < sum * 2e-16 && k > x / 2) break; }
    }
    return number(sign * Math.exp(peak + Math.log(sum)));
  }
  if (name === 'BESSELK') {
    if (x > 750 && n < Math.sqrt(x)) return number(0);
    const logX = Math.log(x);
    const end = Math.max(1, Math.log(2 * (750 + n * 16)) - logX);
    // Scale large integrands so Simpson's weighted sums remain finite even when
    // the final K value approaches the largest representable number.
    const ratio = n / x;
    const peak = Math.min(end, Number.isFinite(ratio) ? Math.asinh(ratio) : Math.log(2 * n) - logX);
    const exponent = (t: number) => -Math.exp(logX + logCosh(t)) + logCosh(n * t);
    const shift = exponent(peak);
    const scaled = (t: number) => Math.exp(exponent(t) - shift);
    // Both intervals sample the mode, even when all distant samples underflow.
    const integral = (peak > 0 ? integrate(scaled, 0, peak, ctx) : 0) + (peak < end ? integrate(scaled, peak, end, ctx) : 0);
    return number(Math.exp(Math.log(integral) + shift));
  }
  if (x >= 32 && n * n < x) return number(sign * besselAsymptotic(x, n, name === 'BESSELY', ctx));
  if (x > 10000) return error('#NUM!');
  if (name === 'BESSELJ' && (x < 12 || n > x * x / 4)) {
    let term = 1;
    for (let k = 1; k <= n; k++) { ctx.operation(); term *= x / (2 * k); }
    let sum = term;
    for (let k = 1; k <= 256; k++) { ctx.operation(); term *= -x * x / (4 * k * (n + k)); sum += term; if (Math.abs(term) < Math.abs(sum) * 2e-16) break; }
    return number(sign * sum);
  }
  let steps = 128; while (steps < 4 * (x + n + 32)) steps *= 2;
  let sum = 0;
  for (let k = 0; k <= steps; k++) {
    ctx.operation(); const theta = Math.PI * k / steps;
    const phase = x * Math.sin(theta) - n * theta;
    sum += (k === 0 || k === steps ? 0.5 : 1) * (name === 'BESSELJ' ? Math.cos(phase) : Math.sin(phase));
  }
  if (name === 'BESSELJ') return number(sign * sum / steps);
  const oscillatory = integrate(t => Math.sin(x * Math.sin(t) - n * t), 0, Math.PI, ctx);
  const end = Math.max(1, Math.log(2 * (750 + n * 16) / x));
  const tail = integrate(t => {
    const a = -x * Math.sinh(t), b = n * t;
    return Math.exp(a + b) + (n % 2 ? -1 : 1) * Math.exp(a - b);
  }, 0, end, ctx);
  return number((oscillatory - tail) / Math.PI);
});

type Unit = { group: string; scale: number; metric: boolean; power: number; offset: number };
const units = new Map<string, Unit>();
function unit(group: string, scale: number, names: string, metric = false, power = 1, offset = 0) {
  for (const name of names.split('|')) units.set(name, { group, scale, metric, power, offset });
}
unit('mass',1,'g',true); unit('mass',14593.9029372064,'sg'); unit('mass',453.59237,'lbm'); unit('mass',1.6605390666e-24,'u',true); unit('mass',28.349523125,'ozm'); unit('mass',0.06479891,'grain'); unit('mass',45359.237,'cwt|shweight'); unit('mass',50802.34544,'uk_cwt|lcwt|hweight'); unit('mass',6350.29318,'stone'); unit('mass',907184.74,'ton'); unit('mass',1016046.9088,'uk_ton|LTON|brton');
const distances: [number,string,boolean][] = [[1,'m',true],[1609.344,'mi',false],[1852,'Nmi',false],[0.0254,'in',false],[0.3048,'ft',false],[0.9144,'yd',false],[1e-10,'ang',true],[1.143,'ell',false],[9460730472580800,'ly',false],[3.085677581491367e16,'parsec|pc',true],[0.0254/72,'Picapt|Pica',false],[0.0254/6,'pica',false],[1609.3472186944373,'survey_mi',false]];
for (const [scale, aliases, metric] of distances) {
  unit('distance',scale,aliases,metric);
  if (['m','mi','Nmi','in','ft','yd','ang','ly','Picapt|Pica'].includes(aliases)) for (const p of [2,3]) unit(p === 2 ? 'area' : 'volume',scale ** p, aliases.split('|').flatMap(s => [`${s}${p}`,`${s}^${p}`]).join('|'),metric,p);
}
unit('time',31557600,'yr'); unit('time',86400,'day|d'); unit('time',3600,'hr'); unit('time',60,'mn|min'); unit('time',1,'sec|s',true);
unit('pressure',1,'Pa|p',true); unit('pressure',101325,'atm|at'); unit('pressure',133.322387415,'mmHg',true); unit('pressure',6894.757293168,'psi'); unit('pressure',101325/760,'Torr');
unit('force',1,'N',true); unit('force',1e-5,'dyn|dy',true); unit('force',4.4482216152605,'lbf');
unit('energy',1,'J',true); unit('energy',1e-7,'e',true); unit('energy',4.184,'c',true); unit('energy',4.1868,'cal',true); unit('energy',1.602176634e-19,'eV|ev',true); unit('energy',2684519.53769617,'HPh|hh'); unit('energy',3600,'Wh|wh',true); unit('energy',1.3558179483314,'flb'); unit('energy',1055.05585262,'BTU|btu');
unit('power',745.69987158227,'HP|h'); unit('power',735.49875,'PS'); unit('power',1,'W|w',true); unit('magnetism',1,'T',true); unit('magnetism',1e-4,'ga',true);
unit('temperature',1,'K|kel',true); unit('temperature',1,'C|cel',false,1,273.15); unit('temperature',5/9,'F|fah',false,1,459.67); unit('temperature',5/9,'Rank'); unit('temperature',1.25,'Reau',false,1,218.52);
unit('volume',1e-3,'l|L|lt',true); unit('volume',4.92892159375e-6,'tsp'); unit('volume',5e-6,'tspm'); unit('volume',1.478676478125e-5,'tbs'); unit('volume',2.95735295625e-5,'oz'); unit('volume',0.0002365882365,'cup'); unit('volume',0.000473176473,'pt|us_pt'); unit('volume',0.00056826125,'uk_pt'); unit('volume',0.000946352946,'qt'); unit('volume',0.0011365225,'uk_qt'); unit('volume',0.003785411784,'gal'); unit('volume',0.00454609,'uk_gal'); unit('volume',0.158987294928,'barrel'); unit('volume',0.03523907016688,'bushel'); unit('volume',2.8316846592,'GRT|regton'); unit('volume',1.13267386368,'MTON');
unit('area',4046.8564224,'uk_acre'); unit('area',4046.872609874252,'us_acre'); unit('area',100,'ar',true); unit('area',10000,'ha'); unit('area',2500,'Morgen');
unit('information',1,'bit',true); unit('information',8,'byte',true);
unit('speed',1853.184/3600,'admkn'); unit('speed',1852/3600,'kn'); unit('speed',1/3600,'m/h|m/hr',true); unit('speed',1,'m/s|m/sec',true); unit('speed',1609.344/3600,'mph');
const prefixes: [string,number][] = [['da',10],['e',10],...Object.entries({Y:24,Z:21,E:18,P:15,T:12,G:9,M:6,k:3,h:2,d:-1,c:-2,m:-3,u:-6,n:-9,p:-12,f:-15,a:-18,z:-21,y:-24}).map(([s,n]):[string,number] => [s,10 ** n])];
function resolveUnit(name: string): Unit | undefined {
  const exact = units.get(name); if (exact) return exact;
  for (const [i,prefix] of ['ki','Mi','Gi','Ti','Pi','Ei','Zi','Yi'].entries()) if (name.startsWith(prefix)) {
    const base = units.get(name.slice(prefix.length));
    if (base?.group === 'information') return { ...base, scale: base.scale * 2 ** ((i+1)*10) };
  }
  for (const [prefix, scale] of prefixes) if (name.startsWith(prefix)) {
    const base = units.get(name.slice(prefix.length));
    if (base?.metric) return { ...base, scale: base.scale * scale ** base.power };
  }
  return undefined;
}
define('CONVERT',3,3, values => {
  const value = functionNumeric(values[0]!); if (value.type !== 'number') return value;
  const from = resolveUnit(functionText(values[1]!)), to = resolveUnit(functionText(values[2]!));
  if (!from || !to || from.group !== to.group) return error('#N/A');
  return number((value.value + from.offset) * from.scale / to.scale - to.offset);
});

export const engineeringFunctions: FunctionRegistry = registry;
