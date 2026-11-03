import { expect, test } from 'bun:test';
import { pdfTextInputChange } from '../src/pdf/text-input.ts';

test('native deletion and insertion preserve the intended occurrence of repeated text', () => {
  expect(pdfTextInputChange('AAA', 'AA', { start: 0, end: 0 }, { start: 0, end: 0 })).toEqual({
    start: 0,
    end: 1,
    insert: '',
  });
  expect(pdfTextInputChange('AAA', 'AA', { start: 1, end: 1 }, { start: 0, end: 0 })).toEqual({
    start: 0,
    end: 1,
    insert: '',
  });
  expect(pdfTextInputChange('AAA', 'AAAA', { start: 1, end: 1 }, { start: 2, end: 2 })).toEqual({
    start: 1,
    end: 1,
    insert: 'A',
  });
  expect(pdfTextInputChange('AAAA', 'AAA', { start: 1, end: 3 }, { start: 2, end: 2 })).toEqual({
    start: 1,
    end: 3,
    insert: 'A',
  });
});
test('input changes keep surrogate pairs whole even when only one UTF-16 unit differs', () => {
  expect(pdfTextInputChange('😀', '😈')).toEqual({ start: 0, end: 2, insert: '😈' });
  const next = String.fromCodePoint(0x1fa00);
  expect(pdfTextInputChange('😀', next)).toEqual({ start: 0, end: 2, insert: next });
});
