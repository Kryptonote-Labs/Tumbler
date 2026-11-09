import { expect, test } from 'bun:test';
import { spreadsheetScrollAxis } from '../src/spreadsheet-scroll.ts';

test('ordinary scroll sizes preserve pixel positions', () => {
  const axis=spreadsheetScrollAxis(10000,600);
  expect(axis.extent).toBe(10000);
  expect(axis.logical(300)).toBe(300);
  expect(axis.physical(300)).toBe(300);
});

test('large Excel axes fit browser layout and retain their full logical range', () => {
  const total=1048576*409*4/3;
  const axis=spreadsheetScrollAxis(total,600);
  expect(axis.extent).toBe(1000000);
  expect(axis.logical(axis.extent-600)).toBeCloseTo(total-600);
  for(const position of [0,100,10000000,total-600])expect(axis.logical(axis.physical(position))).toBeCloseTo(position);
});

test('scrolling clamps both ends and supports a viewport larger than content', () => {
  const axis=spreadsheetScrollAxis(100,600);
  expect(axis.physical(-10)).toBe(0);
  expect(axis.logical(1000)).toBe(0);
});
