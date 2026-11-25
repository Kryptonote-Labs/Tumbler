import { expect, test } from 'bun:test';
import {
  interpretLatexTitlePage,
  latexPageLayout,
  type LatexTitleItem,
  type LatexTitleRun,
} from '../src/latex';

// A report class that defines its own title page.
const report = String.raw`\documentclass[a4paper,12pt,twoside]{report}
\usepackage[left=2cm,right=2cm,top=2cm,bottom=3cm]{geometry}
\setlength{\parskip}{2ex plus 0.5ex minus 0.2ex}
\setlength{\parindent}{0pt}
\makeatletter
\linespread{1.5}
\def\submitdate#1{\gdef\@submitdate{#1}}
\def\maketitle{
  \begin{titlepage}{
    \Large Faculty of Letters \\
    School of Natural Sciences, Philosophy and Logic \\
    Division of Applied Theory
    \rm
    \vskip 3in
    \Large \bf \@title \par
  }
  \vskip 0.3in
  \par
  {\Large \@author}
  \vskip 4in
  \par
  Submitted for the degree of
  \linebreak
  the Diploma of the Faculty, \@submitdate
  \vfil
  \end{titlepage}
}
\def\titlepage{
  \newpage
  \centering
  \linespread{1}
  \normalsize
  \vbox to \vsize\bgroup\vbox to 9in\bgroup
}
\def\endtitlepage{
  \par
  \kern 0pt
  \egroup
  \vss
  \egroup
  \cleardoublepage
}
\makeatother
\begin{document}
`;

const fields = new Map([
  ['title', '\\LARGE {\\bf A Study of Paper Folding}\\\\\n \\vspace*{6mm}\n'],
  ['author', 'Kit Ashby'],
  ['submitdate', 'March 2031'],
] as const);

type Baseline = { text: string; y: number; runs: LatexTitleRun[] };

/** Baselines from the top of the text block, as TeX places them before fills stretch. */
function baselines(box: LatexTitleItem, top = 0): Baseline[] {
  if (box.kind !== 'box') return [];
  const result: Baseline[] = [];
  let y = top;
  for (const item of box.items) {
    y += item.before;
    if (item.kind === 'line')
      result.push({ text: item.runs.map((run) => run.text).join(''), y, runs: item.runs });
    if (item.kind === 'box') {
      result.push(...baselines(item, y));
      y += item.height ?? 0;
    }
  }
  return result;
}

test('a class title page is set where pdfTeX sets it, with fields in their printed style', () => {
  const page = interpretLatexTitlePage(report, latexPageLayout(report), fields);
  if (!page) throw new Error('expected an interpreted title page');
  const lines = baselines(page);
  expect(lines.map((line) => line.text)).toEqual([
    'Faculty of Letters',
    'School of Natural Sciences, Philosophy and Logic',
    'Division of Applied Theory',
    'A Study of Paper Folding',
    'Kit Ashby',
    'Submitted for the degree of',
    'the Diploma of the Faculty, March 2031',
  ]);
  // pdfTeX's baselines for this page, in CSS pixels from the top of the text block.
  const expected = [15.7, 44.9, 74.1, 407.6, 481.8, 897.6, 916.8];
  expect(lines.map((line, index) => Math.abs(line.y - expected[index]!) < 0.5)).not.toContain(false);

  const point = 96 / 72.27;
  const title = lines[3]!.runs[0]!;
  expect(title).toMatchObject({ field: 'title', style: { bold: true, size: 20.74 * point } });
  // The run is the authored text inside `{\bf …}`, so an edit keeps the TeX around it.
  expect(fields.get('title').slice(title.source!.from, title.source!.to)).toBe('A Study of Paper Folding');
  expect(lines[4]!.runs[0]).toMatchObject({ field: 'author', source: { from: 0, to: 9 } });
  expect(lines[6]!.runs.at(-1)).toMatchObject({ text: 'March 2031', field: 'submitdate' });
});

test('a title page with TeX the interpreter does not model is left to the compiler', () => {
  const source = report.replace('Division of Applied Theory', '\\hfill Division of Applied Theory');
  expect(interpretLatexTitlePage(source, latexPageLayout(source), fields)).toBeUndefined();
});
