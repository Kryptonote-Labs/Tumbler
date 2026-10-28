import { expect, test } from 'bun:test';
import * as Y from 'yjs';
import { createWordCommands } from '../src/collaboration/commands.ts';
import { wordSharedText } from '../src/collaboration/structured/view.ts';
import { anchorWordView, resolveWordView } from '../src/collaboration/structured/view-anchors.ts';

test('collapsed anchors preserve the default empty root name, including its end boundary', () => {
  const doc = new Y.Doc(), text = doc.getText(), commands = createWordCommands();
  try {
    for (const value of ['', 'text']) {
      text.insert(0, value);
      const range = { start: text.length, end: text.length };
      const spans = [{ root: '', start: 0, end: text.length, offset: 0 }];
      for (const anchor of [commands.anchorWordRange(text, range), anchorWordView(doc, spans, range)]) {
        expect(anchor.start.tname).toBe('');
        expect(anchor.end.tname).toBe('');
        expect(commands.resolveWordRange(text, anchor)).toEqual(range);
        expect(resolveWordView(doc, spans, anchor)).toEqual(range);
      }
    }
  } finally { doc.destroy(); }
});

test('collapsed and ranged anchors retain standard Yjs identities through edits and undo', () => {
  const doc = new Y.Doc(), text = doc.getText('body');
  for (let run = 0; run < 200; run++) text.insert(text.length, `run${run} 😀 `, { bold: run % 2 === 0 });
  text.insert(text.length, '\n');
  const view = wordSharedText(text), commands = createWordCommands();
  const undo = new Y.UndoManager(text, { captureTimeout: 0 });
  try {
    for (const at of [0, 100, 500, text.length - 1]) for (const length of [0, 2]) {
      if (at + length > text.length - 1) continue;
      const range = { start: at, end: at + length };
      const expected = { start: Y.createRelativePositionFromTypeIndex(text, range.start), end: Y.createRelativePositionFromTypeIndex(text, range.end) };
      for (const actual of [view.anchor(range), commands.anchorWordRange(text, range)]) {
        expect(Y.relativePositionToJSON(actual.start)).toEqual(Y.relativePositionToJSON(expected.start));
        expect(Y.relativePositionToJSON(actual.end)).toEqual(Y.relativePositionToJSON(expected.end));
        expect(actual.start).not.toBe(actual.end);
        if (actual.start.item && actual.end.item) expect(actual.start.item).not.toBe(actual.end.item);
        text.insert(at, 'inserted');
        const resolved = { start: Y.createAbsolutePositionFromRelativePosition(expected.start, doc)!.index, end: Y.createAbsolutePositionFromRelativePosition(expected.end, doc)!.index };
        expect(view.resolve(actual)).toEqual(resolved);
        expect(commands.resolveWordRange(text, actual)).toEqual(resolved);
        undo.undo();
        expect(view.resolve(actual)).toEqual(range);
        expect(commands.resolveWordRange(text, actual)).toEqual(range);
      }
    }
  } finally { undo.destroy(); view.destroy(); doc.destroy(); }
});
