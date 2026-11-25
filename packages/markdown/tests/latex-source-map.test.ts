import { expect, test } from 'bun:test';
import {
  latexSourceMap, parseLatex, parseLatexProject, serializeLatex, withLatexItemLabel,
} from '../src/latex';

test('source and visual carets agree inside formatted and escaped text', () => {
  const source = String.raw`\section{Meet \textbf{Eli \& Jo}}
  
Next paragraph.`;
  const doc = parseLatex(source);
  const map = latexSourceMap(doc);
  const offset = source.indexOf('Jo') + 1;
  const position = map.positionAt({ offset })!;
  expect(doc.resolve(position).parent.textContent).toBe('Meet Eli & Jo');
  expect(map.sourceAt(position)?.offset).toBe(offset);
  expect(map.blockAt({ offset })?.node.type.name).toBe('latex_heading');
});

test('an included chapter maps to and from its own file', () => {
  const source = String.raw`\documentclass{article}
\begin{document}
\input{chapters/intro}
\end{document}`;
  const file = 'chapters/intro.tex';
  const doc = parseLatexProject('main.tex', new Map([
    ['main.tex', source],
    [file, 'First paragraph.'],
  ]));
  const map = latexSourceMap(doc);
  expect(map.blockAt({ offset: source.indexOf('\\input') })?.node.type.name).toBe('latex_include');
  const position = map.positionAt({ file, offset: 6 })!;
  expect(doc.resolve(position).parent.textContent).toBe('First paragraph.');
  expect(map.sourceAt(position)).toEqual({ file, offset: 6 });
});

test('plain custom labels keep the list and its item bodies editable', () => {
  const source = String.raw`\begin{enumerate}
  \item[Optional] Read the introduction.
  \item Continue.
\end{enumerate}`;
  const doc = parseLatex(source);
  const list = doc.child(0);
  expect(list.type.name).toBe('ordered_list');
  expect(list.child(0).textContent).toBe('Read the introduction.');
  expect(serializeLatex(doc)).toBe(source);
  const next = withLatexItemLabel(list.child(0).attrs.open, 'Suggested');
  expect(next).toBe('\\item[Suggested] ');
  expect(withLatexItemLabel(list.child(0).attrs.open, 'bad] value')).toBeUndefined();
});
