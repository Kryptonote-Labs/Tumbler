import { expect, test } from 'bun:test';
import { TextSelection } from 'prosemirror-state';
import { Step } from 'prosemirror-transform';
import { noteState, toggleLatexStyle, undo } from '../src/editor';
import {
  latexBlockAtOffset,
  latexNumbering,
  paginateLatex,
  parseLatex,
  replaceLatexSource,
  serializeLatex,
} from '../src/latex';
import { pastedLatexText } from '../src/latex-editor';

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

test('reloading the LaTeX editor keeps preamble changes readable by ProseMirror', async () => {
  const document = parseLatex(article);
  const rewritten = article.replace('11pt', '12pt');
  const edit = replaceLatexSource(document, rewritten);
  const [step] = edit.steps;
  expect(step).toBeDefined();

  // A different module URL re-evaluates the codec while ProseMirror keeps its registry.
  const modulePath = '../src/latex-boundary-step.ts?reload';
  await import(modulePath);
  const restored = Step.fromJSON(document.type.schema, step!.toJSON()).apply(document);
  expect(restored.failed).toBeNull();
  expect(serializeLatex(restored.doc!)).toBe(rewritten);
});

test('pasted prose keeps amounts as text and pasted math as math', () => {
  expect(pastedLatexText('costs $5 and $10 per seat')).toBe('costs \\$5 and \\$10 per seat');
  expect(pastedLatexText('pay $5 now')).toBe('pay \\$5 now');
  expect(pastedLatexText('area $x^2$ grows')).toBe('area $x^2$ grows');
  expect(pastedLatexText('use $2$ here')).toBe('use $2$ here');
  expect(pastedLatexText('\\begin{verbatim}\n$PATH\n\\end{verbatim}')).toBe(
    '\\begin{verbatim}\n$PATH\n\\end{verbatim}',
  );
  expect(pastedLatexText('$$a$$ and \\$3')).toBe('$$a$$ and \\$3');
});

test('abstracts edit as native blocks and keep their environment source', () => {
  const source =
    '\\documentclass{article}\n\\begin{document}\n\\begin{abstract}\nWe study \\emph{growth}.\n\\end{abstract}\n\nBody.\n\\end{document}\n';
  const document = parseLatex(source);
  expect(document.firstChild!.type.name).toBe('blockquote');
  expect(document.firstChild!.attrs.open).toBe('\\begin{abstract}');
  expect(serializeLatex(document)).toBe(source);
});

test('source offsets resolve to the innermost block for error reports', () => {
  const source =
    '\\documentclass{article}\n\\begin{document}\nFirst.\n\n\\begin{itemize}\n\\item One\n\\item Two\n\\end{itemize}\n\\end{document}\n';
  const document = parseLatex(source);
  expect(latexBlockAtOffset(document, 5)).toBeUndefined();
  const first = latexBlockAtOffset(document, source.indexOf('First'))!;
  expect(first.node.textContent).toBe('First.');
  const two = latexBlockAtOffset(document, source.indexOf('Two'))!;
  expect(two.node.textContent).toBe('Two');
  expect(document.resolve(two.position + 1).parent.textContent).toBe('Two');
});

test('footnotes number like the class does and stop when the count is unknown', () => {
  const at = (source: string) =>
    [...latexNumbering(parseLatex(source))!.footnotes.values()];
  const pre = '\\documentclass{report}\n\\begin{document}\n';
  expect(at(pre + 'A\\footnote{a} B\\footnote{b}\n\\chapter{Two}\nC\\footnote{c}\n\\end{document}')).toEqual(
    ['1', '2', '1'],
  );
  expect(
    at(pre + 'A\\footnote{a}\n\n\\begin{figure}\\caption{x\\footnotemark}\\end{figure}\n\nB\\footnote{b}\n\\end{document}'),
  ).toEqual(['1']);
});

test('footnotes take room from the page of their mark', () => {
  const line = (top: number, notes?: number[]) => ({ position: top, top, bottom: top + 10, notes });
  // Three lines fit a 40-high body, but a 12-high footnote on the second pushes the third over.
  const result = paginateLatex([line(0), line(10, [12]), line(20)], 40, 5, 2);
  expect(result.breaks.map((item) => item.position)).toEqual([20]);
  expect(result.footnotes).toEqual([0]);
  expect(result.footHeights).toEqual([14, 0]);
  // A mark whose note no longer fits moves to the next page with its note.
  const moved = paginateLatex([line(0), line(10), line(20, [8])], 30, 5);
  expect(moved.footnotes).toEqual([1]);
});
