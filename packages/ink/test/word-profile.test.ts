import { expect, test } from 'bun:test';
import { createOfficeInkScene, readOfficeInk } from '../src/index.ts';
import { bytes, officeInk } from './fixture.ts';

// Desktop Word LTSC 2024 16.0.17932.20910: PDF paths and the editor screenshot
// both use an 8.5039 pt circular pen for a .1 by .3 cm ellipse brush.
test('Word round pens use the larger dimension and retain physical size under sample scaling', () => {
  const ink = readOfficeInk(bytes(officeInk({ brush: '<brushProperty name="width" value="0.1" units="cm"/><brushProperty name="height" value="0.3" units="cm"/>' })));
  const scene = createOfficeInkScene(ink, { renderingProfile: 'word', sampleTransform: [2, 0, 0, 3, 10, 20] });
  if (!scene.supported) throw Error('Expected supported scene');
  const first = scene.strokes[0]!.shapes[0]!;
  expect(first.kind).toBe('ellipse');
  if (first.kind !== 'ellipse') return;
  expect(first.rx * 2).toBeCloseTo(8.5039, 4);
  expect(first.ry).toBe(first.rx);
  expect(first.x).toBe(10); expect(first.y).toBe(20);
  expect(scene.bounds.width).toBeCloseTo(2 * 72 / 2.54 + 8.503937007874015);
});

test('Word pressure has a visible minimum and nominal width at half pressure', () => {
  const ink = readOfficeInk(bytes(officeInk({
    channels: '<channel name="X"/><channel name="Y"/><channel name="F" type="integer" max="100"/>',
    trace: '0 0 0, 500 500 50, 1000 1000 100',
    brush: '<brushProperty name="width" value="0.2" units="cm"/><brushProperty name="height" value="0.2" units="cm"/>',
  })));
  const scene = createOfficeInkScene(ink, { renderingProfile: 'word' });
  if (!scene.supported) throw Error('Expected supported scene');
  const nibs = scene.strokes[0]!.shapes.filter(shape => shape.kind === 'ellipse');
  expect(nibs).toHaveLength(3);
  for (const [index, scale] of [.25, 1, 1.75].entries()) expect(nibs[index]!.rx).toBeCloseTo(.2 * 72 / 2.54 * scale / 2, 8);
});

test('Word rectangle pens rotate without stretching when sample coordinates scale', () => {
  const ink = readOfficeInk(bytes(officeInk({ trace: '0 0', brush: '<brushProperty name="width" value="0.1" units="cm"/><brushProperty name="height" value="0.3" units="cm"/><brushProperty name="tip" value="rectangle"/>' })));
  const scene = createOfficeInkScene(ink, { renderingProfile: 'word', sampleTransform: [0, 2, -3, 0, 0, 0], brushRotation: Math.PI / 2 });
  if (!scene.supported) throw Error('Expected supported scene');
  expect(scene.bounds.width).toBeCloseTo(.3 * 72 / 2.54);
  expect(scene.bounds.height).toBeCloseTo(.1 * 72 / 2.54);
});
