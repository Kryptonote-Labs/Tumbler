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
