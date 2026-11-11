import { expect, test } from 'bun:test';
import { drawingGradientCircle, drawingGradientFocus } from '../src/gradient-geometry.ts';
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
