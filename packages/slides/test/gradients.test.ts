import { expect, test } from 'bun:test';
import { rectangularGradientFaces } from '../src/index.ts';

test('rectangular gradients shade outward from the focus to each edge', () => {
  const faces = rectangularGradientFaces([0.25, 0.5]);
  const offset = (x: number, y: number) => {
    const face = faces.find(({ points: [a, b, c] }) => {
      const side = (p: readonly [number, number], q: readonly [number, number]) =>
        Math.sign((q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]));
      const sides = [side(a!, b!), side(b!, c!), side(c!, a!)];
      return sides.every((s) => s >= 0) || sides.every((s) => s <= 0);
    })!;
    const [x1, y1, x2, y2] = face.line;
    return ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / ((x2 - x1) ** 2 + (y2 - y1) ** 2);
  };
  expect(offset(0.25, 0.1)).toBeCloseTo(0.8);
  expect(offset(0.05, 0.5)).toBeCloseTo(0.8);
  expect(offset(0.85, 0.5)).toBeCloseTo(0.8);
  expect(offset(0.25, 0.9)).toBeCloseTo(0.8);
});

test('a focus on an edge drops that face', () => {
  expect(rectangularGradientFaces([1, 0])).toHaveLength(2);
});
