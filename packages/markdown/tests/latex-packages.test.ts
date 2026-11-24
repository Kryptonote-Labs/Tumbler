import { expect, test } from 'bun:test';
import { addLatexPackage, latexLineSpacing, latexRomanFamily, setLatexLineSpacing, setLatexRomanFamily } from '../src/latex-format';
import { latexPageLayout } from '../src/latex-layout';
import { readLatexPackages } from '../src/latex-preamble';

const preamble = String.raw`\documentclass[12pt]{article}
\begin{document}
`;

test('paints imported and ribbon-applied setspace presets with the class-size baselines', () => {
  const single = latexPageLayout(preamble);
  const imported = preamble.replace('\\begin', '\\usepackage[onehalfspacing]{setspace}\n\\begin');
  const double = setLatexLineSpacing(imported, 'double');
  expect(latexPageLayout(imported).leading / single.leading).toBeCloseTo(1.241);
  expect(latexPageLayout(double).leading / single.leading).toBeCloseTo(1.655);
  expect(latexPageLayout(double).top).toBeCloseTo(single.top);
  const reset = setLatexLineSpacing(double, 'single');
  expect(latexLineSpacing(reset).mode).toBe('single');
  expect(latexPageLayout(reset).leading).toBe(single.leading);
  expect(readLatexPackages(reset).filter(({ name }) => name === 'setspace')).toHaveLength(1);
});

test('adds package declarations once and lets a font choice override an imported package', () => {
  const imported = preamble.replace('\\begin', '\\usepackage[T1]{fontenc}\n\\begin');
  const latin = setLatexRomanFamily(imported, 'lmr');
  expect(latexPageLayout(latin).typography?.latinModern).toBe(true);
  const computer = setLatexRomanFamily(latin, 'cmr');
  expect(latexRomanFamily(computer)).toBe('cmr');
  expect(latexPageLayout(computer).typography?.latinModern).toBe(false);
  expect(readLatexPackages(computer).map(({ name, options }) => [name, options])).toEqual([
    ['fontenc', ['T1']],
    ['lmodern', []],
  ]);
  expect(addLatexPackage(computer, 'fontenc')).toBe(computer);
});
