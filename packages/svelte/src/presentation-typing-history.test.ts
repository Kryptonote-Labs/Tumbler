import { expect, test } from 'bun:test';
import { PresentationTypingHistory } from './presentation-typing-history.ts';
test('continuous typing groups until a pause, caret move, input kind change or explicit boundary', () => {
  const h = new PresentationTypingHistory();
  const first = h.group('insertText', {start:0,end:0}, 'H', 0);
  expect(h.group('insertText', {start:1,end:1}, 'i', 100)).toBe(first);
  expect(h.group('insertText', {start:2,end:2}, '!', 1100)).not.toBe(first);
  h.break();
  const next = h.group('insertText', {start:3,end:3}, 'a', 1200);
  expect(h.group('insertText', {start:0,end:0}, 'b', 1300)).not.toBe(next);
  const deletion = h.group('deleteContentBackward', {start:2,end:3}, '', 1400);
  expect(h.group('deleteContentBackward', {start:1,end:2}, '', 1500)).toBe(deletion);
  expect(h.group('deleteContentForward', {start:1,end:2}, '', 1600)).not.toBe(deletion);
});
test('paste, composition, replacement and paragraph breaks stay separate', () => {
  const h = new PresentationTypingHistory();
  for (const kind of ['', 'insertReplacementText', 'insertParagraph']) {
    const first = h.group(kind, {start:0,end:0}, 'a', 0);
    expect(h.group(kind, {start:1,end:1}, 'b', 100)).not.toBe(first);
  }
  const first = h.group('insertText', {start:0,end:0}, '\n', 0);
  expect(h.group('insertText', {start:1,end:1}, 'b', 100)).not.toBe(first);
});
