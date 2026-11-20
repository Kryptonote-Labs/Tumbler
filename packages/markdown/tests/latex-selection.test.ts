import { expect, test } from 'bun:test';
import { Fragment, Slice } from 'prosemirror-model';
import { TextSelection } from 'prosemirror-state';
import { LatexRangeSelection, latexRangeSelection, noteState } from '../src/editor';
import { parseLatex, serializeLatex } from '../src/latex';
import { notePresenceKey } from '../src/presence';

const titled = parseLatex(String.raw`\documentclass{article}
\title{Results}
\begin{document}
\maketitle
First paragraph.

Second paragraph.
\end{document}
`);

test('a range dragged past the title at the top of the page takes the title in', () => {
  const inFirst = 5,
    title = titled.child(0);
  expect(title.isAtom).toBe(true);
  const range = latexRangeSelection(titled.resolve(inFirst), titled.resolve(0));
  expect(range).toBeInstanceOf(LatexRangeSelection);
  expect(range.from).toBe(0);
  expect(range.content().content.firstChild?.type).toBe(title.type);
  // Between paragraphs, an end still moves into the nearest text.
  const between = title.nodeSize + titled.child(1).nodeSize;
  expect(latexRangeSelection(titled.resolve(inFirst), titled.resolve(between))).toBeInstanceOf(
    TextSelection,
  );
  // Deleting the range leaves an editable paragraph and an ordinary caret.
  const state = noteState('', 0, undefined, titled);
  const after = state.apply(
    state.tr
      .setSelection(latexRangeSelection(state.doc.resolve(inFirst), state.doc.resolve(0)))
      .deleteSelection(),
  );
  expect(after.doc.firstChild?.type.name).toBe('paragraph');
  expect(after.selection).toBeInstanceOf(TextSelection);
});

test('a collaborator caret beside a whole object is not drawn between blocks', () => {
  const state = noteState('', 0, undefined, titled);
  const cursor = { id: 'peer', name: 'Peer', color: '#888', focused: true };
  const decorations = (anchor: number, head: number) =>
    notePresenceKey
      .getState(state.apply(state.tr.setMeta(notePresenceKey, [{ ...cursor, anchor, head }])))!
      .find()
      .filter((decoration) => decoration.from === decoration.to);
  expect(decorations(0, titled.child(0).nodeSize)).toHaveLength(0);
  expect(decorations(5, 5)).toHaveLength(1);
});

test('an empty abstract stays an editable block after a round trip', () => {
  const source = String.raw`\documentclass{article}
\begin{document}
\begin{abstract}

\end{abstract}
Text.
\end{document}
`;
  const document = parseLatex(source);
  const abstract = document.child(0);
  expect(abstract.type.name).toBe('blockquote');
  expect(abstract.child(0).type.name).toBe('paragraph');
  expect(serializeLatex(document)).toBe(source);
  const typed = document.replace(
    2,
    2,
    new Slice(Fragment.from(document.type.schema.text('Summary.')), 0, 0),
  );
  expect(serializeLatex(typed)).toContain('\\begin{abstract}Summary.');
});
