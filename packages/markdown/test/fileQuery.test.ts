import { expect, test } from 'bun:test';
import { serializeNote } from '@tumblerjs/markdown';
import {
  noteState,
  noteFileQuery,
  insertNoteFileReference,
  TextSelection,
  undo,
} from '@tumblerjs/markdown/editor';

test('file completion replaces only the unfinished reference, preserves formatting, and undoes to the query', () => {
  let state = noteState('Before **[[/Rep**');
  state = state.apply(state.tr.setSelection(TextSelection.atEnd(state.doc)));
  const query = noteFileQuery(state)!;
  expect(query.query).toBe('Rep');
  const before = state.doc;
  const dispatch = (tr: typeof state.tr) => {
    state = state.apply(tr);
  };
  expect(insertNoteFileReference('file-report', 'Report', query)(state, dispatch)).toBe(true);
  expect(state.doc.textContent).toBe('Before Report');
  expect(serializeNote(state.doc)).toContain('[[file-report|Report]]');
  expect(state.doc.lastChild!.lastChild!.marks.some((mark) => mark.type.name === 'strong')).toBe(
    true,
  );
  expect(noteFileQuery(state)).toBeUndefined();
  undo(state, dispatch);
  expect(state.doc.eq(before)).toBe(true);
  state = state.apply(state.tr.insertText('x'));
  expect(insertNoteFileReference('wrong', 'Wrong', query)(state, dispatch)).toBe(false);
});

test('file suggestions stay out of code, selections, completed links and escaped syntax', () => {
  for (const source of ['`[[/Rep`', '```text\n[[/Rep\n```', '[[/Report]]', 'ordinary text']) {
    let state = noteState(source);
    state = state.apply(state.tr.setSelection(TextSelection.atEnd(state.doc)));
    expect(noteFileQuery(state)).toBeUndefined();
  }
  let state = noteState('');
  state = state.apply(state.tr.insertText('\\[[/Rep'));
  expect(noteFileQuery(state)).toBeUndefined();
  state = noteState('[[/Rep');
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1, 4)));
  expect(noteFileQuery(state)).toBeUndefined();
});
