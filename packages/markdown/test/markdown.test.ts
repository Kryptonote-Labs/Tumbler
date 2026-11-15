import { expect, test } from 'bun:test';
import { parseNote, serializeNote, noteColours, noteSchema } from '@tumblerjs/markdown';
import {
  noteState,
  toggleMark,
  receiveTransaction,
  sendableSteps,
  getVersion,
  undo,
  setNoteColour,
  clearNoteFormatting,
  TextSelection,
} from '@tumblerjs/markdown/editor';

test('table cells preserve paragraphs, hard breaks and literal break tags through Markdown', () => {
  const { doc, table, table_row, table_header, paragraph, hard_break } = noteSchema.nodes;
  const document = doc!.create(
    null,
    table!.create(
      null,
      table_row!.create(
        null,
        table_header!.create(null, [
          paragraph!.create(),
          paragraph!.create(null, [
            noteSchema.text('one'),
            hard_break!.create(),
            hard_break!.create(),
            noteSchema.text('two'),
            hard_break!.create(),
          ]),
          paragraph!.create(),
          paragraph!.create(null, [
            noteSchema.text('literal <br> and '),
            noteSchema.text('<br>', [noteSchema.marks.code!.create()]),
          ]),
        ]),
      ),
    ),
  );
  expect(parseNote(serializeNote(document)).eq(document)).toBe(true);
  expect(
    parseNote('| One<br>Two<br><br>Three |\n|---|').firstChild!.firstChild!.firstChild!.childCount,
  ).toBe(2);
});

test('file references retain their target and label in table cells and code remains literal', () => {
  const document = parseNote(
    '| File | Status |\n|---|---|\n| [[file-report|The report]] | Ready |',
  );
  const row = document.firstChild!.lastChild!;
  expect(row.childCount).toBe(2);
  expect(row.firstChild!.textContent).toBe('The report');
  expect(row.firstChild!.firstChild!.firstChild!.marks[0]?.attrs.target).toBe('file-report');
  expect(parseNote(serializeNote(document)).eq(document)).toBe(true);
  const code = parseNote('`[[id\\|Name]]`\n\n```text\n[[id|Name]]\n```');
  expect(code.firstChild!.textContent).toBe('[[id\\|Name]]');
  expect(code.lastChild!.textContent).toBe('[[id|Name]]');
});

test('table paragraph breaks preserve formatting and link targets spanning the break', () => {
  for (const source of [
    '**One<br><br>Two**',
    '[One<br><br>Two](https://example.com)',
    '=🟢One<br><br>Two=',
    '**[One<br><br>Two](https://example.com)**',
  ]) {
    const document = parseNote(`| ${source} |\n|---|`);
    const cell = document.firstChild!.firstChild!.firstChild!;
    expect(cell.lastChild!.firstChild!.marks.map((mark) => mark.toJSON())).toEqual(
      cell.firstChild!.firstChild!.marks.map((mark) => mark.toJSON()),
    );
    expect(cell.lastChild!.firstChild!.marks.length).toBeGreaterThan(0);
    expect(parseNote(serializeNote(document)).eq(document)).toBe(true);
  }
});

test('clear formatting removes selected inline styles, preserves structure and other text, and undoes', () => {
  let state = noteState('# **bold** =🔴red= ==🟢highlight== `code`\n\n- **list**');
  const before = state.doc;
  state = state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, 1, before.firstChild!.nodeSize - 1)),
  );
  const dispatch = (tr: typeof state.tr) => {
    state = state.apply(tr);
  };
  expect(clearNoteFormatting(state, dispatch)).toBe(true);
  expect(state.doc.textContent).toBe(before.textContent);
  expect(state.doc.firstChild?.type.name).toBe('heading');
  expect(state.doc.firstChild?.firstChild?.marks).toEqual([]);
  expect(state.doc.lastChild?.firstChild?.firstChild?.firstChild?.marks[0]?.type.name).toBe(
    'strong',
  );
  undo(state, dispatch);
  expect(state.doc.eq(before)).toBe(true);
});

test('clear formatting at the cursor changes subsequent typing without stripping surrounding text', () => {
  let state = noteState('**bold**');
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 2)));
  const before = state.doc;
  const dispatch = (tr: typeof state.tr) => {
    state = state.apply(tr);
  };
  expect(clearNoteFormatting(state, dispatch)).toBe(true);
  expect(state.doc.eq(before)).toBe(true);
  expect(clearNoteFormatting(state)).toBe(false);
  state = state.apply(state.tr.insertText('X'));
  expect(state.doc.nodeAt(2)?.marks).toEqual([]);
  expect(state.doc.firstChild?.firstChild?.marks[0]?.type.name).toBe('strong');
});

test('notes preserve text, nested formatting and both colour syntaxes through Markdown', () => {
  const markdown =
    '# Heading\n\nBefore **bold** and =🟢green=, ==🔴highlighted== and =🔵**bold blue**= after.\n\n`=🟢literal=` and \\=🟢escaped=\n\n- [ ] Task\n- [x] Done\n\n> [!tip]\n> Keep **this**.\n\n[[Other note|Alias]]\n\n| A | B |\n| --- | --- |\n| One | Two |';
  const document = parseNote(markdown);
  document.check();
  expect(document.textContent).toContain('Before bold and green, highlighted and bold blue after.');
  expect(document.textContent).toContain('=🟢literal=');
  expect(parseNote(serializeNote(document)).eq(document)).toBe(true);
  for (const colour of noteColours) {
    const coloured = parseNote(`=${colour.emoji}text= ==${colour.emoji}highlight==`);
    expect(coloured.firstChild?.firstChild?.marks[0]?.attrs.colour).toBe(colour.name);
    expect(parseNote(serializeNote(coloured)).eq(coloured)).toBe(true);
  }
  expect(parseNote('x = y and ==🟢unfinished').textContent).toBe('x = y and ==🟢unfinished');
});

test('concurrent typing rebases over ribbon formatting and undo preserves the other writer', () => {
  let first = noteState('hello', 0, 'first');
  let second = noteState('hello', 0, 'second');
  first = first.apply(first.tr.insertText('!', 6));
  second = second.apply(second.tr.addMark(1, 6, second.schema.marks.strong!.create()));
  const formatting = sendableSteps(second)!;
  first = first.apply(
    receiveTransaction(
      first,
      formatting.steps,
      formatting.steps.map(() => 'second'),
    ),
  );
  second = second.apply(
    receiveTransaction(
      second,
      formatting.steps,
      formatting.steps.map(() => 'second'),
    ),
  );
  const typing = sendableSteps(first)!;
  first = first.apply(
    receiveTransaction(
      first,
      typing.steps,
      typing.steps.map(() => 'first'),
    ),
  );
  second = second.apply(
    receiveTransaction(
      second,
      typing.steps,
      typing.steps.map(() => 'first'),
    ),
  );
  expect(first.doc.eq(second.doc)).toBe(true);
  expect(first.doc.textContent).toBe('hello!');
  expect(getVersion(first)).toBe(2);
  undo(first, (transaction) => {
    first = first.apply(transaction);
  });
  expect(first.doc.textContent).toBe('hello');
  expect(first.doc.firstChild?.firstChild?.marks[0]?.type.name).toBe('strong');
  expect(toggleMark(first.schema.marks.em!)(first)).toBe(true);
});

test('ribbon colours replace a different colour and toggle off the selected colour', () => {
  let state = noteState('=🟢green=');
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1, 6)));
  setNoteColour('colour', 'blue')(state, (transaction) => {
    state = state.apply(transaction);
  });
  expect(state.doc.firstChild?.firstChild?.marks[0]?.attrs.colour).toBe('blue');
  setNoteColour('colour', 'blue')(state, (transaction) => {
    state = state.apply(transaction);
  });
  expect(state.doc.firstChild?.firstChild?.marks).toHaveLength(0);
});
