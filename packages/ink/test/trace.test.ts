import { expect, test } from 'bun:test';
import fc from 'fast-check';
import { decodeInkTrace, encodeInkTrace, type InkChannel } from '../src/index.ts';

const xy: readonly InkChannel[] = [{ name: 'X', type: 'integer' }, { name: 'Y', type: 'integer' }];
test('matches the first three rows of the W3C §3.2.2 decoding example', () => {
  expect(decodeInkTrace(`1125 18432,'23'43,"7"-8`, xy)).toEqual([[1125, 18432], [1148, 18475], [1178, 18510]]);
});
test('independent modes, adjacent signs, resets, trailing comma and acceleration wildcards', () => {
  expect(decodeInkTrace(`10 20,'2'3,"1"-1,**,!50'2,'-4!60,`, xy)).toEqual([
    [10, 20], [12, 23], [15, 25], [19, 26], [50, 28], [46, 60],
  ]);
  expect(decodeInkTrace('10 20, -13-38', xy)).toEqual([[10, 20], [-13, -38]]);
  expect(decodeInkTrace('0 0,\n\t! #A - #F', xy)).toEqual([[0, 0], [10, -15]]);
});

test('intermittent values distinguish omitted, repeated and unavailable samples', () => {
  const channels: InkChannel[] = [...xy, { name: 'button', type: 'boolean', intermittent: true }, { name: 'temperature', type: 'decimal', intermittent: true, defaultValue: 21 }];
  expect(decodeInkTrace('1 2,3 4 T 22,5 6 ? ?,7 8,9 10 F', channels)).toEqual([
    [1, 2, false, 21], [3, 4, true, 22], [5, 6, null, null], [7, 8, true, 22], [9, 10, false, 22],
  ]);
});

test.each([
  "'1 0", '"1 0', '* 0', '0 0, "1 0', '0 0,1 1,"1 1', '0 0,1', '0 0 1', '0 0,,',
  '0 0,? 1', 'T 0', 'NaN 0', 'Infinity 0', '1e309 0', '1.5 0', '9007199254740992 0', '+1 0', '#ff 0', '\u00a00 0',
])('rejects invalid regular trace %s', text => expect(() => decodeInkTrace(text, xy)).toThrow());

test('validates channel definitions, type, decoded range and explicit restarts', () => {
  expect(() => decodeInkTrace('0 0', [xy[0]!, xy[0]!])).toThrow('unique');
  expect(() => decodeInkTrace('0 0', [{ ...xy[0]!, intermittent: true }, xy[1]!])).toThrow('precede');
  expect(() => decodeInkTrace('0', [{ name: 'S', type: 'boolean' }])).toThrow();
  expect(() => decodeInkTrace('*', [{ name: 'S', type: 'boolean', intermittent: true, defaultValue: 1 }])).toThrow('default');
  expect(() => decodeInkTrace('0', [{ ...xy[0]!, min: NaN }])).toThrow('bounds');
  expect(() => decodeInkTrace(`1,'1`, [{ ...xy[0]!, intermittent: true }])).toThrow();
  expect(() => decodeInkTrace(`9,'2`, [{ ...xy[0]!, max: 10 }])).toThrow('bounds');
  expect(decodeInkTrace('-.25 1E-3', xy.map(c => ({ ...c, type: 'double' })))).toEqual([[-.25, .001]]);
  expect(decodeInkTrace('', xy)).toEqual([]);
});

test('2,000 generated absolute traces round trip through the independent grammar decoder', () => {
  fc.assert(fc.property(fc.array(fc.tuple(fc.integer(), fc.integer()), { maxLength: 100 }), points => {
    expect(decodeInkTrace(encodeInkTrace(points, xy), xy)).toEqual(points);
  }), { numRuns: 2000, seed: 376 });
});

test('2,000 generated differential streams agree with a numerical integration oracle', () => {
  fc.assert(fc.property(fc.tuple(fc.integer({ min: -1000, max: 1000 }), fc.integer({ min: -100, max: 100 })), fc.array(fc.integer({ min: -100, max: 100 }), { maxLength: 100 }), ([origin, velocity], accelerations) => {
    let position = origin + velocity, speed = velocity;
    const expected = [[origin], [position], ...accelerations.map(a => { speed += a; position += speed; return [position]; })];
    const encoded = `${origin},'${velocity}${accelerations.length ? ',"' + accelerations.join(',') : ''}`;
    expect(decodeInkTrace(encoded, [xy[0]!])).toEqual(expected);
  }), { numRuns: 2000, seed: 2003 });
});

test('encoder rejects malformed points and nonfinite values', () => {
  for (const points of [[[1]], [[1, 2, 3]], [[NaN, 0]], [[null, 0]], [[true, 0]]]) expect(() => encodeInkTrace(points, xy)).toThrow();
});

test('2,000 mixed-order streams agree with an independent state-machine oracle', () => {
  const step = fc.record({ mode: fc.constantFrom('absolute', 'velocity', 'acceleration', 'repeat'), value: fc.integer({ min: -100, max: 100 }) });
  fc.assert(fc.property(fc.array(step, { maxLength: 100 }), steps => {
    let value = 0, velocity = 0, raw = 0, mode = 'absolute';
    const samples = ['0'], expected = [[0]];
    for (const next of steps) {
      const operation = next.mode === 'acceleration' && mode === 'absolute' ? 'velocity' : next.mode;
      if (operation !== 'repeat') { mode = operation; raw = next.value; }
      if (mode === 'absolute') value = raw;
      else { velocity = mode === 'velocity' ? raw : velocity + raw; value += velocity; }
      samples.push(operation === 'repeat' ? '*' : (mode === 'absolute' ? '!' : mode === 'velocity' ? "'" : '"') + raw);
      expected.push([value]);
    }
    expect(decodeInkTrace(samples.join(','), [xy[0]!])).toEqual(expected);
  }), { numRuns: 2000, seed: 2011 });
});
