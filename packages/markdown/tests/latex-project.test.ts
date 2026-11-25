import { expect, test } from 'bun:test';
import { undo } from 'prosemirror-history';
import { receiveTransaction, sendableSteps } from 'prosemirror-collab';
import { latexState } from '../src/latex-editor';
import {
  latexEffectivePrefix, latexFlow, latexNumbering, latexPageLayout, layoutLatexDrawing,
  paginateLatex, parseLatexProject, readLatexDrawing, readLatexFigure, replaceLatexSource, serializeLatexProject,
  setLatexCaption, interpretLatexText, readLatexTextMacros, latexTitleArguments, materializeLatexStructures,
} from '../src/latex';

test('unlinking a chapter in Visual retains the most recent chapter file and can be undone', () => {
  const entry = 'main.tex';
  const chapter = 'chapter.tex';
  const document = parseLatexProject(entry, new Map([
    [entry, String.raw`\begin{document}\input{chapter}\end{document}`],
    [chapter, 'Original text.\n'],
  ]));
  let state = latexState(document, 0, 'writer');
  state = state.apply(state.tr.insertText('Edited', 2, 10));
  const revised = serializeLatexProject(state.doc)?.files.get(chapter);
  expect(revised).toBe('Edited text.\n');
  state = state.apply(state.tr.delete(0, state.doc.firstChild!.nodeSize));
  const snapshot = serializeLatexProject(state.doc);
  expect(snapshot?.files.get(entry)).not.toContain('\\input');
  expect(snapshot?.files.get(chapter)).toBe(revised);
  expect(undo(state, transaction => { state = state.apply(transaction); })).toBe(true);
  expect(serializeLatexProject(state.doc)?.files.get(entry)).toContain('\\input{chapter}');
});

test('unlinking an include retains a chapter edit received during collaboration rebase', () => {
  const entry = 'main.tex';
  const chapter = 'chapter.tex';
  const document = parseLatexProject(entry, new Map([
    [entry, String.raw`\begin{document}\input{chapter}\end{document}`],
    [chapter, 'Original text.\n'],
  ]));
  const editor = latexState(document, 0, 'editor');
  const edited = editor.apply(editor.tr.insertText('Revised', 2, 10));
  const incoming = sendableSteps(edited)!.steps;
  const remover = latexState(document, 0, 'remover');
  const unlinked = remover.apply(remover.tr.delete(0, document.firstChild!.nodeSize));
  const rebased = unlinked.apply(receiveTransaction(unlinked, incoming, ['editor']));
  expect(serializeLatexProject(rebased.doc)?.files.get(entry)).not.toContain('\\input');
  expect(serializeLatexProject(rebased.doc)?.files.get(chapter)).toBe('Revised text.\n');
});

test('an included chapter edits its original file and keeps the local class and labels', () => {
  const files = new Map([
    ['book/main.tex', String.raw`\documentclass{custom}
\begin{document}
\include{chapters/one}
\chapter{Second}
See \ref{ch:first}.
\end{document}`],
    ['book/custom.cls', String.raw`\LoadClass[11pt,a4paper]{book}
\RequirePackage[margin=28mm]{geometry}`],
    ['book/chapters/one.tex', String.raw`\chapter{First}\label{ch:first}
The original paragraph.
`],
  ]);
  const doc = parseLatexProject('book/main.tex', files);
  doc.check();
  expect(serializeLatexProject(doc)?.files).toEqual(files);
  expect(latexPageLayout(latexEffectivePrefix(doc)).left).toBeCloseTo(28 * 96 / 25.4, 6);
  expect(latexNumbering(doc)?.labels.get('ch:first')).toBe('1');
  const include = doc.firstChild!;
  expect(include.type.name).toBe('latex_include');
  expect(latexFlow(doc).get(1)?.kind).toBe('content');
  const fragment = 'book/chapters/one.tex';
  const next = replaceLatexSource(doc, files.get(fragment)!.replace('original', 'revised'), fragment).doc;
  expect(next.textContent).toContain('The revised paragraph.');
  expect(serializeLatexProject(next)?.files.get('book/main.tex')).toBe(files.get('book/main.tex'));
  expect(serializeLatexProject(next)?.files.get(fragment)).toContain('The revised paragraph.');
});

test('an inline table and a project CSV produce the same plot', () => {
  const data = 'batch,share\n1,0.2\n2,0.5\n';
  const make = (content: string) => readLatexDrawing(String.raw`\begin{axis}[ymin=0,ymax=1]
\addplot+[mark=*] table[col sep=comma,x=batch,y=share]{${content}};
\end{axis}`)!;
  const external = layoutLatexDrawing(make('data/replay.csv'), 400, 13.28, name => name === 'data/replay.csv' ? data : undefined);
  expect(external?.primitives.filter(item => item.kind === 'dot')).toHaveLength(2);
  expect(external?.primitives.some(item => item.kind === 'text' && item.align === 'right' && item.text === '1')).toBe(true);
  expect(layoutLatexDrawing(make(data), 400, 13.28)).toEqual(external);
});

test('outer captions and subfigure references follow their own source', () => {
  const figure = String.raw`\begin{figure}
\begin{subfigure}{.45\linewidth}
\rule{37mm}{3mm}\caption{Existing}\label{fig:existing}
\end{subfigure}
\hfill
\begin{subfigure}{.45\linewidth}
\rule{37mm}{5mm}\caption{Proposed}\label{fig:proposed}
\end{subfigure}
\caption{Comparison}\label{fig:overall}
\end{figure}`;
  const doc = parseLatexProject('main.tex', new Map([['main.tex', String.raw`\begin{document}${figure}\end{document}`]]));
  expect(readLatexFigure(figure)?.caption?.text).toBe('Comparison');
  expect(readLatexFigure(figure)?.panels.map(panel => panel.caption?.text)).toEqual(['Existing', 'Proposed']);
  expect(latexNumbering(doc)?.labels.get('fig:existing')).toBe('1a');
  expect(latexNumbering(doc)?.labels.get('fig:proposed')).toBe('1b');
  expect(setLatexCaption(figure, 'Updated', false, 0)).toBe(figure.replace('Comparison', 'Updated'));
});


test('a wide figure moves to the next sheet while later paragraphs stay on the first', () => {
  const result = paginateLatex([
    { position: 0, top: 0, bottom: 20 },
    { position: 12, top: 0, bottom: 40, flow: { kind: 'content', wideFloat: true } },
    { position: 23, top: 20, bottom: 50 },
  ], 100, 20, 0, 2);
  expect(result.breaks).toEqual([]);
  expect(result.wideFloats).toEqual([{ position: 12, sheet: 1, offset: 30, height: 40 }]);
  expect(Math.ceil(result.pages / 2)).toBe(2);
});

test('project preamble includes load explicit style inputs without rewriting the sources', () => {
  const files = new Map([
    ['thesis.tex', String.raw`\documentclass{report}
\include{thesis.preamble}
\begin{document}
\greeting{writer}
\end{document}`],
    ['thesis.preamble.tex', String.raw`\input{greetings.sty}`],
    ['greetings.sty', String.raw`\def\greeting#1{Hello #1}
\endinput
\def\greeting#1{Goodbye #1}`],
  ]);
  const document = parseLatexProject('thesis.tex', files);
  const macros = readLatexTextMacros(latexEffectivePrefix(document));
  expect(interpretLatexText(String.raw`\greeting{writer}`, macros)).toEqual(['Hello writer']);
  expect(serializeLatexProject(document)?.files).toEqual(files);
});

test('title setters from body includes take effect at the title without printing', () => {
  const files = new Map([
    ['main.tex', String.raw`\documentclass{report}
\title{Preamble title}
\begin{document}
\input{metadata}
\maketitle
\title{Too late}
\end{document}`],
    ['metadata.tex', String.raw`\title{Body title}
\author{Writer}`],
  ]);
  const doc = parseLatexProject('main.tex', files);
  const titlePosition = doc.firstChild!.nodeSize;
  const fields = latexTitleArguments(doc, titlePosition);
  expect(fields.get('title')?.source).toBe('Body title');
  const author = fields.get('author');
  expect(author?.source).toBe('Writer');
  expect(author && author.kind === 'body' && latexFlow(doc).get(author.position)).toEqual({ kind: 'omit' });
  expect(serializeLatexProject(doc)?.files).toEqual(files);
});


test('state macros reserve no space and custom titles retain recto page boundaries', () => {
  const prefix = String.raw`\documentclass[twoside]{report}
\def\maketitle{\begin{titlepage}Example\end{titlepage}}
\def\endtitlepage{\cleardoublepage}
\def\setmeta#1{\gdef\@data{#1}}
\newcommand{\front}{\pagenumbering{roman}\pagestyle{plain}\doublespacing}
\begin{document}`;
  const entry = 'main.tex';
  const content = String.raw`\setmeta{Date}
\maketitle
\front
Body
\end{document}`;
  const document = parseLatexProject(entry, new Map([[entry, prefix + content]]));
  const flow = latexFlow(document);
  expect(flow.get(0)?.kind).toBe('omit');
  const title = document.child(0).nodeSize;
  expect(flow.get(title)).toMatchObject({ after: 'recto' });
  const front = title + document.child(1).nodeSize;
  expect(flow.get(front)?.kind).toBe('omit');
  expect(flow.get(front + document.child(2).nodeSize)).toMatchObject({ numbering: 'roman' });
  expect(materializeLatexStructures(document).docChanged).toBe(false);
});

test('a local titled environment keeps prose editable and preserves its opening page break', () => {
  const source = String.raw`\documentclass[twoside]{report}
\newenvironment{credits}{\cleardoublepage\begin{center}{\large\bf Credits}\end{center}}{\par}
\begin{document}
Earlier text.

\begin{credits}
Thanks to the team.
\end{credits}
\end{document}`;
  const document = parseLatexProject('main.tex', new Map([['main.tex', source]]));
  const environment = document.child(1);
  expect(environment.type.name).toBe('blockquote');
  expect(environment.textContent).toBe('Thanks to the team.');
  expect(latexFlow(document).get(document.child(0).nodeSize + 1)).toMatchObject({ before: 'recto' });
  expect(serializeLatexProject(document)?.files.get('main.tex')).toBe(source);
});

test('list fragments honor authored recto breaks even if both lists could fit on one page', () => {
  const result = paginateLatex([{
    position: 0, top: 0, bottom: 55, forceFragments: true, preferFragments: true,
    split: () => [
      { position: 0, top: 0, bottom: 30 },
      { position: 0, top: 30, bottom: 55, before: 'recto',
        continuation: { fragment: 1, startHeight: 0 } },
    ],
  }], 100, 20);
  expect(result.pages).toBe(3);
  expect(result.breakSlots).toEqual([2]);
  expect(result.breaks[0]?.fragment).toBe(1);
});

test('a counter definition only affects numbering when its macro executes', () => {
  const prefix = String.raw`\documentclass{report}
\newcommand{\jump}{\setcounter{chapter}{10}}
\begin{document}`;
  const document = (body: string) => parseLatexProject('main.tex', new Map([
    ['main.tex', prefix + body + '\\end{document}'],
  ]));
  expect([...latexNumbering(document('\\chapter{First}'))?.headings.values() ?? []])
    .toEqual([{ command: 'chapter', number: '1' }]);
  expect(latexNumbering(document('\\jump\\chapter{First}'))).toBeUndefined();
});
