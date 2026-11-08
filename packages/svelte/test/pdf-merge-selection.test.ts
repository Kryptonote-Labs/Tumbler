import { expect, test } from 'bun:test';
import { mergePageSelection, mergePageRanges, toggleMergePage } from '../src/pdf/merge-selection.ts';

test('range input preserves custom order and repeated pages while distinguishing none from all', () => {
  expect(mergePageSelection('', 4)).toMatchObject({ pages: [0, 1, 2, 3], custom: false, error: '' });
  expect(mergePageSelection('', 4, true).pages).toEqual([]);
  expect(mergePageSelection('3,1-2,3', 4)).toMatchObject({ pages: [2, 0, 1, 2], custom: true });
  expect(mergePageSelection('2,4', 4)).toMatchObject({ pages: [1, 3], custom: false });
  for (const range of ['0', '5', '1-', 'garbage']) expect(mergePageSelection(range, 4).error).not.toBe('');
});

test('checkbox and shift selection produce editable compact ranges', () => {
  expect(toggleMergePage([0, 1, 2, 3], 1)).toEqual([0, 2, 3]);
  expect(toggleMergePage([0], 3, 1)).toEqual([0, 1, 2, 3]);
  const pages = toggleMergePage([], 2);
  expect(mergePageRanges(pages)).toBe('3');
  expect(mergePageRanges([0, 1, 2, 4, 6, 7])).toBe('1-3,5,7-8');
  expect(mergePageSelection(mergePageRanges(pages), 4).pages).toEqual(pages);
});
