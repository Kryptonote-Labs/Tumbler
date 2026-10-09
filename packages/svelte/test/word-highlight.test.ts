import { expect, test } from 'bun:test';
import { wordHighlightColor } from '../src/word-highlight.ts';
test('Word highlights map to their palette colours without admitting arbitrary CSS', () => {
  expect(wordHighlightColor('yellow')).toBe('#FFFF00');
  expect(wordHighlightColor('darkYellow')).toBe('#808000');
  expect(wordHighlightColor('none')).toBe('transparent');
  expect(wordHighlightColor('red;position:fixed')).toBe('transparent');
});
