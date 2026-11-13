import { expect, test } from 'bun:test';
import { normalizeNativeSelection } from '../src/native-edit.ts';
import type { WordContentBlock } from '../src/create-content.ts';

const blocks: readonly WordContentBlock[] = [{ kind: 'paragraph', id: 'a', runs: [
  { text: 'e', format: { bold: true } }, { text: '\u0301x' },
] }];
const position = (offset: number) => ({ paragraphId: 'a', offset });

test('a caret inside a formatted grapheme resolves to a whole-paragraph boundary', () => {
  const after = { ...position(1), affinity: 'after' as const };
  const before = { ...position(1), affinity: 'before' as const };
  expect(normalizeNativeSelection(blocks, { anchor: after, focus: after })?.focus.offset).toBe(2);
  expect(normalizeNativeSelection(blocks, { anchor: before, focus: before })?.focus.offset).toBe(0);
  expect(normalizeNativeSelection(blocks, { anchor: position(0), focus: position(0) })?.focus.offset).toBe(0);
});

test('partial grapheme selections expand without reversing their direction', () => {
  expect(normalizeNativeSelection(blocks, { anchor: position(1), focus: position(2) })).toEqual({ anchor: position(0), focus: position(2) });
  expect(normalizeNativeSelection(blocks, { anchor: position(2), focus: position(1) })).toEqual({ anchor: position(2), focus: position(0) });
});

test('stale browser positions are ignored rather than applied to another paragraph', () => {
  expect(normalizeNativeSelection(blocks, { anchor: position(4), focus: position(4) })).toBeUndefined();
  expect(normalizeNativeSelection(blocks, { anchor: { paragraphId: 'gone', offset: 0 }, focus: position(0) })).toBeUndefined();
});
