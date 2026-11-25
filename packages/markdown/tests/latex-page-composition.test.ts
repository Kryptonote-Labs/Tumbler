import { expect, test } from 'bun:test';
import { Transform } from 'prosemirror-transform';
import {
  editLatexPageComposition, interpretLatexComposedPage, latexComposedPageSource,
  latexContentsEntries, latexFlow, latexPageLabel, latexPageLayout, latexPageNumbers,
  materializeLatexStructures, paginateLatexRegions, parseLatex, readLatexPageComposition, replaceLatexSource,
  serializeLatex, setLatexFrontMatter, setLatexPageContents, splitLatexComposedText, updateLatexNodeSource,
  type PageBlock,
} from '../src/latex';

const prefix = String.raw`\documentclass[a4paper,12pt,twoside]{report}
\usepackage[left=2cm,right=2cm,top=2cm,bottom=3cm]{geometry}
\renewcommand{\baselinestretch}{1.5}`;
const layout = latexPageLayout(prefix);

function fillLine(source: string, index: number, text: string) {
  return editLatexPageComposition(source, index, { kind: 'line-text', text });
}

function baselines(source: string, preamble = prefix) {
  const page = interpretLatexComposedPage(preamble, latexPageLayout(preamble), source)!;
  const fills = page.items.filter((item) => item.kind === 'fill');
  const order = Math.max(0, ...fills.map((item) => item.order));
  const weight = fills.reduce((sum, item) => sum + (item.order === order ? item.weight : 0), 0);
  const free = (page.height ?? 0) - page.after - page.items.reduce((sum, item) => sum + item.before, 0);
  let y = 0;
  return page.items.flatMap((item) => {
    y += item.before;
    if (item.kind === 'fill' && item.order === order) y += free / weight * item.weight;
    return item.kind === 'line' && item.runs.length ? [{ y, runs: item.runs }] : [];
  });
}

test('a title page built with line and spacing edits matches pdfTeX baselines', () => {
  let source = editLatexPageComposition(latexComposedPageSource('title'), 0, {
    kind: 'page-spacing', stretch: '', paragraphGap: '',
  });
  const text = [
    'School of Design', 'Division of Paper', 'Research Programme', 'A Study of Paper Folding',
    'Ada Sample', 'Submitted for the degree of', 'Master of Design', 'March 2031',
  ];
  for (const [index, value] of text.entries()) {
    if (index) source = editLatexPageComposition(source, index - 1, { kind: 'add-line' });
    source = fillLine(source, index, value);
    source = editLatexPageComposition(source, index, {
      kind: 'line-style',
      style: { size: index === 3 ? 'LARGE' : index === 4 ? 'large' : 'normalsize', bold: index === 3 },
    });
    if (index >= 2 && index <= 4)
      source = editLatexPageComposition(source, index, { kind: 'space', length: index === 3 ? '6mm' : '' });
  }
  const lines = baselines(source);
  expect(lines.map((line) => line.runs.map((run) => run.text).join(''))).toEqual(text);
  expect(lines[3]!.runs[0]!.style).toMatchObject({ bold: true });
  // pdfTeX \pdfsavepos baselines in CSS pixels from the top of the A4 text block.
  const expected = [15.940, 44.832, 73.724, 455.931, 514.474, 875.760, 904.652, 933.543];
  for (const [index, line] of lines.entries()) expect(Math.abs(line.y - expected[index]!)).toBeLessThan(0.5);
  const document = prefix + '\n\\begin{document}\n' + source + '\n\\end{document}\n';
  const parsed = parseLatex(document);
  expect(parsed.firstChild?.attrs.source).toBe(source);
  expect(serializeLatex(parsed)).toBe(document);
});

test('imported title pages preserve editable text and their original structure', () => {
  const cover = String.raw`\begin{titlepage}
  \thispagestyle{empty}
  \centering
  \vspace*{1.5cm}
  {\Large Original heading\par}
  \vfill
  {\centering\normalsize Final line\par}
\end{titlepage}`;
  const source = '\\documentclass[12pt]{report}\n\\begin{document}\n' + cover + '\n\\end{document}';
  const parsed = parseLatex(source);
  const raw = parsed.type.schema.nodes.latex_raw!.create({ source: cover, before: '\n' });
  const legacy = parsed.type.create(parsed.attrs, raw);

  for (const document of [parsed, materializeLatexStructures(legacy).doc]) {
    const upgraded = materializeLatexStructures(document);
    expect(upgraded.docChanged).toBe(false);
    expect(serializeLatex(upgraded.doc)).toBe(source);
    const edited = new Transform(upgraded.doc);
    upgraded.doc.descendants((node, position) => {
      if (node.isText && node.text === 'Original heading') {
        edited.replaceWith(position, position + node.nodeSize, node.type.schema.text('Edited heading', node.marks));
      }
    });
    expect(serializeLatex(edited.doc)).toBe(source.replace('Original heading', 'Edited heading'));
  }
});

test('an ordinary centred dedication matches pdfTeX and preserves the running folio', () => {
  const legacy = editLatexPageComposition(latexComposedPageSource('page'), 0, {
    kind: 'page-spacing', stretch: '', paragraphGap: '',
  });
  let source = fillLine(legacy, 0, 'For everyone who taught me');
  source = editLatexPageComposition(source, 0, { kind: 'line-style', style: { italic: true, alignment: 'center' } });
  source = editLatexPageComposition(source, 0, { kind: 'page-alignment', alignment: 'center' });
  expect(readLatexPageComposition(source)?.alignment).toBe('center');
  const [line] = baselines(source);
  expect(Math.abs(line!.y - 489.188)).toBeLessThan(0.5);
  const [spaced] = baselines(source, prefix + '\n\\setlength{\\parskip}{8pt}');
  expect(Math.abs(spaced!.y - 494.502)).toBeLessThan(0.5);
  const tex = prefix + '\n\\begin{document}\nBefore.\n\n' + source + '\n\nAfter.\n\\end{document}';
  const parsed = parseLatex(tex);
  expect(serializeLatex(parsed)).toBe(tex);
  expect(latexFlow(parsed).get(parsed.child(0).nodeSize)).toEqual({ kind: 'content', before: 'page', after: 'page' });
});

const dedication = [
  '\\begingroup',
  '\\linespread{1}\\selectfont',
  '\\setlength{\\parskip}{0pt}',
  '{\\centering\\Large\\bfseries Dedication\\par}',
  '{\\raggedright\\normalsize Sample line\\par}',
  '\\clearpage',
  '\\endgroup',
].join('\n');

test('an opener-less page between front matter pages keeps its contents entry and folio', () => {
  const cover = fillLine(latexComposedPageSource('title'), 0, 'Example cover');
  const following = fillLine(latexComposedPageSource('page'), 0, 'Acknowledgements');
  const source = [
    '\\documentclass{report}', '\\begin{document}', cover,
    '\\clearpage % Front matter', '\\pagenumbering{roman}', '', dedication, '', following,
    '\\pagenumbering{arabic}', 'Body text.', '\\end{document}', '',
  ].join('\n');
  const document = parseLatex(source);
  const previous = parseLatex(source.replace(dedication, '\\clearpage\n' + dedication));
  expect(replaceLatexSource(previous, source).doc.eq(document)).toBe(true);
  expect(serializeLatex(document)).toBe(source);
  expect(document.child(4).attrs.source).toBe(dedication);
  expect(readLatexPageComposition(document.child(4).attrs.source)?.lines).toHaveLength(2);
  expect(document.child(5).attrs.source).toBe(following);

  const position = document.children.slice(0, 4).reduce((at, node) => at + node.nodeSize, 0);
  const tr = new Transform(document);
  setLatexPageContents(tr, position, 'Dedication');
  const parsed = parseLatex(serializeLatex(tr.doc));
  expect(latexContentsEntries(parsed)).toMatchObject([{ position, title: 'Dedication' }]);
  const flow = latexFlow(parsed);
  expect(flow.get(position)).toEqual({ kind: 'content', numbering: 'roman', startAt: 1, after: 'page' });
  const blocks: PageBlock[] = [];
  parsed.forEach((_, at, index) => blocks.push({ position: at, top: index * 20, bottom: index * 20 + 20, flow: flow.get(at) }));
  const plan = paginateLatexRegions(blocks, latexPageLayout('\\documentclass{report}'));
  expect(plan.pages).toBe(4);
  const folios = latexPageNumbers(flow, plan.breaks.map((item) => item.position), plan.folioLeadIns);
  expect(folios.map(latexPageLabel)).toEqual(['1', 'i', 'ii', '1']);
  const list = setLatexFrontMatter(tr, 'tableofcontents', true)!;
  expect(tr.doc.nodeAt(list - 1)?.attrs.source).toBe(following);
  expect(tr.doc.nodeAt(list + 1)?.attrs.source).toBe('\\pagenumbering{arabic}');
});

test.each([
  ['a clear page break', '\\clearpage'],
  ['a right-page break', '\\cleardoublepage'],
  ['a one-column page break', '\\newpage'],
  ['a title page', fillLine(latexComposedPageSource('title'), 0, 'Example cover')],
  ['an explicit composed page', fillLine(latexComposedPageSource('page'), 0, 'Previous page')],
  ['an inherited composed page', '\\clearpage\n' + dedication],
])('a grouped page can inherit the boundary after %s', (_, prior) => {
  const source = prior + '\n% Retain the page boundary\n\\pagenumbering{roman}\n\\setcounter{page}{3}\n\n' + dedication;
  const document = parseLatex(source);
  expect(document.lastChild?.attrs.source).toBe(dedication);
  expect(serializeLatex(document)).toBe(source);
});

test.each([
  ['ordinary text', 'Body text.', ''],
  ['a commented break', 'Body text.\n% \\clearpage', ''],
  ['text after a break', '\\clearpage\nBody text.', ''],
  ['a numbering change mid-page', 'Body text.\n\\pagenumbering{roman}', ''],
  ['a column break', '\\documentclass[twocolumn]{article}\n\\begin{document}\nBody text.\n\\newpage', '\n\\end{document}'],
  ['a break inside a minipage', '\\begin{minipage}{\\textwidth}\nBody text.\n\\clearpage', '\n\\end{minipage}'],
])('a group after %s needs a page boundary to become a composed page', (_, prior, close) => {
  const source = prior + '\n\n' + dedication + close;
  const document = parseLatex(source);
  document.descendants(node => expect(node.attrs.source).not.toBe(dedication));
  expect(serializeLatex(document)).toBe(source);
});

test('line and style edits preserve the inherited break, and the page start control adds its own', () => {
  const source = ('Body text.\n\\cleardoublepage\n\\setcounter{page}{3}\n\n' + dedication + '\n').replaceAll('\n', '\r\n');
  const tr = new Transform(parseLatex(source));
  const position = tr.doc.content.size - tr.doc.lastChild!.nodeSize;
  const page = String(tr.doc.lastChild!.attrs.source);
  const edited = editLatexPageComposition(fillLine(page, 1, 'Updated line'), 1, {
    kind: 'line-style', style: { italic: true },
  });
  updateLatexNodeSource(tr, position, edited);
  const expected = source.replace('\\normalsize Sample line', '\\normalsize\\itshape Updated line');
  expect(serializeLatex(tr.doc)).toBe(expected);
  expect(serializeLatex(parseLatex(expected))).toBe(expected);
  expect(editLatexPageComposition(edited, 0, { kind: 'page-start', right: false })).toBe(edited);
  const right = editLatexPageComposition(edited, 0, { kind: 'page-start', right: true });
  expect(right).toBe('\\cleardoublepage\r\n' + edited);
  expect(editLatexPageComposition(right, 0, { kind: 'page-start', right: false })).toBe('\\clearpage\r\n' + edited);
});

test('distribute is reversible and changing a fixed gap preserves literal editable text', () => {
  let source = fillLine(latexComposedPageSource('title'), 0, 'A & B {again}');
  source = editLatexPageComposition(source, 0, { kind: 'space', length: '6mm' });
  source = editLatexPageComposition(source, 0, { kind: 'add-line' });
  source = fillLine(source, 1, 'Second line');
  const top = source;
  source = editLatexPageComposition(source, 0, { kind: 'page-alignment', alignment: 'distribute' });
  expect(readLatexPageComposition(source)?.alignment).toBe('distribute');
  expect(baselines(source)[0]?.runs.map((run) => run.text)).toEqual(['A & B {again}']);
  expect(baselines(source)[1]?.y).toBeCloseTo(layout.height - layout.top - layout.bottom);
  expect(editLatexPageComposition(source, 0, { kind: 'page-alignment', alignment: 'top' })).toBe(top);
});

test('local spacing overrides the preamble and can be changed independently', () => {
  const preamble = prefix + '\n\\setlength{\\parskip}{8pt}';
  let source = fillLine(latexComposedPageSource('title'), 0, 'First');
  source = fillLine(editLatexPageComposition(source, 0, { kind: 'add-line' }), 1, 'Second');
  const gap = (value: string) => {
    const [first, second] = baselines(value, preamble);
    return second!.y - first!.y;
  };
  expect(readLatexPageComposition(source)?.spacing).toEqual({ stretch: '1', paragraphGap: '0pt' });
  expect(gap(source)).toBeCloseTo(19.261, 2);
  const spaced = editLatexPageComposition(source, 0, { kind: 'page-spacing', paragraphGap: '8pt' });
  expect(gap(spaced) - gap(source)).toBeCloseTo(10.627, 2);
  const inherited = editLatexPageComposition(source, 0, { kind: 'page-spacing', stretch: '' });
  expect(gap(inherited)).toBeCloseTo(gap(source) * 1.5, 2);
});

test('styled lines, ordinary paragraphs and lists remain on the same editable page', () => {
  let source = fillLine(latexComposedPageSource('title'), 0, 'Acknowledgements');
  source = editLatexPageComposition(source, 0, { kind: 'add-block', block: 'paragraph' });
  const paragraph = readLatexPageComposition(source)?.blocks[1];
  expect(paragraph?.kind).toBe('paragraph');
  source = editLatexPageComposition(source, -1, { kind: 'add-block', block: 'itemize', after: paragraph!.end });
  source = editLatexPageComposition(source, -1, { kind: 'add-block', block: 'enumerate' });
  source = source.replace('\\mbox{}\\par', 'Many thanks.\\par')
    .replace('\\item \\mbox{}', '\\item Design\n\\item Typesetting')
    .replace('\\item \\mbox{}', '\\item Proofreading');
  expect(readLatexPageComposition(source)?.blocks.map((block) => block.kind))
    .toEqual(['line', 'paragraph', 'itemize', 'enumerate']);
  const page = interpretLatexComposedPage(prefix, layout, source);
  const lines = page?.items.flatMap((item) => item.kind === 'line'
    ? [[item.item?.marker, item.runs.map((run) => run.text).join('')]] : []);
  expect(lines).toEqual([
    [undefined, 'Acknowledgements'], [undefined, 'Many thanks.'],
    ['•', 'Design'], ['•', 'Typesetting'], ['1.', 'Proofreading'],
  ]);
  const tex = prefix + '\n\\begin{document}\n' + source + '\n\\end{document}';
  const parsed = parseLatex(tex);
  expect(parsed.childCount).toBe(1);
  expect(serializeLatex(parsed)).toBe(tex);
});


test('splitting a list item preserves the text on either side and numbers the new item', () => {
  let source = fillLine(latexComposedPageSource('page'), 0, 'Notes');
  source = editLatexPageComposition(source, 0, { kind: 'add-block', block: 'enumerate' })
    .replace('\\item \\mbox{}', '\\item First second');
  const from = source.indexOf('First second');
  const result = splitLatexComposedText(source, { from, to: from + 12 }, 'First ', 'second');
  expect(result?.source).toContain('\\item First\n\\item second');
  expect(result?.source.slice(result.target, result.target + 6)).toBe('second');
  expect(interpretLatexComposedPage(prefix, layout, result!.source)?.items
    .flatMap((line) => line.kind === 'line' && line.item?.marker ? [line.item.marker] : []))
    .toEqual(['1.', '2.']);
});

test('a contents entry stays ahead of page spacing and content through ribbon edits', () => {
  const source = latexComposedPageSource('page').replace(
    '\\begingroup\n', '\\begingroup\n\\addcontentsline{toc}{chapter}{Notes}\n');
  let edited = editLatexPageComposition(source, 0, { kind: 'page-spacing', stretch: '1.5' });
  edited = editLatexPageComposition(edited, 0, { kind: 'page-alignment', alignment: 'center' });
  edited = editLatexPageComposition(edited, 0, { kind: 'add-block', block: 'itemize' });
  expect(edited).toStartWith('\\clearpage\n\\begingroup\n\\addcontentsline{toc}{chapter}{Notes}\n'
    + '\\linespread{1.5}\\selectfont\n\\setlength{\\parskip}{0pt}\n\\vspace*{\\fill}\n');
  const page = readLatexPageComposition(edited)!;
  expect(page.spacing).toEqual({ stretch: '1.5', paragraphGap: '0pt' });
  expect(page.alignment).toBe('center');
  expect(page.blocks.map(({ kind }) => kind)).toEqual(['line', 'itemize']);
});
