import { expect, test } from 'bun:test';
import {
  latexFlow,
  latexNumbering,
  latexPageNumbers,
  paginateLatex,
  parseLatex,
  readLatexTableBlock,
  serializeLatex,
  setLatexTableCell,
  type PageBlock,
} from '../src/latex';

test('standard class breaks place visible content and share the explicit page flow', () => {
  const source = String.raw`% \documentclass{article}
\documentclass[openany]{book}
\begin{document}
\maketitle
\tableofcontents
\chapter{Scope}
First chapter.
\clearpage
\chapter*{Findings}
Second chapter.
\end{document}`;
  const document = parseLatex(source);
  const flow = latexFlow(document);
  const blocks: PageBlock[] = [];
  document.forEach((node, position, index) => {
    const top = index * 10;
    blocks.push({ position, top, bottom: top + 10, flow: flow.get(position) });
  });
  const { breaks, pages } = paginateLatex(blocks, 100, 20);
  expect(pages).toBe(4);
  expect(breaks.map(({ position }) => document.nodeAt(position)?.textContent)).toEqual([
    '\\tableofcontents',
    'Scope',
    'Findings',
  ]);
  expect(serializeLatex(document)).toBe(source);
});

test('a one-sided report title takes a sheet without shifting printed page numbers', () => {
  const doc = parseLatex(
    '\\documentclass{report}\n\\begin{document}\n\\maketitle\n\\chapter{Scope}\n\\end{document}',
  );
  expect(latexPageNumbers(latexFlow(doc), [doc.child(0).nodeSize])).toEqual([
    { number: 1, visible: false },
    { number: 1, visible: true },
  ]);
});

test('a two-sided book opens chapters on right-hand pages', () => {
  const document = parseLatex(String.raw`\documentclass{book}
\begin{document}
\chapter{Scope}
\chapter{Findings}
\end{document}`);
  const flow = latexFlow(document);
  const blocks: PageBlock[] = [];
  document.forEach((_, position, index) =>
    blocks.push({
      position,
      top: index * 20,
      bottom: (index + 1) * 20,
      flow: flow.get(position),
    }),
  );
  expect(paginateLatex(blocks, 100, 20)).toMatchObject({ pages: 3, breakSlots: [2] });
});

test('a continuing table keeps distinct section roles and changes only the selected source cell', () => {
  const source = String.raw`\begin{longtable}{@{}lr@{}}
\caption{Loans}\label{tab:loans}\\
\toprule Item & Count \\\midrule
\endfirsthead
\multicolumn{2}{l}{Loans continued}\\
\endhead
\multicolumn{2}{r}{Continued on next page}\\
\endfoot
\bottomrule
\endlastfoot
Camera & 5 \\
Recorder & 3 \\
\end{longtable}`;
  const table = readLatexTableBlock(source);
  expect(table?.layout).toMatchObject({
    kind: 'continuing',
    sections: {
      firstHead: { rows: [0] },
      head: { rows: [1] },
      foot: { rows: [2] },
      lastFoot: { rows: [], tail: '\n\\bottomrule\n' },
      body: { rows: [3, 4] },
    },
  });
  expect(setLatexTableCell(source, 4, 1, '7', false)).toBe(
    source.replace('Recorder & 3', 'Recorder & 7'),
  );
  const document = parseLatex(source);
  expect(latexNumbering(document)?.labels.get('tab:loans')).toBe('1');
  expect(serializeLatex(document)).toBe(source);
});

test('internal anchors fit repeated content on the next page without changing the source position', () => {
  const lines = Array.from({ length: 7 }, (_, index) => ({
    position: 4,
    top: index * 20,
    bottom: (index + 1) * 20,
    ...(index ? { continuation: { fragment: index, startHeight: 10 } } : {}),
    ...(index < 6 ? { reserveAfter: 5 } : {}),
  }));
  const result = paginateLatex([{ position: 4, top: 0, bottom: 140, split: () => lines }], 65, 15);
  expect(result.breaks).toEqual([
    { position: 4, fragment: 3, height: 30 },
    { position: 4, fragment: 5, height: 40 },
  ]);
  expect(result.pages).toBe(3);
});

test('explicit title and blank pages preserve the front-matter and chapter folios', () => {
  const source = String.raw`\documentclass{report}
\setcounter{secnumdepth}{2}
\newcommand{\thesisline}[1]{#1}
\begin{document}
\begin{titlepage}Cover\end{titlepage}
\thispagestyle{empty}\null\newpage
\pagenumbering{roman}
\chapter*{Abstract}
Summary.
\newpage
\null\newpage
\pagenumbering{arabic}
\chapter{Introduction}
\section{Motivation}
\end{document}`;
  const document = parseLatex(source);
  const flow = latexFlow(document);
  const blocks: PageBlock[] = [];
  document.forEach((_node, position, index) => {
    const top = index * 5;
    blocks.push({ position, top, bottom: top + 5, flow: flow.get(position) });
  });
  const { breaks } = paginateLatex(blocks, 100, 20);
  expect(latexPageNumbers(flow, breaks.map(({ position }) => position))).toEqual([
    { number: 1, visible: false },
    { number: 1, visible: false },
    { number: 1, style: 'roman', visible: true },
    { number: 2, style: 'roman', visible: true },
    { number: 1, visible: true },
  ]);
  expect([...latexNumbering(document)!.headings.values()].map(({ number }) => number)).toEqual(['1', '1.1']);
  expect(serializeLatex(document)).toBe(source);
});

test('adjacent custom dotted contents entries stay together as an editable source block', () => {
  const source = String.raw`\documentclass{report}
\makeatletter
\newcommand{\chapentry}[2]{\@dottedtocline{0}{0em}{1em}{#1}{#2}}
\newcommand{\secentry}[2]{\@dottedtocline{1}{1em}{2em}{#1}{#2}}
\makeatother
\begin{document}
\chapter*{Contents}
\chapentry{Introduction}{1}
\secentry{A nested {title}}{2}
\newpage
Ordinary body.
\end{document}`;
  const document = parseLatex(source);
  expect(document.child(1).type.name).toBe('latex_raw');
  expect(document.child(1).textContent).toBe(
    '\\chapentry{Introduction}{1}\n\\secentry{A nested {title}}{2}',
  );
  expect(serializeLatex(document)).toBe(source);
});

test('page directives after a split paragraph affect the sheet where they occur', () => {
  const source = String.raw`\begin{document}
A paragraph across two pages.
\pagenumbering{roman}
\thispagestyle{empty}
\newpage
The next page.
\end{document}`;
  const document = parseLatex(source);
  const nextPage = document.content.size - document.lastChild!.nodeSize;
  expect(latexPageNumbers(latexFlow(document), [8, nextPage])).toEqual([
    { number: 1, visible: true },
    { number: 1, style: 'roman', visible: false },
    { number: 2, style: 'roman', visible: true },
  ]);
});

test('only supported section-depth assignments affect heading numbers', () => {
  const source = String.raw`\documentclass{report}
\setcounter{secnumdepth}{-2}
% \setcounter{secnumdepth}{3}
\begin{document}
\part{One}
% \setcounter{secnumdepth}{3}
\chapter{Two}
\end{document}`;
  expect(latexNumbering(parseLatex(source))?.headings.size).toBe(0);
  expect(latexNumbering(parseLatex(source.replace('\\chapter{Two}', '\\setcounter{secnumdepth}{2}\\chapter{Two}')))).toBeUndefined();
});

test('custom theorem counter formats keep numbering opaque', () => {
  const source = String.raw`\documentclass{article}
\newtheorem{theorem}{Theorem}
\renewcommand{\thetheorem}{A}
\begin{document}
\begin{theorem}Statement.\end{theorem}
\end{document}`;
  expect(latexNumbering(parseLatex(source))).toBeUndefined();
});

test('inline page directives keep surrounding prose in one paragraph', () => {
  const source = String.raw`\begin{document}
Before
\thispagestyle{empty}
and \null\textbf{after}.
\end{document}`;
  const document = parseLatex(source);
  expect(document.childCount).toBe(1);
  expect(latexPageNumbers(latexFlow(document), [])).toEqual([{ number: 1, visible: false }]);
  expect(serializeLatex(document)).toBe(source);
});
