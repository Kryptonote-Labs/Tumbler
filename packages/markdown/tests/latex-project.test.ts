import { expect, test } from 'bun:test';
import {
  latexEffectivePrefix, latexFlow, latexNumbering, latexPageLayout, layoutLatexDrawing,
  paginateLatex, parseLatexProject, readLatexDrawing, readLatexFigure, replaceLatexSource, serializeLatexProject,
  setLatexCaption,
} from '../src/latex';

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
