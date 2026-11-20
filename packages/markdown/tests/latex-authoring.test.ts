import { expect, test } from 'bun:test';
import { TextSelection, type EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { latexNumberSpec, noteState } from '../src/editor';
import {
  blankLatex,
  latexFieldSource,
  latexFieldText,
  latexNumbering,
  latexPageLayout,
  latexPreambleCommand,
  parseLatex,
  serializeLatex,
  setLatexPreambleCommand,
} from '../src/latex';

test('title fields round trip text, keep expert TeX and edit brace-bearing values', () => {
  for (const text of ['Q3 R&D Plan', '50% of $5 #1 a_b', 'x^2', 'Dr.~Smith \\and Ada', '\\today'])
    expect(latexFieldText(latexFieldSource(text))).toBe(text);
  expect(latexFieldSource('Q3 R&D Plan')).toBe('Q3 R\\&D Plan');
  expect(latexFieldSource('Ends with \\')).toBe('Ends with \\textbackslash{}');
  expect(() => latexFieldSource('Open {brace')).toThrow('braces');
  // Math and other TeX that text would escape are edited as TeX instead.
  expect(latexFieldText('On $x^2$ and \\textbf{y}')).toBeUndefined();
  expect(latexFieldText('Notes \\thanks{Funded by {NSF}}')).toBe('Notes \\thanks{Funded by {NSF}}');

  const prefix = String.raw`\documentclass{article}
% \title{Commented}
\newcommand{\draft}{\title{Inside a macro}}
\title{First}
\title{Energy \thanks{Funded by {NSF}}}
\begin{document}`;
  const title = latexPreambleCommand(prefix, 'title');
  expect(title).toMatchObject({
    source: 'Energy \\thanks{Funded by {NSF}}',
    line: 5,
  });
  expect(latexPreambleCommand(prefix, 'author')).toBeUndefined();
  const updated = setLatexPreambleCommand(prefix, 'title', latexFieldSource('R&D'));
  expect(updated).toBe(prefix.replace('Energy \\thanks{Funded by {NSF}}', 'R\\&D'));
  expect(setLatexPreambleCommand(updated, 'date', '\\today')).toBe(
    updated.replace('\\begin{document}', '\\date{\\today}\n\\begin{document}'),
  );
  expect(() => setLatexPreambleCommand('Body only', 'title', 'X')).toThrow('no preamble');
});

test('numbering follows the standard classes and resolves labels to printed numbers', () => {
  const article = parseLatex(String.raw`\documentclass{article}
\begin{document}
\section{Intro}\label{sec:intro}
\begin{equation}E=mc^2\label{eq:energy}\end{equation}
\section*{Aside}
\subsection{Detail}
\begin{align}a&=b\label{eq:a}\\c&=d\nonumber\\e&=f\tag{*}\\\end{align}
\begin{figure}\centering\caption{Plot}\label{fig:plot}\end{figure}
\begin{table}\caption{Data}\label{tab:data}\end{table}
\appendix
\section{Proofs}\label{sec:proofs}
\end{document}`);
  const numbers = latexNumbering(article)!;
  expect([...numbers.headings.values()].map(({ number }) => number)).toEqual(['1', '1.1', 'A']);
  expect([...numbers.equations.values()]).toEqual([['1'], ['2', null, '*']]);
  expect([...numbers.floats.values()]).toEqual([
    { kind: 'figure', number: '1' },
    { kind: 'table', number: '1' },
  ]);
  expect(Object.fromEntries(numbers.labels)).toEqual({
    'sec:intro': '1',
    'eq:energy': '1',
    'eq:a': '2',
    'fig:plot': '1',
    'tab:data': '1',
    'sec:proofs': 'A',
  });

  const report = latexNumbering(
    parseLatex(String.raw`\documentclass{report}
\begin{document}
\chapter{One}\section{A}\begin{equation}x\end{equation}
\chapter{Two}\section{B}\begin{equation}y\end{equation}
\end{document}`),
  )!;
  expect([...report.headings.values()].map(({ number }) => number)).toEqual([
    '1',
    '1.1',
    '2',
    '2.1',
  ]);
  expect([...report.equations.values()]).toEqual([['1.1'], ['2.1']]);

  // Counter changes the editor does not model show no number rather than a wrong one.
  expect(
    latexNumbering(
      parseLatex(
        '\\documentclass{article}\n\\begin{document}\n\\setcounter{section}{4}\n\\section{X}\n\\end{document}',
      ),
    ),
  ).toBeUndefined();
  expect(
    latexNumbering(parseLatex('\\documentclass{beamer}\n\\begin{document}\nX\n\\end{document}')),
  ).toBeUndefined();
});

test('new documents use spaced, unindented paragraphs and parskip is understood', () => {
  const pixelsPerPoint = 96 / 72.27;
  const blank = latexPageLayout(parseLatex(blankLatex).attrs.prefix);
  // Plain lengths, so the file compiles without the optional parskip package.
  expect(blankLatex).toContain('\\setlength{\\parskip}{0.5\\baselineskip plus 2pt}');
  expect(blank.paragraphIndent).toBe(0);
  expect(blank.paragraphSpacing).toBeCloseTo(blank.leading / 2);
  const options = latexPageLayout('\\usepackage[skip=10pt,indent]{parskip}');
  expect(options.paragraphSpacing).toBeCloseTo(10 * pixelsPerPoint);
  expect(options.paragraphIndent).toBeCloseTo(10 * pixelsPerPoint);
  const later = latexPageLayout(
    '\\usepackage{parskip}\n\\setlength{\\parindent}{1.5em}\n\\setlength{\\parskip}{0.25\\baselineskip}',
  );
  expect(later.paragraphIndent).toBeCloseTo(15 * pixelsPerPoint);
  expect(later.paragraphSpacing).toBeCloseTo(later.leading / 4);
});

test('typing dollars keeps currency as text and turns delimited formulas into math', () => {
  const typed = (text: string) => {
    let state: EditorState = noteState('', 0, 'typing', parseLatex(blankLatex));
    state = state.apply(state.tr.setSelection(TextSelection.atStart(state.doc)));
    const view = {
      get state() {
        return state;
      },
      composing: false,
      someProp<T>(name: 'handleTextInput', apply: (handle: never) => T) {
        for (const plugin of state.plugins) {
          const handle = plugin.props[name];
          const result = handle && apply(handle.bind(plugin) as never);
          if (result) return result;
        }
      },
      dispatch: (tr: Parameters<EditorState['apply']>[0]) => {
        state = state.apply(tr);
      },
    } as unknown as EditorView;
    for (const character of text) {
      const { from, to } = state.selection;
      const handled = view.someProp('handleTextInput', (handle) =>
        handle(view, from, to, character, () => state.tr.insertText(character, from, to)),
      );
      if (!handled) view.dispatch(state.tr.insertText(character, from, to));
    }
    return serializeLatex(state.doc).split('\\begin{document}\n')[1]!.split('\n\\end')[0];
  };
  expect(typed('costs $5 and $10 ')).toBe('costs \\$5 and \\$10 ');
  expect(typed('from $5-$')).toBe('from \\$5-\\$');
  expect(typed('area $x^2$')).toBe('area $x^2$');
  expect(typed('price $5, then \\alpha x')).toBe('price \\$5, then \\(\\alpha\\) x');
  // Browsers type a trailing space as U+00A0 in collapsed whitespace. Shortcuts still see a
  // space, and the source always contains an ordinary space.
  expect(typed('Ratio \\alpha\u00a0')).toBe('Ratio \\(\\alpha\\) ');
  expect(typed('Ratio \\alpha\u00a0x')).toBe('Ratio \\(\\alpha\\) x');
  expect(typed('one\u00a0two\u00a0')).toBe('one two ');
});

test('the editor decorates numbered equations, floats and resolvable references', () => {
  const state = noteState(
    '',
    0,
    'numbers',
    parseLatex(String.raw`\documentclass{article}
\begin{document}
\section{Intro}
\begin{equation}x\label{eq:x}\end{equation}
See \eqref{eq:x}, \ref{missing} and \ref{eq:x}.
\end{document}`),
  );
  const decorations = state.plugins
    .map((plugin) => plugin.props.decorations?.call(plugin, state))
    .find(Boolean)!;
  const specs = decorations.find().map((decoration) => latexNumberSpec([decoration]));
  expect(specs.filter(Boolean)).toEqual([
    { latexEquation: ['1'] },
    { latexReference: '(1)' },
    { latexReference: undefined },
    { latexReference: '1' },
  ]);
});

test('a standalone heading label takes no paragraph space, without hiding text beside a label', () => {
  const source = String.raw`\documentclass{article}
\begin{document}
\section{First}\label{sec:first}

\section{Second}\label{sec:second}Visible prose.
\end{document}`;
  const state = noteState('', 0, 'labels', parseLatex(source));
  const decorations = state.plugins
    .map((plugin) => plugin.props.decorations?.call(plugin, state))
    .find(Boolean)!;
  const blocks = decorations.find().filter(({ from, to }) => from < to);
  expect(blocks.map(({ from }) => state.doc.nodeAt(from)?.firstChild?.attrs.source)).toEqual([
    '\\label{sec:first}',
  ]);
  expect(serializeLatex(state.doc)).toBe(source);
});
