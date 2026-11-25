import { expect, test } from 'bun:test';
import {
  latexDocumentFont,
  latexDocumentFonts,
  latexPageLayout,
  readLatexPackages,
  setLatexDocumentFont,
  withoutLatexPackage,
} from '../src/latex';

const preamble = '\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}';

test('every catalogue font can be chosen, read back and replaced', () => {
  let prefix = preamble;
  for (const font of latexDocumentFonts) {
    prefix = setLatexDocumentFont(prefix, font.id);
    expect(latexDocumentFont(prefix)?.id).toBe(font.id);
    const fonts = readLatexPackages(prefix).filter(({ name }) =>
      latexDocumentFonts.some((item) => 'package' in item && item.package === name),
    );
    expect(fonts.length).toBe('package' in font ? 1 : 0);
  }
  const plain = setLatexDocumentFont(prefix, 'cmr');
  expect(plain).not.toContain('familydefault');
  expect(readLatexPackages(plain).map(({ name }) => name)).toEqual(['amsmath', 'fontenc']);
});

test('a sans body is set through the default family and removed with it', () => {
  const heros = setLatexDocumentFont(preamble, 'heros');
  expect(heros).toContain('\\usepackage{tgheros}\n\\renewcommand{\\familydefault}{\\sfdefault}\n');
  expect(latexDocumentFont(heros.replace(/\\renewcommand.*\n/, ''))?.id).toBe('cmr');
  expect(setLatexDocumentFont(heros, 'termes')).not.toContain('familydefault');
  expect(latexDocumentFont('\\usepackage{lato}\n\\begin{document}')?.id).toBe('cmr');
});

test('a body font sets the editor face and TeX interword glue', () => {
  const layout = latexPageLayout(setLatexDocumentFont(preamble, 'termes'));
  expect(layout.typography?.bodyFont?.family).toBe('Tumbler Termes');
  expect(layout.typography?.romanFont).toBeUndefined();
  expect(layout.typography?.space).toBeCloseTo(0.25 * layout.typography!.text.size);
});

test('removes one package from a shared declaration', () => {
  expect(withoutLatexPackage('\\usepackage{amsmath, tgtermes}\n', 'tgtermes')).toBe('\\usepackage{amsmath}\n');
  expect(() =>
    withoutLatexPackage(preamble, 'tgtermes', '\\usepackage{tgtermes}\n' + preamble),
  ).toThrow('project file');
});
