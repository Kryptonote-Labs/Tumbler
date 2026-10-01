import { expect, test } from 'bun:test';
import { NativeWordText, NativeWordTextLayout, openWordArtifact, wordParagraphText } from '../src/index.ts';

test('sequential edits preserve unaffected paragraphs and export the current text', () => {
  const document = new NativeWordText('Hello\nWorld');
  const first = document.paragraphs[0];
  document.transact([{ start: 6, deleteCount: 5, insert: 'Tumbler' }, { start: 13, deleteCount: 0, insert: '\nWelcome' }]);
  expect(document.text).toBe('Hello\nTumbler\nWelcome');
  expect(document.paragraphs[0]).toBe(first);
  expect(document.revision).toBe(1);
  const exported = openWordArtifact(document.docx()).document;
  expect(exported.blocks.flatMap(block => block.kind === 'paragraph' ? [wordParagraphText(exported, block)] : []).join('\n')).toBe(document.text);
});

test('UTF-16 edits are atomic and no-op transactions do not advance revision', () => {
  const document = new NativeWordText('😀 hello');
  expect(() => document.transact([{ start: 2, deleteCount: 0, insert: '!' }, { start: 99, deleteCount: 0, insert: 'bad' }])).toThrow();
  expect(() => document.transact([{ start: 1, deleteCount: 1, insert: '' }])).toThrow();
  expect(document.text).toBe('😀 hello');
  expect(document.revision).toBe(0);
  document.transact([{ start: 0, deleteCount: 0, insert: '' }]);
  expect(document.revision).toBe(0);
  document.transact([{ start: 0, deleteCount: 2, insert: 'Hi' }]);
  expect(document.text).toBe('Hi hello');
});

test('continuous text layout reuses unchanged paragraphs after a split', () => {
  const document = new NativeWordText('First\nLast');
  const layout = new NativeWordTextLayout({ measure: text => ({ width: text.length * 6, ascent: 9, descent: 3 }) }, 300);
  const last = layout.paragraph(document.paragraphs[1]!);
  document.transact([{ start: 2, deleteCount: 0, insert: '\n' }]);
  expect(layout.paragraph(document.paragraphs[2]!)).toBe(last);
  expect(layout.measuredParagraphs).toBe(1);
});
