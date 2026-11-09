import { expect, test } from 'bun:test';
import { pdfHistoryShortcut } from '../src/pdf/history-shortcut.ts';

function key(key: string, options: Partial<KeyboardEvent> = {}) {
  return {
    key,
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    defaultPrevented: false,
    isComposing: false,
    ...options,
  } as KeyboardEvent;
}

test('PDF history supports Windows and Mac undo and both redo shortcuts', () => {
  expect(pdfHistoryShortcut(key('z'))).toBe('undo');
  expect(pdfHistoryShortcut(key('Z', { shiftKey: true }))).toBe('redo');
  expect(pdfHistoryShortcut(key('y'))).toBe('redo');
  expect(pdfHistoryShortcut(key('z', { ctrlKey: false, metaKey: true }))).toBe('undo');
  expect(pdfHistoryShortcut(key('Z', { ctrlKey: false, metaKey: true, shiftKey: true }))).toBe(
    'redo',
  );
});

test('handled input events, composition and unrelated shortcuts do not invoke history', () => {
  expect(pdfHistoryShortcut(key('z', { defaultPrevented: true }))).toBeUndefined();
  expect(pdfHistoryShortcut(key('z', { isComposing: true }))).toBeUndefined();
  expect(pdfHistoryShortcut(key('z', { altKey: true }))).toBeUndefined();
  expect(pdfHistoryShortcut(key('z', { ctrlKey: false }))).toBeUndefined();
  expect(pdfHistoryShortcut(key('c'))).toBeUndefined();
});
