import { expect, test } from 'bun:test';
import { drawingGradientCircle, drawingGradientFocus, drawingGradientOffset } from '../src/gradient-geometry.ts';
import type { DrawingGradient } from '../src/gradient.ts';
const gradient: DrawingGradient = { kind: 'rectangular', path: 'rect', angle: 0, scaled: false, center: [.5, .5], stops: [] };

test('native rectangular focus normalizes the inset weights and retains the source rectangle', () => {
  const source = { ...gradient, focusRect: [.25, .1, .5, .7] as const }, before = structuredClone(source);
  const focus = drawingGradientFocus(source);
  expect(focus.center[0]).toBeCloseTo(1 / 3);
  expect(focus.center[1]).toBeCloseTo(1 / 4);
  expect(focus).not.toHaveProperty('focusRect');
  expect(source).toEqual(before);
  expect(drawingGradientFocus({ ...gradient, focusRect: [0, 0, 1, 1] }).center).toEqual([0, 0]);
  expect(drawingGradientFocus(gradient).center).toEqual([.5, .5]);
});

test('native circular shading uses a physical tile diagonal and ignores the focal inset rectangle', () => {
  const source = { ...gradient, kind: 'radial' as const, path: 'circle' as const, focusRect: [.25, .2, .25, .2] as const };
  const circle = drawingGradientCircle(source, 260, 160)!;
  expect(circle.x).toBe(130);
  expect(circle.y).toBe(80);
  expect(circle.radius).toBeCloseTo(Math.hypot(260, 160) / 2);
  const tiled = drawingGradientCircle({ ...source, tileRect: [.5, 0, 1, 1] }, 260, 160)!;
  expect(tiled.x).toBe(195);
  expect(tiled.radius).toBeCloseTo(Math.hypot(130, 160) / 2);
});

test('procedural highlights retain their own centre and focus geometry', () => {
  const { path, ...source } = gradient;
  expect(drawingGradientCircle({ ...source, kind: 'radial', center: [.3, .25] }, 120, 120)).toBeUndefined();
  expect(drawingGradientFocus({ ...source, focusRect: [.2, .2, .8, .8] })).toEqual({ center: [.5, .5], focusRect: [.2, .2, .8, .8] });
});

test('native linear tiles reflect the shading parameter rather than the x and y coordinates', () => {
  const sample = drawingGradientOffset({ ...gradient, kind: 'linear', angle: 45, tileRect: [.25, .25, .75, .75] }, 260, 160);
  expect(sample(65, 40)).toBeCloseTo(0);
  expect(sample(195, 120)).toBeCloseTo(1);
  expect(sample(0, 80)).toBeCloseTo(25 / 210);
  expect(sample(130, 80)).toBeCloseTo(.5);
  const half = drawingGradientOffset({ ...gradient, kind: 'linear', tileRect: [0, 0, .5, 1] }, 260, 160);
  expect(half(65, 80)).toBeCloseTo(.5);
  expect(half(195, 80)).toBeCloseTo(.5);
});

test('native rectangular tiles retain the full-shape focus and repeat without reflection', () => {
  const half = drawingGradientOffset({ ...gradient, tileRect: [0, 0, .5, 1] }, 260, 160);
  expect(half(65, 80)).toBeCloseTo(.5);
  expect(half(129.99, 80)).toBeLessThan(.001);
  expect(half(130.01, 80)).toBeGreaterThan(.999);
  expect(half(195, 80)).toBeCloseTo(.5);
  const inset = drawingGradientOffset({ ...gradient, tileRect: [.25, .1, .75, .9] }, 260, 160);
  expect(inset(130, 80)).toBeCloseTo(0);
  expect(inset(0, 80)).toBeCloseTo(0);
});
