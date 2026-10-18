import { expect, test } from 'bun:test';
import { windowsInkBezier } from '../src/windows-curve.ts';
import cases from './windows-curve-reference.json';

test.each(cases)('Windows ink controls match $name scaled=$scaled', reference => {
  const controls = windowsInkBezier(reference.points.map(([x, y]) => ({ x: x! * 72 / 2540, y: y! * 72 / 2540 })));
  expect(controls.length).toBe(reference.control.length);
  controls.forEach((point, i) => {
    expect(point.x * 2540 / 72).toBeCloseTo(reference.control[i]![0]!, 6);
    expect(point.y * 2540 / 72).toBeCloseTo(reference.control[i]![1]!, 6);
  });
});
