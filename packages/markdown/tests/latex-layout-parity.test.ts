import { expect, test } from 'bun:test';
import {
  latexListOptions,
  latexMathMacros,
  latexNumbering,
  latexTableGrid,
  paginateLatex,
  parseLatex,
  readLatexBibliography,
  readLatexTabular,
  serializeLatex,
} from '../src/latex';

test('equation counters follow their declared section and math operators remain available', () => {
  const source = String.raw`\documentclass{article}
\usepackage{amsmath}
\numberwithin{equation}{section}
\DeclareMathOperator*{\argmin}{arg\,min}
\begin{document}
\section{First}
\begin{equation}x=1\label{first}\end{equation}
\subsection{Same counter}
\begin{equation}x=2\end{equation}
\section{Second}
\begin{align}x&=3\label{second}\\y&=4\notag\end{align}
\end{document}`;
  const document = parseLatex(source);
  const numbering = latexNumbering(document);
  expect(numbering && [...numbering.equations.values()]).toEqual([['1.1'], ['1.2'], ['2.1', null]]);
  expect(numbering?.labels.get('second')).toBe('2.1');
  expect(latexMathMacros(document.attrs.prefix)['\\argmin']).toBe(String.raw`\operatorname*{arg\,min}`);
  expect(serializeLatex(document)).toBe(source);
});

test('an enumitem workflow keeps its authored label and lengths as an editable list', () => {
  const source = String.raw`\documentclass{article}
\usepackage{enumitem}
\begin{document}
\begin{enumerate}[label=\textbf{\arabic*.},leftmargin=2.2em,itemsep=2pt]
\item Scale the problem.
\item Choose the penalty.
\end{enumerate}
\end{document}`;
  const document = parseLatex(source);
  expect(document.firstChild?.type.name).toBe('ordered_list');
  expect(latexListOptions(String(document.firstChild?.attrs.open))).toMatchObject({
    label: { before: '', counter: 'arabic', after: '.', bold: true },
    leftMargin: '2.2em',
    itemSeparation: '2pt',
  });
  expect(serializeLatex(document)).toBe(source);
});

test('relative paragraph columns keep their declarations and local separation', () => {
  const source = String.raw`\begin{table}[htbp]
\setlength{\tabcolsep}{4pt}
\begin{tabular}{>{\raggedright\arraybackslash}p{0.2\linewidth}>{\centering\arraybackslash}p{0.3\textwidth}}
Method & Result \\
\end{tabular}
\end{table}`;
  const table = readLatexTabular(source);
  expect(table?.spec.columnSeparation).toBe('4pt');
  const [row] = table ? latexTableGrid(table, 10, {line: 400, text: 800}) ?? [] : [];
  expect(row?.map((cell) => [cell?.width, cell?.align])).toEqual([[80, 'left'], [240, 'center']]);
});

test('an authored reference list resolves ordinal and explicit bibitem labels', () => {
  const reference = readLatexBibliography(String.raw`\begin{thebibliography}{99}
\bibitem{one}A. Author, \emph{First book}.
% \bibitem{ignore}
\bibitem[Two]{two}B. Author, Second book.
\end{thebibliography}`);
  expect(reference?.widestLabel).toBe('99');
  expect(reference?.entries.map(({ key, label }) => [key, label])).toEqual([['one', '1'], ['two', 'Two']]);
  expect(reference?.entries[0]?.source).toContain(String.raw`\emph{First book}`);
});

test('an alignment can continue at its next row without moving its first row', () => {
  const plan = paginateLatex([
    { position: 0, top: 0, bottom: 73 },
    { position: 5, top: 78, bottom: 118, preferFragments: true, split: () => [
      { position: 5, top: 78, bottom: 98 },
      { position: 5, top: 98, bottom: 118, continuation: { fragment: 1, startHeight: 0 } },
    ] },
  ], 100, 25);
  expect(plan.pages).toBe(2);
  expect(plan.breaks).toEqual([{ position: 5, height: 27, fragment: 1 }]);
});

test('a deferred single-column float reserves room only on its destination sheet', () => {
  const plan = paginateLatex([
    { position: 0, top: 0, bottom: 95 },
    { position: 1, top: 0, bottom: 40, flow: { kind: 'content', wideFloat: true } },
    { position: 2, top: 98, bottom: 160 },
    { position: 3, top: 165, bottom: 260 },
  ], 150, 30);
  expect(plan.wideFloats).toEqual([{ position: 1, sheet: 1, offset: 0, height: 40 }]);
  const span = plan.floatSpans.get(1);
  expect(span).toBeGreaterThan(40);
  if (span === undefined) throw new Error('Missing float reservation');
  expect(plan.breaks.map((item) => item.position)).toEqual([2, 3]);
  expect(98 + plan.breaks[0]!.height).toBeCloseTo(180 + span);
  expect(165 + plan.breaks[0]!.height + plan.breaks[1]!.height).toBeCloseTo(360);
});

test('a page shrinks only the display glue used by its content', () => {
  const plan = paginateLatex([
    { position: 0, top: 0, bottom: 70 },
    { position: 1, top: 82, bottom: 92, shrinkBefore: 6, shrinkAfter: 6 },
    { position: 2, top: 104, bottom: 110 },
    { position: 3, top: 120, bottom: 170 },
  ], 100, 25);
  expect(plan.breaks).toEqual([{ position: 3, height: 15 }]);
  expect(plan.shrinkages.get(1)).toEqual({ before: 5, after: 5 });
});
