import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { layoutCartesianChart, layoutChartScene, parseOoxmlChart } from '../src/index.ts';
import { chartLegendPositions } from '../src/scene-style.ts';

const xml = readFileSync(new URL('./fixtures/word-default-chart.xml', import.meta.url));
function sample(source = xml) {
  const model = parseOoxmlChart(source, 'transitional');
  if (model.status !== 'supported') throw new Error('Expected supported Word chart');
  return model;
}

test('Word chart reserves room for every rotated category before choosing value ticks', () => {
  const model = sample();
  const measure = (text: string) => text.startsWith('Category') ? 60 : 42;
  const narrow = layoutChartScene(model, 199, 209, { measureText: measure });
  const labels = narrow.marks.filter(mark => mark.kind === 'text' && mark.text.startsWith('Category'));
  expect(labels).toHaveLength(4);
  expect(labels.every(mark => mark.kind === 'text' && mark.rotate === -45)).toBe(true);
  expect(layoutCartesianChart(model, 199, 209, measure).ticks).toEqual([0, 2, 4, 6]);
  expect(layoutCartesianChart(model, 576, 336, measure).categoryRotation).toBe(0);
  expect(layoutCartesianChart(model, 576, 181, measure).ticks).toEqual([0, 2, 4, 6]);
});

test('explicit zero rotation is retained while Word automatic rotation is not a literal angle', () => {
  expect(sample().axes.find(axis => axis.kind === 'category')?.labelRotation).toBeUndefined();
  const fixed = sample(Buffer.from(xml.toString().replaceAll('rot="-60000000"', 'rot="0"')));
  expect(layoutCartesianChart(fixed, 199, 209).categoryRotation).toBe(0);
});

test('bottom legends wrap complete entries inside the chart', () => {
  const widths = [54, 54, 54];
  for (const width of [150, 199, 576]) {
    const positions = chartLegendPositions(widths, { model: sample(), width, height: 209 });
    positions.forEach((point, index) => {
      expect(point.x).toBeGreaterThanOrEqual(8);
      expect(point.x + widths[index]!).toBeLessThanOrEqual(width - 8);
    });
    expect(new Set(positions.map(point => point.y)).size).toBe(width === 150 ? 2 : 1);
  }
});
