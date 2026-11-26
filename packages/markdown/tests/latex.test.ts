import { expect, test } from 'bun:test';
import { Fragment, Slice } from 'prosemirror-model';
import { TextSelection } from 'prosemirror-state';
import { Step } from 'prosemirror-transform';
import { noteSchema } from '../src';
import { noteState, receiveTransaction, sendableSteps, toggleLatexStyle, undo } from '../src/editor';
import {
  latexBlockAtOffset,
  latexNumbering,
  latexRunningFields,
  latexSourceMap,
  paginateLatex,
  parseLatex,
  replaceLatexSource,
  serializeLatex,
  updateLatexNodeSource,
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
  expect(document.firstChild?.textContent).toBe('Energy');
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

test('a paragraph inserted after a block stays apart from the paragraph that followed it', () => {
  for (const separator of ['\n', '']) {
    const document = parseLatex(`\\begin{center}\nBox\n\\end{center}${separator}Tail.`);
    const tail = document.content.size - document.lastChild!.nodeSize;
    const paragraph = noteSchema.nodes.paragraph!.create(null, noteSchema.text('New'));
    const edited = document.replace(tail, tail, new Slice(Fragment.from(paragraph), 0, 0));
    const source = serializeLatex(edited);
    expect(source).toEndWith('New\n\nTail.');
    expect(parseLatex(source).childCount).toBe(edited.childCount);
    // Source navigation agrees with the serialized spacing.
    const map = latexSourceMap(edited);
    const position = tail + paragraph.nodeSize + 1;
    expect(map.sourceAt(position)?.offset).toBe(source.indexOf('Tail.'));
    expect(map.positionAt({ offset: source.indexOf('Tail.') })).toBe(position);
  }
});

test('authored paragraph boundaries round-trip unchanged', () => {
  for (const source of [
    '{\\raggedleft First.\\par}\nSecond.',
    'First % note\n\nSecond.',
    'Use \\verb|100%|\\begin{math}x\\end{math}',
    '\\begin{quote}\nBox % note\n\\end{quote}{\\sffamily Tail.\\par}',
    String.raw`\documentclass{report}
\makeatletter
\newcommand{\chapentry}[2]{\@dottedtocline{0}{0em}{1em}{#1}{#2}}
\makeatother
\begin{document}
\chapentry{Introduction}
  {12}
\end{document}`,
  ]) expect(serializeLatex(parseLatex(source))).toBe(source);
  expect(parseLatex('First % note\n\nSecond.').childCount).toBe(2);
  expect(serializeLatex(parseLatex('First. \\section X'))).toBe('First. \\section X');
  const macro = '\\documentclass{article}\n\\newcommand{\\bibfiles}{references}\n\\begin{document}\nFirst. \\bibliography\\bibfiles\n\\end{document}';
  expect(serializeLatex(parseLatex(macro))).toBe(macro);
});

test('a paragraph inserted after a heading stays apart across a comment or spacing line', () => {
  for (const between of ['% Note\n', '\n\\vspace{1em}\n']) {
    const document = parseLatex(`\\section{Intro}${between}Tail.`);
    const after = document.firstChild!.nodeSize;
    const paragraph = noteSchema.nodes.paragraph!.create(null, noteSchema.text('New.'));
    const edited = document.replace(after, after, new Slice(Fragment.from(paragraph), 0, 0));
    const reparsed = parseLatex(serializeLatex(edited));
    expect(reparsed.childCount).toBe(edited.childCount);
    expect(reparsed.lastChild!.textContent).toBe('Tail.');
  }
});

test('a paragraph inserted with a trailing comment ends its line before a same-line block', () => {
  const document = parseLatex('\\begin{center}\nBox\n\\end{center}{\\raggedleft Tail.\\par}');
  const tail = document.content.size - document.lastChild!.nodeSize;
  const paragraph = noteSchema.nodes.paragraph!.create(null, parseLatex('New % note').firstChild!.content);
  const edited = document.replace(tail, tail, new Slice(Fragment.from(paragraph), 0, 0));
  expect(parseLatex(serializeLatex(edited)).childCount).toBe(edited.childCount);
});

test('a paragraph inserted with a trailing comment ends its line before display math', () => {
  const document = parseLatex('\\section{Intro}\\[x\\]');
  const at = document.firstChild!.nodeSize;
  const paragraph = noteSchema.nodes.paragraph!.create(null, parseLatex('New % note').firstChild!.content);
  const edited = document.replace(at, at, new Slice(Fragment.from(paragraph), 0, 0));
  expect(parseLatex(serializeLatex(edited)).childCount).toBe(edited.childCount);
});

test('a pasted paragraph ending in a comment keeps a following equation visible', () => {
  const document = parseLatex('\\section{Intro}\\[x\\]');
  const pasted = parseLatex('New % note').firstChild!;
  const edited = document.replace(0, document.firstChild!.nodeSize, new Slice(Fragment.from(pasted), 0, 0));
  expect(serializeLatex(edited)).toBe('New % note\n\\[x\\]');
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

test('source edits retain the positions of headings saved by earlier editors', () => {
  const source = String.raw`\section{Before}

Body.

\section{After}`;
  const parsed = parseLatex(source);
  const legacy = noteSchema.nodeFromJSON({
    ...parsed.toJSON(),
    content: [
      { ...parsed.child(0).toJSON(), type: 'heading' },
      parsed.child(1).toJSON(),
      { ...parsed.child(2).toJSON(), type: 'heading' },
    ],
  });
  legacy.check();
  expect(serializeLatex(legacy)).toBe(source);
  expect(latexNumbering(legacy)?.headings.size).toBe(2);
  expect(replaceLatexSource(legacy, source).steps).toHaveLength(0);

  const next = source.replace('Body.', 'Body edited.');
  const edit = replaceLatexSource(legacy, next);
  expect(edit.mapping.map(3)).toBe(3);
  expect(edit.mapping.map(legacy.content.size - 3)).toBe(edit.doc.content.size - 3);
  edit.doc.check();
  expect(serializeLatex(edit.doc)).toBe(next);
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
  expect(pastedLatexText('Pay $12 and get $x$.')).toBe('Pay \\$12 and get $x$.');
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

test('simultaneous edits to separate cells survive collaboration and undo', () => {
  const source = String.raw`\begin{table}\begin{tabular}{ll} A & B \\ \end{tabular}\end{table}`;
  const document = parseLatex(source);
  let left = noteState('', 0, 'left', document);
  let right = noteState('', 0, 'right', document);
  const sourceEdit = replaceLatexSource(document, source.replace(' A &', ' Left &'));
  const leftEdit = left.tr;
  for (const step of sourceEdit.steps) leftEdit.step(step);
  left = left.apply(leftEdit);
  right = right.apply(updateLatexNodeSource(right.tr, 0, source.replace('& B ', '& Right ')));
  const remote = sendableSteps(left)!;
  const steps = remote.steps.map((step) => Step.fromJSON(document.type.schema, step.toJSON()));
  right = right.apply(receiveTransaction(right, steps, ['left']));
  expect(serializeLatex(right.doc)).toContain('Left & Right');
  undo(right, (transaction) => { right = right.apply(transaction); });
  expect(serializeLatex(right.doc)).toContain('Left & B');
});

test('a formatting alias stays editable and keeps the authored macro call', () => {
  const source = String.raw`\documentclass{article}
\newcommand{\queue}[1]{\textsf{#1}}
\newcommand{\stage}[1]{\queue{#1}}
\begin{document}
\stage{Incoming}
\end{document}`;
  const document = parseLatex(source);
  expect(document.firstChild?.firstChild?.text).toBe('Incoming');
  expect(document.firstChild?.firstChild?.marks[0]?.attrs.style).toBe('sans');
  const state = noteState('', 0, 'test', document);
  expect(serializeLatex(state.tr.insertText('Ready', 1, 9).doc)).toBe(source.replace('Incoming', 'Ready'));
});

test('formatting scopes expose their text and tables without rewriting their source', () => {
  const source = String.raw`\vspace*{5mm}
{\fontsize{34}{39}\selectfont\bfseries Heading\par}

{\small
\begin{tabularx}{\linewidth}{XX}
One & Two\\
\end{tabularx}
}`;
  const document = parseLatex(source);
  document.check();
  expect(document.child(1).textContent).toBe('Heading');
  const table = document.child(2).firstChild;
  expect(table?.attrs.source).toContain('One & Two');
  expect(serializeLatex(document)).toBe(source);
  const position = document.child(0).nodeSize + 2;
  const state = noteState('', 0, 'test', document);
  const edited = state.apply(state.tr.insertText('Title', position, position + 'Heading'.length));
  expect(serializeLatex(edited.doc)).toBe(source.replace('Heading', 'Title'));
});

test('vertical space inside a paragraph does not split its text', () => {
  const source = String.raw`Before\vspace{2pt} after.

\vspace{3pt}
Next paragraph.`;
  const document = parseLatex(source);
  expect(Array.from({ length: document.childCount }, (_, index) => document.child(index).type.name))
    .toEqual(['paragraph', 'latex_raw', 'paragraph']);
  expect(serializeLatex(document)).toBe(source);
});

test('a local declaration on its own source line can stay in a paragraph', () => {
  for (const before of ['', 'Before.\n']) {
    const source = before + String.raw`{\small Small text}` + '\nAfter.';
    const document = parseLatex(source);
    expect(document.childCount).toBe(1);
    expect(document.firstChild?.type.name).toBe('paragraph');
    expect(serializeLatex(document)).toBe(source);
  }
});

test('an explicit center footer replaces the default folio, even when empty', () => {
  for (const content of ['', String.raw`Report \thepage`]) {
    const prefix = String.raw`\pagestyle{fancy}\fancyfoot[C]{${content}}`;
    expect(latexRunningFields(prefix)?.clearDefault).toBe(true);
  }
  expect(latexRunningFields(String.raw`\pagestyle{fancy}\fancyfoot[R]{Report}`)?.clearDefault)
    .toBe(false);
});

test('fancy running fields ignore comments and apply resets in source order', () => {
  expect(latexRunningFields(String.raw`\pagestyle{fancy}
% \fancyfoot[C]{} \fancyhf{}
% \renewcommand{\headrulewidth}{0pt}
\fancyfoot[R]{Right}`)).toMatchObject({
    clearDefault: false,
    fields: [{ area: 'foot', slot: 'R', source: 'Right' }],
  });
  expect(latexRunningFields(String.raw`\pagestyle{fancy}
\fancyhead[L]{Old header}
\fancyfoot[C]{Old footer}
\fancyhf{}
\fancyfoot[R]{New footer}`)).toMatchObject({
    clearDefault: true,
    fields: [{ area: 'foot', slot: 'R', source: 'New footer' }],
  });
});

test('an authored fancy style can replace its default fields', () => {
  expect(latexRunningFields(String.raw`\pagestyle{fancy}
\fancyhead[L]{Old header}
\fancypagestyle{fancy}{\fancyhf{}\fancyhead[L]{New header}}`)).toMatchObject({
    clearDefault: true,
    fields: [{ area: 'head', slot: 'L', source: 'New header' }],
  });
});
