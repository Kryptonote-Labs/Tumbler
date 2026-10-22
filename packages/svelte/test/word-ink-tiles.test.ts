import { expect, test } from 'bun:test';
import { layoutWordDocument } from '@tumblerjs/word';
import { inkFixture } from '../../word/test/ink-fixture.ts';
import { officeInk } from '../../ink/test/fixture.ts';
import { wordInkTiles, reserveWordInkPixels, WORD_INK_RETAINED_PIXELS } from '../src/word-ink-tiles.ts';

const source = inkFixture(false, false, officeInk({ brush: '<brushProperty name="rasterOp" value="xOrPen"/>' })).source;
const page = layoutWordDocument(source.document, { measure: text => ({ width: text.length * 6, ascent: 9, descent: 3 }) }).pages[0]!;

test('affected-region plans stay disjoint and within finite budgets at extreme zoom', () => {
  for (const scale of [4 / 3, 8, 1e100]) for (const budget of [1, 1024, 1_048_576]) {
    const plan = wordInkTiles(page, scale, budget);
    expect(plan.pixels).toBeLessThanOrEqual(budget);
    expect(plan.scale).toBeLessThanOrEqual(4);
    for (const tile of plan.tiles) {
      expect(tile.width * tile.height).toBeLessThanOrEqual(65_536);
      for (const other of plan.tiles) if (other !== tile) {
        expect(tile.x + tile.width <= other.x || other.x + other.width <= tile.x || tile.y + tile.height <= other.y || other.y + other.height <= tile.y).toBe(true);
      }
    }
  }
  expect(() => wordInkTiles(page, 1, Infinity)).toThrow();
  expect(() => wordInkTiles(page, NaN)).toThrow();
});

test('mounted overlays share a budget and release reservations once', () => {
  const release = reserveWordInkPixels(WORD_INK_RETAINED_PIXELS)!;
  expect(release).toBeFunction();
  expect(reserveWordInkPixels(1)).toBeUndefined();
  release(); release();
  const again = reserveWordInkPixels(WORD_INK_RETAINED_PIXELS)!;
  expect(again).toBeFunction();
  expect(reserveWordInkPixels(1)).toBeUndefined();
  again();
});

test('extreme page and ink dimensions lower resolution without allocating the page', () => {
  const extreme = { ...page, width: 1e100, height: 1e100, columns: page.columns.map(column => ({ ...column, lines: column.lines.map(line => ({ ...line, fragments: line.fragments.map(fragment => fragment.drawing ? { ...fragment, x: 1e90, y: 1e90, width: 1e95, height: 1e95 } : fragment) })) })) };
  const plan = wordInkTiles(extreme, 8);
  expect(plan.pixels).toBeLessThanOrEqual(1_048_576);
  expect(plan.tiles.length).toBeLessThanOrEqual(256);
  expect(plan.scale).toBeLessThan(1e-90);
});
