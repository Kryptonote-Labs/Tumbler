import { expect, test } from 'bun:test';
import { composeLatexParagraph, latexInterwordGlue, measureLatexRoman, hyphenateLatexEnglish, latexTableGrid, readLatexTabular, setLatexTableCell, latexFlow, latexNumbering, latexPageLabel, latexPageLayout, latexSheetLayout, latexPageNumbers, paginateLatex, parseLatex, serializeLatex, layoutLatexDrawing, readLatexDrawing } from '../src/latex';

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

test('numbered theorem bodies and description items become native editable content', () => {
  const source = String.raw`\documentclass{article}
\usepackage{amsthm}
\newtheorem{lemma}{Lemma}[section]
\begin{document}
\section{Estimates}
\begin{lemma}
\label{lem:sample}The sample variance is positive.
\end{lemma}
\begin{description}
\item[Variance] Mean squared deviation.
\end{description}
\end{document}`;
  const doc = parseLatex(source);
  expect(serializeLatex(doc)).toBe(source);
  expect(doc.child(1).firstChild?.textContent).toContain('The sample variance');
  expect(doc.child(2).firstChild?.textContent).toBe('Mean squared deviation.');
  expect(latexNumbering(doc)?.labels.get('lem:sample')).toBe('1.1');
});

test('the column newsletter breaks the opening paragraph like pdfTeX with microtype', () => {
  const text = 'The temporary zebra crossing at King Street will remain until the curb extension is finished. A site walk is planned for 17 June.';
  const layout = latexPageLayout('\\documentclass[twocolumn]{article}\\usepackage{microtype}');
  const size = layout.typography!;
  const width = (layout.width - layout.left - layout.right - layout.columnGap) / 2;
  const glue = { space: size.space, stretch: size.spaceStretch, shrink: size.spaceShrink, extra: size.spaceExtra };
  expect(composeLatexParagraph(text, width, 0, {
    ...glue, expansion: size.expansion, gapAfter: word => latexInterwordGlue(word, glue),
    word: word => measureLatexRoman(word, size.romanFont!, size.text.size)!,
    hyphenate: hyphenateLatexEnglish,
  }).map(line => text.slice(line.from, line.to) + (line.hyphen ? '-' : ''))).toEqual([
    'The temporary zebra crossing at King Street will',
    'remain until the curb extension is finished. A site',
    'walk is planned for 17 June.',
  ]);
});


test('a two-sided book keeps its text measure with alternating binding margins', () => {
  const paper = latexPageLayout(String.raw`\documentclass{book}`);
  const verso = latexSheetLayout(paper, 1);
  // The 10pt class places its margins 35pt and 89pt from the one-inch origin.
  expect(paper.left).toBeCloseTo(96 + 35 * 96 / 72.27, 4);
  expect(verso.left).toBeCloseTo(96 + 89 * 96 / 72.27, 4);
  expect(verso.left + verso.right).toBeCloseTo(paper.left + paper.right);
  const oneSided = latexPageLayout(String.raw`\documentclass[oneside]{book}`);
  expect(latexSheetLayout(oneSided, 1).left).toBe(oneSided.left);
});

test('PGFPlots reserves room for labels before sizing the axis', () => {
  for (const axisOnly of [false, true]) {
    const drawing = readLatexDrawing(
      String.raw`\begin{axis}[width=200pt,height=150pt${axisOnly ? ',scale only axis' : ''}]
      \addplot coordinates {(1,24) (4,30)};
      \end{axis}`,
    );
    expect(drawing?.kind).toBe('axis');
    const frame = layoutLatexDrawing(drawing!, 500, 96 / 7.227)?.primitives[0];
    expect(frame?.kind).toBe('rect');
    if (frame?.kind !== 'rect') throw new Error('Expected a rectangular plot frame');
    const allowance = axisOnly ? 0 : 45;
    expect(frame.width).toBeCloseTo((200 - allowance) * 96 / 72.27, 5);
    expect(frame.height).toBeCloseTo((150 - allowance) * 96 / 72.27, 5);
  }
});
