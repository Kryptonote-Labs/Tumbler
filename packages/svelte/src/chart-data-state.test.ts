import { expect, test } from 'bun:test';
import { createOoxmlChart } from '@tumblerjs/charts';
import { chartDataState } from './chart-data-state.ts';

const source = createOoxmlChart({ type: 'barChart', categories: ['A'], series: [{ name: 'Data', values: [2] }] });
test('pane data stays available for an ordinary chart', () => {
  expect(chartDataState(source)).toMatchObject({ error: undefined, plots: [{ series: [{ name: 'Data', values: { values: [2] } }] }] });
});
test('an incomplete source draft leaves the pane usable for correction', () => {
  const incomplete = new TextEncoder().encode('<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"/>');
  expect(chartDataState(incomplete)).toEqual({ plots: [], error: 'Chart element is missing.' });
});
test('a nonnumeric cache reports its error without crashing the pane', () => {
  const invalid = new TextEncoder().encode(new TextDecoder().decode(source).replace('<c:v>2</c:v>', '<c:v>#N/A</c:v>'));
  expect(chartDataState(invalid)).toEqual({ plots: [], error: 'Invalid numeric chart data.' });
});
