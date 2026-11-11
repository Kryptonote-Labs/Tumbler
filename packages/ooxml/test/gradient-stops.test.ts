import { expect, test } from 'bun:test';
import { drawingGradientStops } from '../src/gradient-stops.ts';
import { drawingColorRgba } from '../src/css-color.ts';
import type { DrawingGradient } from '../src/gradient.ts';
const gradient = (colors: readonly string[]): DrawingGradient => ({ kind: 'linear', angle: 0, scaled: false, center: [.5, .5], stops: colors.map((color, index) => ({ offset: index / (colors.length - 1), color })) });

test('opaque two-stop blends reproduce native sampled grey and primary ramps', () => {
  const source = gradient(['#000000', '#FFFFFF']), before = structuredClone(source);
  const stops = drawingGradientStops(source);
  for (const [index, native] of [[0, 0], [16, 42], [32, 63], [64, 106], [96, 148], [128, 187], [160, 217], [192, 238], [224, 250], [255, 255]]) expect(Math.abs(drawingColorRgba(stops[index!]!.color)![0] - native!)).toBeLessThanOrEqual(1);
  expect(source).toEqual(before);
  expect(drawingGradientStops(source)).toBe(stops);
  const primary = drawingGradientStops(gradient(['#FF0000', '#0000FF']));
  expect(drawingColorRgba(primary[128]!.color)?.slice(0, 3)).toEqual([186, 0, 187]);
});

test('multiple opaque stops retain straight interpolation and authored hard stops', () => {
  const source = gradient(['#FF0000', '#FF00FF', '#0000FF']);
  expect(drawingGradientStops(source)).toBe(source.stops);
});

test('alpha gradients retain straight channels and alpha without losing source colours', () => {
  const source = gradient(['#FF0000', 'rgba(0,0,255,0.5)']);
  const stops = drawingGradientStops(source), middle = drawingColorRgba(stops[128]!.color)!;
  expect(middle[0]).toBeCloseTo(127);
  expect(middle[2]).toBeCloseTo(128);
  expect(middle[3]).toBeCloseTo(1 - 128 / 255 * .5);
  const alpha = middle[3];
  expect(middle.slice(0, 3).map(value => Math.round(value * alpha + 255 * (1 - alpha)))).toEqual([159, 64, 160]);
});

for (const [first, last, samples] of [
  ['#C0C0C0', '#404040', [[16, 191, 191, 191], [64, 180, 180, 180], [128, 145, 145, 145], [192, 96, 96, 96]]],
  ['#C83465', '#2A84C0', [[16, 198, 55, 104], [64, 187, 71, 119], [128, 148, 102, 155], [192, 89, 124, 182]]],
] as const) test(`native general-colour reference ${first} to ${last}`, () => {
  const stops = drawingGradientStops(gradient([first, last]));
  for (const [index, ...rgb] of samples) {
    const actual = drawingColorRgba(stops[index]!.color)!;
    rgb.forEach((value, channel) => expect(Math.abs(actual[channel]! - value)).toBeLessThanOrEqual(1));
  }
});

test('two opaque stops inside the shape use authored straight interpolation', () => {
  const value = gradient(['#FF0000', '#0000FF']);
  const source = { ...value, stops: [{ ...value.stops[0]!, offset: .25 }, { ...value.stops[1]!, offset: .75 }] };
  expect(drawingGradientStops(source)).toBe(source.stops);
});
