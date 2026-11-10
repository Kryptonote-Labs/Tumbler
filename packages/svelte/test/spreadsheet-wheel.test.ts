import { expect, test } from 'bun:test';
import { spreadsheetWheelScroll } from '../src/spreadsheet-wheel.ts';

function fixture() {
  let id = 0;
  const frames = new Map<number, FrameRequestCallback>();
  const movements: number[][] = [];
  const wheel = spreadsheetWheelScroll(
    (x, y) => movements.push([x, y]),
    (callback) => {
      frames.set(++id, callback);
      return id;
    },
    (frame) => {
      frames.delete(frame);
    },
  );
  return {
    wheel,
    frames,
    movements,
    paint() {
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) callback(0);
    },
  };
}

test('wheel bursts move once per frame and preserve both axes and reversals', () => {
  const f = fixture();
  f.wheel.add(10, 100);
  f.wheel.add(5, 200);
  f.wheel.add(-3, -50);
  expect(f.frames.size).toBe(1);
  expect(f.movements).toEqual([]);
  f.paint();
  expect(f.movements).toEqual([[12, 250]]);
  f.wheel.add(0, -80);
  f.paint();
  expect(f.movements).toEqual([
    [12, 250],
    [0, -80],
  ]);
});

test('navigation or unmount cancels pending wheel movement', () => {
  const f = fixture();
  f.wheel.add(20, 100);
  f.wheel.cancel();
  f.paint();
  expect(f.movements).toEqual([]);
  f.wheel.add(0, 30);
  f.paint();
  expect(f.movements).toEqual([[0, 30]]);
});
