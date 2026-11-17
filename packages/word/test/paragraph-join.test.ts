import { expect, test } from 'bun:test';
import * as Y from 'yjs';
import { createWordCommands } from '../src/collaboration/index.ts';
import { createWordParagraphBreak } from '../src/operations/index.ts';

const commands = createWordCommands();
const paragraphBreak = createWordParagraphBreak(commands);

for (const styleId of ['Heading1', 'Heading2']) {
  test(`joining ${styleId} after Enter retains its style, including after undo and redo`, () => {
    const doc = new Y.Doc();
    const text = doc.getText('body');
    text.applyDelta([
      { insert: 'Heading', attributes: { bold: true, fontSize: 20 } },
      { insert: '\n', attributes: { styleId } },
    ]);
    text.applyDelta(paragraphBreak(text, { start: 7, end: 7 })!.delta);
    const undo = new Y.UndoManager(text);
    const joined = commands.replaceWordDelta(text, { start: 7, end: 8 }, '');
    commands.validateWordDelta(text, joined);
    text.applyDelta(joined);
    expect(text.toString()).toBe('Heading\n');
    expect(commands.wordFormats(text, { start: 7, end: 7 }).styleId).toBe(styleId);
    undo.undo();
    expect(text.toString()).toBe('Heading\n\n');
    expect(commands.wordFormats(text, { start: 7, end: 7 }).styleId).toBe(styleId);
    expect(commands.wordFormats(text, { start: 8, end: 8 }).styleId).toBe('Normal');
    undo.redo();
    expect(commands.wordFormats(text, { start: 7, end: 7 }).styleId).toBe(styleId);
    text.applyDelta(paragraphBreak(text, { start: 7, end: 7 })!.delta);
    expect(commands.wordFormats(text, { start: 8, end: 8 }).styleId).toBe('Normal');
    expect(commands.wordFormats(text, { start: 7, end: 7 }).styleId).toBe(styleId);
    undo.destroy();
    doc.destroy();
  });
}

test('a replacement across paragraphs retains the surviving prefix format and resets trailing overrides', () => {
  const doc = new Y.Doc();
  const text = doc.getText('body');
  text.applyDelta([
    { insert: 'Heading' },
    { insert: '\n', attributes: { styleId: 'Heading2', align: 'center', paragraph: { spacingAfterTwips: 300 } } },
    { insert: 'Body' },
    { insert: '\n', attributes: { styleId: 'Normal', list: { kind: 'bullet', level: 0 }, 'wordParagraphFormat:spacingAfterTwips': { value: 100 } } },
    { insert: 'Later' },
    { insert: '\n', attributes: { styleId: 'Heading1' } },
  ]);
  text.applyDelta(commands.replaceWordDelta(text, { start: 5, end: 10 }, '!'));
  expect(text.toString()).toBe('Headi!dy\nLater\n');
  const format = commands.wordFormats(text, { start: 6, end: 6 });
  expect(format.styleId).toBe('Heading2');
  expect(format.align).toBe('center');
  expect(format.paragraph?.spacingAfterTwips).toBe(300);
  expect(format.list).toBeUndefined();
  expect(commands.wordFormats(text, { start: 9, end: 9 }).styleId).toBe('Heading1');
  doc.destroy();
});

test('deleting an entire leading paragraph or empty line keeps the following paragraph style', () => {
  for (const leading of ['Before', '']) {
    const doc = new Y.Doc();
    const text = doc.getText('body');
    text.applyDelta([
      { insert: `${leading}\n`, attributes: { styleId: 'Normal' } },
      { insert: 'Heading\n', attributes: { styleId: 'Heading2' } },
    ]);
    text.applyDelta(commands.replaceWordDelta(text, { start: 0, end: leading.length + 1 }, ''));
    expect(text.toString()).toBe('Heading\n');
    expect(commands.wordFormats(text, { start: 0, end: 0 }).styleId).toBe('Heading2');
    doc.destroy();
  }
});
