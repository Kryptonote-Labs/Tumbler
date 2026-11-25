import { expect, test } from 'bun:test';
import { Transform } from 'prosemirror-transform';
import {
  createLatexComposedPage,
  editLatexPageComposition,
  insertEmptyLatexBibliography,
  latexComposedPageSource,
  latexContentsEntries,
  latexFlow,
  latexFrontMatterOrder,
  latexFrontMatterStartsRight,
  latexPageLabel,
  latexPageNumbers,
  moveLatexGeneratedList,
  paginateLatex,
  parseLatex,
  readLatexBibliographyContents,
  readLatexPageComposition,
  serializeLatex,
  setLatexBibliographyContents,
  setLatexFrontMatterPageStart,
  setLatexPageContents,
  setLatexFrontMatter,
  updateLatexNodeSource,
  type PageBlock,
} from '../src/latex';

test('contents entries use the opening folios for an abstract, a composed page and an empty bibliography', () => {
  const source = '\\documentclass{book}\n\\begin{document}\n' +
    latexComposedPageSource('page') + '\n\\chapter{Example}\n\\end{document}';
  const tr = new Transform(parseLatex(source));
  const abstract = setLatexFrontMatter(tr, 'abstract', true)!;
  setLatexPageContents(tr, abstract, 'Abstract');
  const composed = tr.doc.firstChild!.nodeSize;
  updateLatexNodeSource(tr, composed, editLatexPageComposition(
    tr.doc.nodeAt(composed)!.attrs.source, 0, { kind: 'page-start', right: true },
  ));
  setLatexPageContents(tr, composed, 'Notes & credits');
  updateLatexNodeSource(tr, composed, editLatexPageComposition(
    tr.doc.nodeAt(composed)!.attrs.source, 0, { kind: 'page-alignment', alignment: 'center' },
  ));
  setLatexFrontMatter(tr, 'tableofcontents', true);
  insertEmptyLatexBibliography(tr);
  setLatexBibliographyContents(tr, true);
  const tex = serializeLatex(tr.doc);
  expect(tex).toContain('\\cleardoublepage\n\\begin{abstract}\n\\addcontentsline{toc}{chapter}{Abstract}');
  expect(tex).toContain('\\cleardoublepage\n\\begingroup\n\\addcontentsline{toc}{chapter}{Notes \\& credits}');
  const doc = parseLatex(tex);
  expect(serializeLatex(doc)).toBe(tex);
  expect(readLatexPageComposition(doc.nodeAt(composed)!.attrs.source)?.alignment).toBe('center');
  const flow = latexFlow(doc);
  const blocks: PageBlock[] = [];
  doc.descendants((node, position) => {
    if (node.isBlock && (node.isAtom || node.isTextblock))
      blocks.push({ position, top: blocks.length * 10, bottom: blocks.length * 10 + 10, flow: flow.get(position) });
    return !node.isTextblock;
  });
  const plan = paginateLatex(blocks, 100, 20);
  const starts: number[] = [];
  plan.breaks.forEach(({ position }, index) => {
    while (starts.length < plan.breakSlots[index]!) starts.push(position);
  });
  const numbers = latexPageNumbers(flow, starts, plan.folioLeadIns).map(latexPageLabel);
  expect(latexContentsEntries(doc).map(({ title, position }) =>
    [title, numbers[starts.findLastIndex(start => start <= position) + 1]],
  )).toEqual([['Abstract', '1'], ['Notes \\& credits', '3'], ['Example', '7'], ['Bibliography', '9']]);
  expect(readLatexBibliographyContents(doc)).toEqual({ present: true, included: true });
});

test('moving a list preserves its page-start override and leaves chapters on right-hand pages', () => {
  const tr = new Transform(parseLatex('\\documentclass{book}\n\\begin{document}\n\\chapter{Example}\n\\end{document}'));
  expect(createLatexComposedPage(tr.doc, 'page').attrs.source).toStartWith('\\cleardoublepage');
  const tables = setLatexFrontMatter(tr, 'listoftables', true)!;
  const contents = setLatexFrontMatter(tr, 'tableofcontents', true)!;
  setLatexFrontMatter(tr, 'listoffigures', true);
  expect(latexFrontMatterStartsRight(tr.doc, contents)).toBe(true);
  setLatexFrontMatterPageStart(tr, contents, false);
  moveLatexGeneratedList(tr, contents, -1);
  const tex = serializeLatex(tr.doc);
  const doc = parseLatex(tex);
  expect(serializeLatex(doc)).toBe(tex);
  expect(latexFrontMatterOrder(doc).map(({ kind }) => kind)).toEqual(['tableofcontents', 'listoftables', 'listoffigures']);
  expect(latexFrontMatterStartsRight(doc, tables)).toBe(false);
  expect(latexFlow(doc).get(tables)).toMatchObject({ before: 'page' });
  expect(latexFlow(doc).get(contents)).toMatchObject({ before: 'recto' });
  expect(latexFlow(doc).get(3)).toMatchObject({ before: 'recto' });
});

test('an explicit right-start title page remains editable and can carry a contents entry', () => {
  const page = latexComposedPageSource('title', true);
  const tr = new Transform(parseLatex('\\documentclass[twoside]{report}\n\\begin{document}\n' + page + '\n\\end{document}'));
  setLatexPageContents(tr, 0, 'Cover');
  const doc = parseLatex(serializeLatex(tr.doc));
  expect(doc.childCount).toBe(1);
  expect(readLatexPageComposition(doc.firstChild?.attrs.source)?.lines).toHaveLength(1);
  expect(latexFlow(doc).get(0)).toMatchObject({ before: 'recto' });
  expect(latexContentsEntries(doc)).toMatchObject([{ position: 0, title: 'Cover' }]);
  setLatexPageContents(tr, 0, null);
  expect(tr.doc.firstChild?.attrs.source).toBe(page);
});
