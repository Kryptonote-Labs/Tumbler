import type { ChartTrendline } from './analytics-parser.ts';

export interface TrendPoint { readonly index: number; readonly x: number; readonly y: number }
export interface ChartTrendFit {
  readonly points: readonly TrendPoint[];
  readonly equation?: string;
  readonly rSquared?: number;
  readonly evaluate?: (x: number) => number;
}

/** Least-squares fits use a scaled QR basis rather than ill-conditioned normal equations. */
export function fitChartTrendline(source: readonly TrendPoint[], trend: ChartTrendline): ChartTrendFit | undefined {
  if (!Number.isInteger(trend.order) || trend.order < 2 || trend.order > 6 || !Number.isInteger(trend.period) || trend.period < 2 || trend.period > 255 || !Number.isFinite(trend.forward) || !Number.isFinite(trend.backward) || trend.forward < 0 || trend.backward < 0) return undefined;
  const points = source.filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (trend.type === 'movingAvg') {
    if (trend.period > points.length) return undefined;
    const magnitude = Math.max(0, ...points.map(point => Math.abs(point.y)));
    let sum = 0;
    const averaged: TrendPoint[] = [];
    points.forEach((point, index) => {
      sum += magnitude ? point.y / magnitude : 0;
      if (index >= trend.period) sum -= magnitude ? points[index - trend.period]!.y / magnitude : 0;
      if (index >= trend.period - 1) averaged.push({ ...point, y: sum / trend.period * magnitude });
    });
    return { points: averaged };
  }
  const logX = trend.type === 'log' || trend.type === 'power';
  const logY = trend.type === 'exp' || trend.type === 'power';
  if (points.length < 2 || points.some(point => logX && point.x <= 0 || logY && point.y <= 0)) return undefined;
  const order = trend.type === 'poly' ? trend.order : 1;
  const x = points.map(point => logX ? Math.log(point.x) : point.x);
  const y = points.map(point => logY ? Math.log(point.y) : point.y);
  const fixed = trend.intercept !== undefined && (trend.type === 'linear' || trend.type === 'poly' || trend.type === 'exp');
  if (fixed && logY && trend.intercept! <= 0) return undefined;
  const intercept = fixed ? logY ? Math.log(trend.intercept!) : trend.intercept! : undefined;
  const origin = fixed ? 0 : (Math.min(...x) + Math.max(...x)) / 2;
  const scale = Math.max(...x.map(value => Math.abs(value - origin)));
  if (!(scale > 0) || !Number.isFinite(scale)) return undefined;
  const degrees = Array.from({ length: order + (fixed ? 0 : 1) }, (_, index) => index + (fixed ? 1 : 0));
  if (degrees.length > points.length) return undefined;
  const basis = degrees.map(degree => x.map(value => ((value - origin) / scale) ** degree));
  const q: number[][] = [], r: number[][] = [];
  for (let column = 0; column < basis.length; column++) {
    const vector = [...basis[column]!];
    r[column] = [];
    // Reorthogonalization keeps polynomial fits stable for tightly spaced X values.
    for (let pass = 0; pass < 2; pass++) for (let previous = 0; previous < column; previous++) {
      const amount = dot(q[previous]!, vector);
      r[previous]![column] = (r[previous]![column] ?? 0) + amount;
      for (let row = 0; row < vector.length; row++) vector[row] = vector[row]! - amount * q[previous]![row]!;
    }
    const norm = Math.sqrt(dot(vector, vector));
    if (norm < 1e-12) return undefined;
    r[column]![column] = norm;
    q.push(vector.map(value => value / norm));
  }
  const response = y.map(value => value - (intercept ?? 0));
  const fitted = q.map(vector => dot(vector, response));
  for (let column = fitted.length - 1; column >= 0; column--) {
    for (let following = column + 1; following < fitted.length; following++) fitted[column] = fitted[column]! - r[column]![following]! * fitted[following]!;
    fitted[column] = fitted[column]! / r[column]![column]!;
  }
  const normalized = fixed ? [intercept!, ...fitted] : fitted;
  const polynomial = (value: number) => normalized.reduceRight((sum, coefficient) => sum * (value - origin) / scale + coefficient, 0);
  const evaluate = (value: number) => {
    const fitted = polynomial(logX ? Math.log(value) : value);
    return logY ? Math.exp(fitted) : fitted;
  };
  const coefficients = Array.from({ length: order + 1 }, () => 0);
  normalized.forEach((coefficient, degree) => {
    for (let power = 0; power <= degree; power++) coefficients[power] = coefficients[power]! + coefficient * binomial(degree, power) * (-origin) ** (degree - power) / scale ** degree;
  });
  const estimated = points.map(point => evaluate(point.x));
  if (estimated.some(value => !Number.isFinite(value))) return undefined;
  // Excel 2104+ uses squared correlation except for a linear zero intercept.
  // https://support.microsoft.com/en-us/excel/changes-to-internal-calculations-of-linear-trendlines-in-a-chart
  const rsq = trend.type === 'linear' && trend.intercept === 0 ? dot(estimated, estimated) / dot(y, y) : correlationSquared(points.map(point => point.y), estimated);
  const first = Math.min(...points.map(point => point.x)) - trend.backward;
  const last = Math.max(...points.map(point => point.x)) + trend.forward;
  const sampled = Array.from({ length: 129 }, (_, index) => {
    const x = first + (last - first) * index / 128;
    return { index, x, y: evaluate(x) };
  }).filter(point => Number.isFinite(point.y) && (!logX || point.x > 0));
  return { points: sampled, evaluate, equation: equation(trend.type, coefficients), ...(rsq !== undefined && Number.isFinite(rsq) ? { rSquared: rsq } : {}) };
}
function dot(a: readonly number[], b: readonly number[]) { return a.reduce((sum, value, index) => sum + value * b[index]!, 0); }
function binomial(n: number, k: number) { let value = 1; for (let index = 1; index <= k; index++) value *= (n - index + 1) / index; return value; }
function correlationSquared(y: readonly number[], fit: readonly number[]) {
  const mean = y.reduce((sum, value) => sum + value, 0) / y.length;
  const fittedMean = fit.reduce((sum, value) => sum + value, 0) / fit.length;
  const centered = y.map(value => value - mean), projected = fit.map(value => value - fittedMean);
  const denominator = dot(centered, centered) * dot(projected, projected);
  return denominator ? Math.min(1, dot(centered, projected) ** 2 / denominator) : undefined;
}
function equation(type: ChartTrendline['type'], coefficients: readonly number[]) {
  const number = (value: number) => Number(value.toPrecision(6)).toString();
  if (type === 'exp') return `y = ${number(Math.exp(coefficients[0]!))}e^(${number(coefficients[1]!)}x)`;
  if (type === 'power') return `y = ${number(Math.exp(coefficients[0]!))}x^${number(coefficients[1]!)}`;
  if (type === 'log') return `y = ${number(coefficients[1]!)} ln(x) ${coefficients[0]! < 0 ? '−' : '+'} ${number(Math.abs(coefficients[0]!))}`;
  return 'y = ' + (coefficients.map((value, power) => ({ value, power })).reverse().filter(term => term.value !== 0).map(({ value, power }, index) => `${value < 0 ? index ? ' − ' : '−' : index ? ' + ' : ''}${number(Math.abs(value))}${power ? power === 1 ? 'x' : `x^${power}` : ''}`).join('') || '0');
}
