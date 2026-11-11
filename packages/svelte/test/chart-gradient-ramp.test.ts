import { expect, test } from 'bun:test';
import { chartGradientStopAt, type ChartGradientStop } from '../src/chart-gradient-ramp.ts';
const stops: ChartGradientStop[] = [{ node: 1, position: 0, color: { kind: 'scheme', value: 'accent1' }, opacity: 1 }, { node: 2, position: 1, color: { kind: 'scheme', value: 'accent2' }, opacity: 1 }];

test('new stops sample the native rendered ramp while exact stops retain theme references', () => {
  const themeColors = { accent1: '#FF0000', accent2: '#0000FF' };
  expect(chartGradientStopAt(stops, themeColors, 0).color).toBe(stops[0]!.color!);
  const midpoint = chartGradientStopAt(stops, themeColors, .5);
  expect(midpoint.color.kind).toBe('rgb');
  expect(Math.abs(parseInt(midpoint.color.value.slice(1, 3), 16) - 186)).toBeLessThanOrEqual(1);
  expect(midpoint.color.value.slice(3, 5)).toBe('00');
  expect(Math.abs(parseInt(midpoint.color.value.slice(5), 16) - 186)).toBeLessThanOrEqual(1);
});
