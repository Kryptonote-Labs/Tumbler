import { expect, test } from 'bun:test';
import { latexTableGrid, readLatexTabular, setLatexTableCell, latexFlow, latexNumbering, latexPageLabel, latexPageLayout, latexPageNumbers, paginateLatex, parseLatex, serializeLatex } from '../src/latex';

test('document driver options select physical media without moving the class text block', () => {
  const base = String.raw`\documentclass[letterpaper]{article}`;
  const options = { defaultPaper: 'a4paper' } as const;
  const plain = latexPageLayout(base, options);
  for (const name of ['graphicx', 'xcolor', 'hyperref', 'pgfplots', 'tcolorbox', 'siunitx']) {
    const paper = latexPageLayout(base + '\\usepackage{' + name + '}', options);
    expect([paper.width, paper.height]).toEqual([816, 1056]);
    expect(paper.width - paper.left - paper.right).toBeCloseTo(plain.width - plain.left - plain.right, 6);
  }
  for (const source of [String.raw`\usepackage[nosetpagesize]{graphicx}`, String.raw`\usepackage[setpagesize=false]{hyperref}`, '% ' + String.raw`\usepackage{graphicx}`]) {
    expect(latexPageLayout(base + '\n' + source, options).width).toBe(plain.width);
  }
});

test('an openany book places front matter and restarts Arabic folios after the recto break', () => {
  const source = String.raw`\documentclass[openany]{book}
\begin{document}
\frontmatter
\maketitle
\chapter*{Preface}
Preface text.
\tableofcontents
\mainmatter
\chapter{Method}\label{ch:m}
Method text.
\chapter{Evidence}
Details.
\appendix
\chapter{Form}
See Chapter~\ref{ch:m}.
\backmatter
\chapter{Thanks}
Thanks to the reviewers.
\end{document}`;
  const document = parseLatex(source);
  expect(serializeLatex(document)).toBe(source);
  const flow = latexFlow(document);
  const blocks: Parameters<typeof paginateLatex>[0] = [];
  document.forEach((_node, position, index) => blocks.push({
    position, top: index * 24, bottom: index * 24 + 20, flow: flow.get(position),
  }));
  const result = paginateLatex(blocks, 710, 305);
  const starts: number[] = [];
  result.breakSlots.forEach((page, index) => {
    while (starts.length < page) starts.push(result.breaks[index]!.position);
  });
  expect(latexPageNumbers(flow, starts).map(page => page.visible ? latexPageLabel(page) : '')).toEqual(['','ii','iii','iv','1','2','3','4']);
  const numbering = latexNumbering(document);
  expect(numbering?.labels.get('ch:m')).toBe('1');
  expect([...numbering!.headings.values()].map(heading => heading.number)).toEqual(['1','2','A','']);
});

test('a letter body is editable and its envelopes stay in the original source', () => {
  const source = String.raw`\documentclass{letter}
\address{18 Pine Street\\Facilities Office}
\begin{document}
\signature{Marta Silva}
\begin{letter}{Residents of the East Wing}
\opening{Dear residents,}
The laundry room is closed.
\closing{Sincerely,}
\end{letter}
\end{document}`;
  const document = parseLatex(source);
  const letter = document.lastChild!;
  expect(letter.type.name).toBe('latex_container');
  expect(letter.child(1).textContent).toBe('The laundry room is closed.');
  expect(serializeLatex(document)).toBe(source);
});

test('merged table cells keep authored targets and partial rules stay in the unspanned columns', () => {
  const source = String.raw`\begin{tabular}{|l|l|p{55mm}|}
  \hline
  Zone & Deadline & Task \\ \hline
  \multirow{2}{*}{Bench} & 10:00 & Replace the bit. \\ \cline{2-3}
  & 12:00 & Check small clamps. \\ \hline
  \end{tabular}`;
  const table = readLatexTabular(source)!;
  const grid = latexTableGrid(table, 13)!;
  expect(grid[1]?.[0]).toMatchObject({ rows: 2, left: true, right: true });
  expect(grid[2]?.[0]).toBeNull();
  expect(grid[2]?.[1]).toMatchObject({ column: 1, ruleBefore: true });
  expect(grid[2]?.[2]?.width).toBeCloseTo(55 * 96 / 25.4, 6);
  expect(setLatexTableCell(source, 1, 0, 'Workshop', false)).toBe(source.replace('{Bench}', '{Workshop}'));
});
