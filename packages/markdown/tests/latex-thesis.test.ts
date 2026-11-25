import { expect, test } from 'bun:test';
import { latexComposedPageKind, latexThesis, parseLatex, readLatexPageComposition } from '../src/latex';

function composedPages(source: string) {
  const pages: string[][] = [];
  parseLatex(source).descendants((node) => {
    const raw = String(node.attrs.source ?? '');
    if (node.type.name === 'latex_raw' && latexComposedPageKind(raw))
      pages.push(
        readLatexPageComposition(raw)!.lines.map(({ from, to }) =>
          raw.slice(from, to) === '\\mbox{}' ? '' : raw.slice(from, to)),
      );
    return true;
  });
  return pages;
}

test('the thesis starter leaves unsupplied lines empty', () => {
  expect(composedPages(latexThesis({ title: 'Tidal Carbon' }).source)).toEqual([
    ['Tidal Carbon', '', ''],
    ['Acknowledgements', ''],
    ['Dedication', ''],
    ['Epigraph', ''],
  ]);
});

test('the thesis title page carries the supplied author and date', () => {
  const { source } = latexThesis({ title: 'Tidal Carbon', author: 'Sam Taylor', date: 'June 2027' });
  expect(composedPages(source)[0]).toEqual(['Tidal Carbon', 'Sam Taylor', 'June 2027']);
});
