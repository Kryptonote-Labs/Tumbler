import { expect, test } from 'bun:test';
import { createOoxmlChart, parseOoxmlChart, layoutBubbleChart } from '../src/index.ts';
function chart(values = [2, 4, 3], xValues = [1, 2, 3], sizes = [2, 3, 4]) {
  const parsed = parseOoxmlChart(createOoxmlChart({ type: 'bubbleChart', categories: [], series: [{ name: 'Data', values, xValues, bubbleSizes: sizes }] }), 'transitional');
  if (parsed.status !== 'supported') throw Error(parsed.reason);
  return parsed;
}
function contained(layout: ReturnType<typeof layoutBubbleChart>) {
  for (const series of layout.series) for (const point of series) if (point.radius) {
    expect(point.plotX - point.radius).toBeGreaterThanOrEqual(layout.plot.x - 1e-8);
    expect(point.plotX + point.radius).toBeLessThanOrEqual(layout.plot.x + layout.plot.width + 1e-8);
    expect(point.plotY - point.radius).toBeGreaterThanOrEqual(layout.plot.y - 1e-8);
    expect(point.plotY + point.radius).toBeLessThanOrEqual(layout.plot.y + layout.plot.height + 1e-8);
  }
}

test('automatic bubble axes include the complete visible circles at ordinary and maximum scale', () => {
  for (const bubbleScale of [100, 300]) for (const reversed of [false, true]) {
    const original = chart();
    const model = { ...original, bubbleScale, axes: original.axes.map(axis => ({ ...axis, reversed })) };
    contained(layoutBubbleChart(model, 500, 350));
  }
});

test('logarithmic bubble axes reserve their footprint in logarithmic coordinates', () => {
  for (const reversed of [false, true]) {
    const original = chart([1, 10, 100], [2, 20, 200]);
    const model = { ...original, axes: original.axes.map(axis => ({ ...axis, logBase: 10, reversed })) };
    contained(layoutBubbleChart(model, 500, 350));
  }
});

test('authored bubble bounds continue to clip at the specified values', () => {
  const original = chart();
  const model = { ...original, axes: original.axes.map(axis => ({ ...axis, minimum: axis.id === original.axisIds?.[0] ? 1 : 2, maximum: axis.id === original.axisIds?.[0] ? 3 : 4 })) };
  const layout = layoutBubbleChart(model, 500, 350);
  expect(layout).toMatchObject({ xMinimum: 1, xMaximum: 3, yMinimum: 2, yMaximum: 4 });
  expect(layout.series[0]![0]!.plotX - layout.series[0]![0]!.radius).toBeLessThan(layout.plot.x);
});

test('one authored endpoint stays fixed while the other endpoint makes room for circles', () => {
  const original = chart();
  const model = { ...original, axes: original.axes.map(axis => axis.id === original.axisIds?.[0] ? { ...axis, minimum: 1 } : axis) };
  const layout = layoutBubbleChart(model, 500, 350), last = layout.series[0]!.at(-1)!;
  expect(layout.xMinimum).toBe(1);
  expect(last.plotX + last.radius).toBeLessThanOrEqual(layout.plot.x + layout.plot.width);
});

test('changing bubble magnitude units preserves relative circle areas, including fractions below one', () => {
  const ordinary = layoutBubbleChart(chart(undefined, undefined, [2, 3, 4]), 500, 350);
  const fractional = layoutBubbleChart(chart(undefined, undefined, [.02, .03, .04]), 500, 350);
  expect(fractional.series[0]?.map(point => point.radius)).toEqual(ordinary.series[0]?.map(point => point.radius));
});


test('finite extreme logarithmic values cannot create an unbounded tick loop', () => {
  const original = chart([1e307, 1e308, 5e307], [1, 10, 5]);
  const model = { ...original, axes: original.axes.map(axis => ({ ...axis, logBase: 10 })) };
  const layout = layoutBubbleChart(model, 500, 350);
  expect(Number.isFinite(layout.yMaximum)).toBe(true);
  expect(layout.yTicks.every(Number.isFinite)).toBe(true);
  expect(layout.yTicks.length).toBeLessThan(1001);
});

test('empty logarithmic bubble axes retain logarithmic ticks', () => {
  const original = chart([-1, -2, -3], [-1, -2, -3]);
  const model = { ...original, axes: original.axes.map(axis => ({ ...axis, logBase: 10 })) };
  const layout = layoutBubbleChart(model, 500, 350);
  expect(layout.xTicks).toEqual([1, 10]);
  expect(layout.yTicks).toEqual([1, 10]);
});
