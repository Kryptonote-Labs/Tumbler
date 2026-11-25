import { expect, test } from 'bun:test';
import { Transform } from 'prosemirror-transform';
import {
  latexEffectivePrefix, readLatexClass, parseLatex, parseLatexFragment, serializeLatex, serializeLatexProject,
  serializeLatexSelection, updateLatexProjectFile,
} from '../src/latex';
import { latexDocumentClassName, setLatexDocumentClass, addLatexPackage, latexLineSpacing, latexRomanFamily, setLatexLineSpacing, setLatexRomanFamily } from '../src/latex-format';
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

test('retains class options and ignores commented declarations when selecting a custom class', () => {
  const prefix = '% \\documentclass{sample}\r\n\\documentclass[12pt]{ article }\r\n\\begin{document}';
  const next = setLatexDocumentClass(prefix, 'thesis');
  expect(latexDocumentClassName(next)).toBe('thesis');
  expect(next).toBe(prefix.replace('{ article }', '{ thesis }'));
  expect(() => setLatexDocumentClass('\\input{header}\\begin{document}', 'thesis', prefix))
    .toThrow('Change the class in the project file that declares it.');
});

test('adds project files through independent, undoable collaboration steps', () => {
  const source = String.raw`\documentclass{article}
\usepackage{lab}
\begin{document}
\lab{Ada} and \unknown{Math}
\end{document}`;
  const document = parseLatex(source);
  const style = new Transform(document);
  const component = new Transform(document);
  updateLatexProjectFile(style, 'lab.sty', String.raw`\newcommand{\lab}[1]{\textbf{#1}}`);
  updateLatexProjectFile(component, 'components/Signature.tex', String.raw`\lab{Ada}`);
  const combined = component.steps.reduce((tr, step) => tr.step(step), style);
  const project = serializeLatexProject(combined.doc);
  expect(project?.files.get('main.tex')).toBe(source);
  expect(project?.files.get('components/Signature.tex')).toBe('\\lab{Ada}');
  expect(latexEffectivePrefix(combined.doc)).toContain('\\newcommand{\\lab}');
  expect(combined.steps[0]!.invert(document).apply(combined.doc).doc?.attrs.latexProject.files)
    .toEqual({ 'components/Signature.tex': '\\lab{Ada}' });
});

test('serializes marked selections and parses components in their destination preamble', () => {
  const document = parseLatex(String.raw`\documentclass{article}
\newcommand{\lab}[1]{\textbf{#1}}
\begin{document}
Hello \lab{Ada} and \unknown{Math}.
\end{document}`);
  const source = serializeLatexSelection(document, 4, document.content.size - 1);
  expect(source).toBe(String.raw`lo \lab{Ada} and \unknown{Math}.`);
  const fragment = parseLatexFragment(document, source);
  expect(fragment.firstChild?.child(1).marks[0]?.attrs.style).toBe('strong');
  expect(fragment.firstChild?.child(3).attrs.source).toBe('\\unknown{Math}');
});

test('keeps the list environment when a component spans items', () => {
  const document = parseLatex(String.raw`\begin{itemize}
\item First item
\item Second item
\end{itemize}`);
  const source = serializeLatexSelection(document, 3, 26);
  expect(source).toStartWith('\\begin{itemize}');
  expect(source).toEndWith('\\end{itemize}');
  const list = parseLatexFragment(document, source).firstChild;
  expect(list?.type.name).toBe('bullet_list');
  expect(list?.children.map((item) => item.textContent)).toEqual(['First item', 'Second it']);
});

test('a custom class can forward its options to the base class for Visual layout', () => {
  const document = parseLatex(String.raw`\documentclass[12pt]{thesis}
\begin{document}
Text
\end{document}`);
  const tr = new Transform(document);
  updateLatexProjectFile(tr, 'thesis.cls', String.raw`\LoadClassWithOptions{report}`);
  expect(readLatexClass(latexEffectivePrefix(tr.doc))).toEqual({ name: 'report', options: ['12pt'] });
});

test('a fragment ending in a comment leaves a following document delimiter on its own line', () => {
  const document = parseLatex('\\begin{document}\nText\\end{document}');
  const fragment = parseLatexFragment(document, '% a note');
  const tr = new Transform(document).insert(document.content.size, fragment);
  expect(serializeLatex(tr.doc)).toEndWith('% a note\n\\end{document}');
});
