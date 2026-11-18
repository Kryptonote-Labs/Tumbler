import { expect, test } from 'bun:test';
import { TextSelection } from 'prosemirror-state';
import { noteState, toggleLatexStyle, undo } from '../src/editor';
import { parseLatex, replaceLatexSource, serializeLatex } from '../src/latex';

const article = String.raw`% \\begin{document}
\documentclass[11pt]{article}
\newcommand{\R}{\mathbb{R}}

\begin{document}
\section*[Short title] {Energy}

Ordinary prose. \emph{Nested \textbf{bold}} and \textbf{A}\textbf{B}.
An equation $v^2$ and an escaped \% with \R.
% Keep this comment as written.

\begin{itemize}
  \item First
  \item Second
  \begin{enumerate}
    \item Nested
  \end{enumerate}
\end{itemize}

\[
  E_k = \frac{1}{2}mv^2
\]
\begin{verbatim}
  \input{do-not-run}
  \section{Opaque}
\end{verbatim}
\end{document}
% End comment`.replaceAll('\n', '\r\n');

test('LaTeX keeps original bytes around visual text, ribbon formatting and equation edits', () => {
  const document = parseLatex(article);
  expect(serializeLatex(document)).toBe(article);
  expect(document.firstChild?.type.name).toBe('heading');
  expect(document.textContent).toContain('Ordinary prose.');
  let state = noteState('', 0, 'test', document);
  const dispatch = (tr: Parameters<typeof state.apply>[0]) => {
    state = state.apply(tr);
  };
  dispatch(state.tr.insertText('Power', 1, 7));
  const paragraph = state.doc.child(1);
  const start = state.doc.child(0).nodeSize + 1;
  expect(paragraph.textContent.startsWith('Ordinary')).toBe(true);
  dispatch(state.tr.setSelection(TextSelection.create(state.doc, start, start + 8)));
  toggleLatexStyle('strong')(state, dispatch);
  const positions: number[] = [];
  state.doc.descendants((node, position) => {
    if (node.type.name === 'latex_display_math') positions.push(position);
  });
  dispatch(state.tr.setNodeAttribute(positions[0]!, 'source', '\r\n  E_k = \\frac{2}{3}mv^2\r\n'));
  expect(serializeLatex(state.doc)).toBe(
    article
      .replace('{Energy}', '{Power}')
      .replace('Ordinary', '\\textbf{Ordinary}')
      .replace('\\frac{1}{2}', '\\frac{2}{3}'),
  );
});

test('source edits use the same undo history and leave the rest of the article intact', () => {
  let state = noteState('', 0, 'test', parseLatex(article));
  const rewritten = article.replace('First', 'Edited');
  const edit = replaceLatexSource(state.doc, rewritten);
  expect(edit.steps).toHaveLength(1);
  expect(edit.steps[0]?.getMap().map(1)).toBe(1);
  const tr = state.tr;
  for (const step of edit.steps) tr.step(step);
  state = state.apply(tr);
  expect(serializeLatex(state.doc)).toBe(rewritten);
  undo(state, (transaction) => {
    state = state.apply(transaction);
  });
  expect(serializeLatex(state.doc)).toBe(article);
});
