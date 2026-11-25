import { expect, test } from 'bun:test';
import { Transform } from 'prosemirror-transform';
import {
  latexContentsEntries,
  latexFlow,
  latexPageFurniture,
  latexPageLabel,
  latexPageMarks,
  latexPageNumbers,
  paginateLatex,
  parseLatex,
  readLatexBibliographyContents,
  readLatexHeadingMode,
  readLatexPageNumberSection,
  readLatexPageStyle,
  serializeLatex,
  setLatexBibliographyContents,
  setLatexBookMatter,
  setLatexHeadingMode,
  setLatexPageNumberSection,
  setLatexPageStyle,
  type PageBlock,
} from '../src/latex';

function measuredPages(document: ReturnType<typeof parseLatex>) {
  const flow = latexFlow(document);
  const blocks: PageBlock[] = [];
  document.forEach((_, position, index) =>
    blocks.push({ position, top: index * 5, bottom: index * 5 + 5, flow: flow.get(position) }));
  const plan = paginateLatex(blocks, 100, 20);
  const starts: number[] = [];
  plan.breaks.forEach(({ position }, index) => {
    while (starts.length < plan.breakSlots[index]!) starts.push(position);
  });
  const folios = latexPageNumbers(flow, starts, plan.folioLeadIns).map(latexPageLabel);
  return {
    starts,
    labels: folios,
    contents: latexContentsEntries(document).map(entry => {
      const page = starts.findLastIndex(position => position <= entry.position) + 1;
      return [entry.title, entry.number, folios[page]];
    }),
  };
}

test('report contents uses the front matter, restarted main matter, appendix and bibliography folios', () => {
  const source = String.raw`\documentclass[twoside]{report}
\begin{document}
\tableofcontents
\chapter{Preface}
\chapter{Methods}
\appendix
\chapter{Supplement}
\begin{thebibliography}{9}
\bibitem{sample} Sample.
\end{thebibliography}
\end{document}`;
  const tr = new Transform(parseLatex(source));
  setLatexHeadingMode(tr, tr.doc.child(0).nodeSize, 'contents');
  expect(readLatexHeadingMode(tr.doc, tr.doc.child(0).nodeSize)).toBe('contents');
  setLatexPageNumberSection(tr, tr.doc.child(0).nodeSize, { format: 'roman', startAt: 2 });
  const methods = tr.doc.children.slice(0, -1).findIndex(node => node.textContent === 'Methods');
  const beforeMethods = tr.doc.children.slice(0, methods).reduce((sum, node) => sum + node.nodeSize, 0);
  setLatexPageNumberSection(tr, beforeMethods, { format: 'arabic', startAt: 1 });
  setLatexBibliographyContents(tr, true);
  expect(readLatexBibliographyContents(tr.doc)).toEqual({ present: true, included: true });
  const tex = serializeLatex(tr.doc);
  expect(tex).toContain('\\chapter*{Preface}\n\\addcontentsline{toc}{chapter}{Preface}');
  const parsed = parseLatex(tex);
  expect(serializeLatex(parsed)).toBe(tex);
  expect(measuredPages(parsed)).toMatchObject({
    labels: ['1', 'ii', '1', '2', '3'],
    contents: [['Preface', '', 'ii'], ['Methods', '1', '1'], ['Supplement', 'A', '2'], ['Bibliography', '', '3']],
  });
  setLatexBibliographyContents(tr, false);
  expect(readLatexBibliographyContents(tr.doc).included).toBe(false);
});

test('numbering formats and repeated edits use LaTeX page counter semantics', () => {
  const tr = new Transform(parseLatex(String.raw`\begin{document}
Text.
\end{document}`));
  setLatexPageNumberSection(tr, 0, { format: 'Roman', startAt: 7 });
  const offset = tr.doc.children.slice(0, -1).reduce((sum, node) => sum + node.nodeSize, 0);
  expect(readLatexPageNumberSection(tr.doc, offset)).toEqual({ format: 'Roman', startAt: 7 });
  setLatexPageNumberSection(tr, offset, { format: 'Alph', startAt: 27 });
  const updated = serializeLatex(tr.doc);
  expect(updated).not.toContain('Roman');
  expect(measuredPages(parseLatex(updated)).labels).toEqual(['AA']);
  const after = tr.doc.children.slice(0, -1).reduce((sum, node) => sum + node.nodeSize, 0);
  setLatexPageNumberSection(tr, after, { format: 'alph', startAt: 28 });
  expect(measuredPages(parseLatex(serializeLatex(tr.doc))).labels).toEqual(['ab']);
});

test('book matter preserves the front and back contents while chapters open on odd folios', () => {
  const tr = new Transform(parseLatex(String.raw`\documentclass{book}
\begin{document}
\chapter{Preface}
\chapter{Results}
\chapter{Notes}
\end{document}`));
  setLatexBookMatter(tr, 0, 'front');
  const results = tr.doc.child(0).nodeSize + tr.doc.child(1).nodeSize;
  setLatexBookMatter(tr, results, 'main');
  const notes = results + tr.doc.child(2).nodeSize + tr.doc.child(3).nodeSize;
  setLatexBookMatter(tr, notes, 'back');
  expect(measuredPages(tr.doc)).toMatchObject({
    labels: ['i', 'ii', '1', '2', '3'],
    contents: [['Preface', '', 'i'], ['Results', '1', '1'], ['Notes', '', '3']],
  });
});

test('custom page furniture follows chapter pages and standard running headings use logical parity', () => {
  const prefix = '\\documentclass[twoside]{report}\n\\begin{document}';
  const settings = { kind: 'custom', header: 'Draft & notes', footer: 'Sample', number: 'head-R' } as const;
  const updated = setLatexPageStyle(prefix, settings);
  expect(readLatexPageStyle(updated)).toEqual(settings);
  expect(setLatexPageStyle(updated, settings)).toBe(updated);
  expect(latexPageFurniture(updated).style({ number: 1, visible: true, pageStyle: 'plain' })?.fields)
    .toContainEqual({ area: 'head', slot: 'R', source: '\\thepage' });
  const headings = setLatexPageStyle(updated, { kind: 'headings' });
  expect(headings).not.toContain('\\fancypagestyle');
  expect(latexPageFurniture(headings).style({ number: 8, visible: true })?.fields[0]?.slot).toBe('L');
  const document = parseLatex(headings + '\n\\appendix\n\\chapter{Supplement}\n\\end{document}');
  expect(latexPageMarks(document, [])[0]?.left.text).toBe('Appendix A.  Supplement');
});

test('renaming a visual heading updates its matching contents title', async () => {
  const { latexState } = await import('../src/latex-editor');
  const { TextSelection } = await import('prosemirror-state');
  const source = String.raw`\begin{document}
\section*{Old}
\addcontentsline{toc}{section}{Old}
\end{document}`;
  const initial = latexState(parseLatex(source), 0, undefined);
  const state = initial.apply(initial.tr.setSelection(TextSelection.create(initial.doc, 2)));
  expect(serializeLatex(state.apply(state.tr.insertText('New', 1, 4)).doc)).toBe(source.replaceAll('Old', 'New'));
  expect(serializeLatex(state.apply(state.tr.insertText('New', 1, 4).setMeta('latexSourceEdit', true)).doc))
    .toBe(source.replace('Old', 'New'));
});


test('an even restart before an open-right chapter ships the even folio first', () => {
  const document = parseLatex(String.raw`\documentclass{book}
\begin{document}
\chapter{First}
\clearpage
\pagenumbering{roman}
\setcounter{page}{4}
\chapter{Second}
\end{document}`);
  expect(measuredPages(document)).toMatchObject({
    labels: ['1', 'iv', 'v'],
    contents: [['First', '1', '1'], ['Second', '2', 'v']],
  });
});
