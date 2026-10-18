import { expect, test } from 'bun:test';
import { createOfficeInkScene, readOfficeInk } from '../src/index.ts';
import { officeInk, bytes } from './fixture.ts';
import references from './word-curve-reference.json';
type Point = { x: number; y: number };
const distance = (point: Point, path: readonly Point[]) => {
  let best = Infinity;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!, b = path[i]!, dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy));
  }
  return best;
};

test.each(references)('Word LTSC PDF curve matches native rendering: $name', reference => {
  const ink = readOfficeInk(bytes(officeInk({
    channels: '<channel name="X" type="double"/><channel name="Y" type="double"/>',
    trace: reference.points.map(p => `${p.x * 2540 / 72} ${p.y * 2540 / 72}`).join(','),
    brush: '<brushProperty name="fitToCurve" value="true"/><brushProperty name="ignorePressure" value="true"/>',
  })));
  const m = reference.matrix;
  const scene = createOfficeInkScene(ink, { renderingProfile: 'word', sampleTransform: [m[0]!, m[1]!, m[2]!, m[3]!, m[4]!, m[5]!], curveTolerance: .01 });
  if (!scene.supported) throw new Error('Reference ink could not render');
  const actual = scene.strokes[0]!.shapes.flatMap(shape => shape.kind === 'ellipse' ? [{ x: shape.x + reference.offset[0]!, y: shape.y + reference.offset[1]! }] : []);
  const controls = reference.expectedControls.map(([x, y]) => ({ x: x!, y: y! }));
  const expected: Point[] = [];
  for (let i = 0; i + 3 < controls.length; i += 3) for (let step = 0; step <= 100; step++) {
    const t = step / 100, u = 1 - t, a = controls[i]!, b = controls[i + 1]!, c = controls[i + 2]!, d = controls[i + 3]!;
    expected.push({ x: u ** 3 * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t ** 3 * d.x, y: u ** 3 * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t ** 3 * d.y });
  }
  // Desktop Word rounds through HIMETRIC and PDF coordinates. Preserve source
  // precision while bounding the observed rendering difference in physical points.
  expect(Math.max(...actual.map(point => distance(point, expected)))).toBeLessThan(.15);
  expect(Math.max(...expected.map(point => distance(point, actual)))).toBeLessThan(.15);
});
