import { expect, test } from 'bun:test';
import { PdfTextModel, defaultPdfTextStyle } from '@tumblerjs/pdf';
import { copyPdfText, pastePdfText } from '../src/pdf/clipboard.ts';
function setup() {
  const model = new PdfTextModel();
  model.add({ id: 'box', page: 0, x: 0, y: 0, width: 100, lineHeight: 15,
    style: defaultPdfTextStyle, sources: [], delta: [{ insert: 'hello world', attributes: defaultPdfTextStyle }] });
  model.undo.clear();
  return model;
}
test('cut writes selected text and is one undoable edit; copy leaves content unchanged', async () => {
  const model = setup();
  let copied = '';
  const clipboard = { writeText: async (text: string) => { copied = text; } };
  await copyPdfText(model, 'box', 0, 5, clipboard, () => false);
  expect(copied).toBe('hello');
  expect(model.undo.canUndo()).toBe(false);
  await copyPdfText(model, 'box', 0, 5, clipboard, () => true);
  expect(model.text('box').toString()).toBe(' world');
  model.undo.undo();
  expect(model.text('box').toString()).toBe('hello world');
  model.doc.destroy();
});
test('clipboard failure and revoked access never remove text', async () => {
  const model = setup();
  await expect(copyPdfText(model, 'box', 0, 5, { writeText: async () => { throw Error('denied'); } }, () => true)).rejects.toThrow('denied');
  await pastePdfText(model, 'box', 0, 5, { readText: async () => 'new' }, () => false);
  expect(model.text('box').toString()).toBe('hello world');
  expect(model.undo.canUndo()).toBe(false);
  model.doc.destroy();
});
test('paste replaces the intended range after another edit while permission is pending', async () => {
  const model = setup();
  const pending = Promise.withResolvers<string>();
  const pasting = pastePdfText(model, 'box', 6, 11, { readText: () => pending.promise }, () => true);
  model.replace('box', 0, 0, 'Oh ');
  model.undo.stopCapturing();
  pending.resolve('Alex');
  await pasting;
  expect(model.text('box').toString()).toBe('Oh hello Alex');
  model.undo.undo();
  expect(model.text('box').toString()).toBe('Oh hello world');
  model.doc.destroy();
});
