import type * as Y from 'yjs';
import { createWordCommands, type WordRange } from '../collaboration/commands.ts';
import { positionedWordEdit, type WordPositionedEdit } from '../collaboration/page-number.ts';
import { createWordOperations } from './execute.ts';
import type { WordOperation } from './definitions.ts';

export interface WordAutoformatEdit extends WordPositionedEdit {
  readonly kind: 'heading' | 'list';
}

/** Prepare a typing shortcut after its trailing space has been inserted. Hosts decide which input events qualify. */
export function createWordAutoformat(commands = createWordCommands()) {
  const prepareOperation = createWordOperations(commands);
  return function prepareWordAutoformat(text: Y.Text, range: WordRange): WordAutoformatEdit | undefined {
    if (range.start !== range.end) return;
    const value = text.toString();
    const start = range.start === 0 ? 0 : value.lastIndexOf('\n', range.start - 1) + 1;
    const prefix = value.slice(start, range.start);
    let operation: WordOperation;
    if (/^#{1,6} $/.test(prefix)) {
      operation = { name: 'style', input: { styleId: `Heading${prefix.length - 1}` } };
    } else if (/^[-*] $/.test(prefix)) {
      operation = { name: 'list', input: { kind: 'bullet' } };
    } else if (prefix === '1. ') {
      operation = { name: 'list', input: { kind: 'decimal', start: 1 } };
    } else return;
    if (commands.wordFormats(text, range).list) return;
    commands.anchorWordRange(text, range);
    const edit = positionedWordEdit(text, (staged) => {
      staged.applyDelta(commands.replaceWordDelta(staged, { start, end: range.start }, ''));
      const caret = { start, end: start };
      staged.applyDelta(prepareOperation(staged, caret, operation).delta);
      return caret;
    });
    commands.validateWordDelta(text, edit.delta);
    return { ...edit, kind: operation.name === 'style' ? 'heading' : 'list' };
  };
}
