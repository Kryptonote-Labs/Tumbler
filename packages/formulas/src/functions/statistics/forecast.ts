import type { FunctionContext, FunctionValue } from "../../function-runtime.ts";
import { register, check, numeric, data, isOmitted } from "./runtime.ts";
import { normInv } from "./numerics.ts";

const option = (v: FunctionValue | undefined, fallback: number) =>
  v === undefined || isOmitted(v) ? fallback : numeric(v);
interface Series {
  y: number[];
  end: number;
  step: number;
}
function series(
  values: FunctionValue,
  timeline: FunctionValue,
  completion: number,
  aggregation: number,
  c: FunctionContext,
): Series {
  const ys = data(values, c),
    ts = data(timeline, c);
  check(ys.length === ts.length, "#N/A");
  check(ys.length >= 2);
  check(completion === 0 || completion === 1);
  check(Number.isInteger(aggregation) && aggregation >= 0 && aggregation <= 7);
  const groups = new Map<number, number[]>();
  for (let i = 0; i < ts.length; i++) {
    const group = groups.get(ts[i]!) ?? [];
    group.push(ys[i]!);
    groups.set(ts[i]!, group);
  }
  c.operation(ts.length * Math.ceil(Math.log2(ts.length + 1)));
  const points = [...groups]
    .sort(([a], [b]) => a - b)
    .map(([time, xs]) => {
      const total = xs.reduce((s, x) => s + x, 0);
      let value: number;
      if (aggregation === 2 || aggregation === 3) value = xs.length;
      else if (aggregation === 4) value = xs.reduce((a, b) => Math.max(a, b));
      else if (aggregation === 5) value = xs.reduce((a, b) => Math.min(a, b));
      else if (aggregation === 6) {
        xs.sort((a, b) => a - b);
        const mid = Math.floor(xs.length / 2);
        value = xs.length % 2 ? xs[mid]! : (xs[mid - 1]! + xs[mid]!) / 2;
      } else value = aggregation === 7 ? total : total / xs.length;
      return { time, value };
    });
  check(points.length >= 2);
  let step = Infinity;
  for (let i = 1; i < points.length; i++)
    step = Math.min(step, points[i]!.time - points[i - 1]!.time);
  check(step > 0);
  const first = points[0]!.time,
    end = points.at(-1)!.time,
    size = Math.round((end - first) / step) + 1;
  check(size <= c.maxArrayCells && size >= points.length);
  check((size - points.length) / size <= 0.3);
  const sparse = new Map<number, number>();
  for (const p of points) {
    const index = (p.time - first) / step;
    check(Math.abs(index - Math.round(index)) < 1e-7);
    sparse.set(Math.round(index), p.value);
  }
  const y: number[] = [];
  let left = 0,
    right = 0;
  for (let i = 0; i < size; i++) {
    c.operation();
    const actual = sparse.get(i);
    if (actual !== undefined) {
      y.push(actual);
      left = i;
      continue;
    }
    if (completion === 0) {
      y.push(0);
      continue;
    }
    if (right <= i) {
      right = i + 1;
      while (!sparse.has(right) && right < size) {
        c.operation();
        right++;
      }
    }
    y.push(
      sparse.get(left)! +
        ((sparse.get(right)! - sparse.get(left)!) * (i - left)) /
          (right - left),
    );
  }
  return { y, end, step };
}
/** Detect repetition after removing a linear trend. Require two complete cycles. */
function seasonality(y: number[], c: FunctionContext): number {
  const n = y.length,
    mean = y.reduce((s, x) => s + x, 0) / n,
    mx = (n - 1) / 2;
  let xx = 0,
    xy = 0;
  for (let i = 0; i < n; i++) {
    xx += (i - mx) ** 2;
    xy += (i - mx) * (y[i]! - mean);
  }
  const slope = xy / xx;
  const residual = y.map((x, i) => x - mean - slope * (i - mx)),
    energy = residual.reduce((s, x) => s + x * x, 0);
  if (energy <= Number.EPSILON * Math.max(1, mean * mean) * n) return 0;
  let best = 0,
    score = 0.6;
  for (let p = 2; p <= Math.min(8760, Math.floor(n / 2)); p++) {
    c.operation(n - p);
    let error = 0,
      base = 0;
    for (let i = p; i < n; i++) {
      error += (residual[i]! - residual[i - p]!) ** 2;
      base += residual[i]! ** 2 + residual[i - p]! ** 2;
    }
    const candidate = base === 0 ? 0 : 1 - error / base;
    if (candidate > score + 1e-6) {
      score = candidate;
      best = p;
    }
  }
  return best;
}
interface Model {
  level: number;
  trend: number;
  seasons: number[];
  alpha: number;
  beta: number;
  gamma: number;
  errors: number[];
  fitted: number[];
  mse: number;
}
/** Additive-error, additive-trend, additive-seasonality exponential smoothing.
 * Parameters minimize one-step squared errors with bounded coordinate search.
 * Excel's private optimizer and interval simulation are not specified by ECMA. */
function fit(y: number[], period: number, c: FunctionContext): Model {
  const m = Math.max(1, period);
  check(period === 0 || y.length >= 2 * m);
  const first = y.slice(0, m),
    average = first.reduce((s, x) => s + x, 0) / m;
  const initialTrend = period
    ? (y.slice(m, 2 * m).reduce((s, x) => s + x, 0) / m - average) / m
    : (y.at(-1)! - y[0]!) / (y.length - 1);
  const initialSeasons = period
    ? first.map((x, i) => x - average - initialTrend * (i - (m - 1) / 2))
    : [];
  const run = (alpha: number, beta: number, gamma: number): Model => {
    let level = period ? average - (initialTrend * (m - 1)) / 2 : y[0]!,
      trend = initialTrend;
    const seasons = [...initialSeasons],
      errors: number[] = [],
      fitted: number[] = [];
    for (let i = 0; i < y.length; i++) {
      c.operation();
      const seasonal = period ? seasons[i % m]! : 0,
        predicted = i === 0 ? y[0]! : level + trend + seasonal,
        error = y[i]! - predicted;
      fitted.push(predicted);
      errors.push(error);
      const previous = level;
      level = alpha * (y[i]! - seasonal) + (1 - alpha) * (level + trend);
      trend = beta * (level - previous) + (1 - beta) * trend;
      if (period)
        seasons[i % m] = gamma * (y[i]! - level) + (1 - gamma) * seasonal;
    }
    const mse = errors.slice(1).reduce((s, x) => s + x * x, 0) / (y.length - 1);
    return { level, trend, seasons, alpha, beta, gamma, errors, fitted, mse };
  };
  let parameters = [0.2, 0.1, period ? 0.1 : 0],
    best = run(parameters[0]!, parameters[1]!, parameters[2]!);
  for (let step = 0.25; step >= 1 / 4096; step /= 2)
    for (let iteration = 0; iteration < 12; iteration++) {
      let improved = false;
      for (let j = 0; j < (period ? 3 : 2); j++)
        for (const direction of [-1, 1]) {
          const trial = [...parameters];
          trial[j] = Math.max(0, Math.min(1, trial[j]! + step * direction));
          const model = run(trial[0]!, trial[1]!, trial[2]!);
          if (model.mse < best.mse) {
            best = model;
            parameters = trial;
            improved = true;
          }
        }
      if (!improved) break;
    }
  return best;
}
for (const name of [
  "FORECAST.ETS",
  "FORECAST.ETS.CONFINT",
  "FORECAST.ETS.SEASONALITY",
  "FORECAST.ETS.STAT",
]) {
  const target = name === "FORECAST.ETS" || name === "FORECAST.ETS.CONFINT",
    interval = name === "FORECAST.ETS.CONFINT",
    season = name === "FORECAST.ETS.SEASONALITY";
  register(name, season ? 2 : 3, interval ? 7 : season ? 4 : 6, (v, c) => {
    const offset = target ? 1 : 0,
      seasonIndex = interval ? 4 : 3;
    const requested = season ? 1 : option(v[seasonIndex], 1),
      completion = option(v[season ? 2 : seasonIndex + 1], 1),
      aggregation = option(v[season ? 3 : seasonIndex + 2], 0);
    check(Number.isInteger(requested) && requested >= 0 && requested <= 8760);
    const s = series(v[offset]!, v[offset + 1]!, completion, aggregation, c),
      period = requested === 1 ? seasonality(s.y, c) : requested;
    if (season) return Math.max(1, period);
    const model = fit(s.y, period, c);
    if (name === "FORECAST.ETS.STAT") {
      const statistic = numeric(v[2]!);
      check(Number.isInteger(statistic) && statistic >= 1 && statistic <= 8);
      if (statistic === 8) return s.step;
      if (statistic <= 3)
        return [model.alpha, model.beta, model.gamma][statistic - 1]!;
      const errors = model.errors.slice(1),
        mae = errors.reduce((sum, x) => sum + Math.abs(x), 0) / errors.length;
      if (statistic === 6) return mae;
      if (statistic === 7) return Math.sqrt(model.mse);
      if (statistic === 5)
        return (
          errors.reduce((sum, e, i) => {
            const denominator =
              Math.abs(s.y[i + 1]!) + Math.abs(model.fitted[i + 1]!);
            return (
              sum + (denominator === 0 ? 0 : (2 * Math.abs(e)) / denominator)
            );
          }, 0) / errors.length
        );
      const lag = Math.max(1, period);
      let scale = 0;
      for (let i = lag; i < s.y.length; i++)
        scale += Math.abs(s.y[i]! - s.y[i - lag]!);
      scale /= s.y.length - lag;
      check(scale > 0, "#DIV/0!");
      return mae / scale;
    }
    const horizon = (numeric(v[0]!) - s.end) / s.step;
    check(horizon >= 0);
    if (interval) {
      const confidence = option(v[3], 0.95);
      check(confidence > 0 && confidence < 1);
      const h = Math.max(1, Math.ceil(horizon));
      c.operation(h);
      let variance = 1;
      for (let j = 1; j < h; j++)
        variance +=
          (model.alpha +
            j * model.alpha * model.beta +
            (period && j % period === 0 ? model.gamma : 0)) **
          2;
      return (
        -normInv((1 - confidence) / 2, c) * Math.sqrt(model.mse * variance)
      );
    }
    const at = (h: number) =>
      model.level +
      h * model.trend +
      (period ? model.seasons[(s.y.length + h - 1) % period]! : 0);
    const lo = Math.floor(horizon),
      fraction = horizon - lo;
    return at(lo) * (1 - fraction) + at(lo + 1) * fraction;
  });
}
