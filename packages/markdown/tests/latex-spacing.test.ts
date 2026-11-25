import { expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TextSelection, noteState } from '../src/editor';
import {
  applyLatexRegionSpacing,
  insertLatexVerticalGap,
  latexBaseSize,
  latexBodySpacing,
  latexLineSpacing,
  latexListOptions,
  latexPageLayout,
  latexParagraphGap,
  latexVerticalSpace,
  parseLatex,
  serializeLatex,
  setLatexBaseSize,
  setLatexLineSpacing,
  setLatexListItemGap,
  setLatexParagraphGap,
} from '../src/latex';
import { texPoint } from '../src/latex-typography';

const report = String.raw`\documentclass[a4paper,12pt]{report}
\usepackage[top=2cm,bottom=3cm]{geometry}
\usepackage{setspace,enumitem}
\newcommand{\bodyStretch}[1]{\renewcommand{\baselinestretch}{#1}\normalsize}
\bodyStretch{1.5}
\begin{document}
`;

test('changes the class size while preserving the remaining preamble and exact font metrics', () => {
  const next = setLatexBaseSize(report, 11);
  expect(next).toBe(report.replace('12pt', '11pt'));
  expect(latexBaseSize(next)).toBe(11);
  expect(latexPageLayout(next).fontSize / texPoint).toBeCloseTo(10.95, 7);
  expect(latexPageLayout(next).leading / texPoint).toBeCloseTo(13.6 * 1.5, 7);
  const extended = setLatexBaseSize(report.replace('{report}', '{extreport}'), 14);
  expect(latexPageLayout(extended).fontSize / texPoint).toBeCloseTo(14.4, 7);
  expect(latexPageLayout(extended).leading / texPoint).toBeCloseTo(17 * 1.5, 7);
});

test('round-trips exact multiples, setspace presets, and both baseline-stretch forms', () => {
  const plain = String.raw`\documentclass[12pt]{report}
\begin{document}
`;
  const exact = setLatexLineSpacing(plain, { multiple: '1.5' });
  expect(exact).toContain(String.raw`\linespread{1.5}`);
  expect(exact).not.toContain('setspace');
  expect(latexLineSpacing(exact)).toEqual({ mode: 'custom', stretch: 1.5 });
  expect(latexLineSpacing(report)).toEqual({ mode: 'custom', stretch: 1.5 });
  expect(latexLineSpacing(report.replace(String.raw`\bodyStretch{1.5}`, String.raw`\renewcommand{\baselinestretch}{1.65}`)))
    .toEqual({ mode: 'custom', stretch: 1.65 });
  expect(latexLineSpacing(setLatexLineSpacing(report, 'onehalf')))
    .toEqual({ mode: 'onehalf', stretch: 1.241 });
  expect(latexLineSpacing(setLatexLineSpacing(report, 'double')))
    .toEqual({ mode: 'double', stretch: 1.655 });
});

test('changes and removes a selected spacing region without changing surrounding paragraphs', () => {
  const source = report + 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.\n\\end{document}';
  let state = noteState('', 0, 'copy', parseLatex(source));
  const position = state.doc.child(0).nodeSize + 1;
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, position, position + 6)));
  expect(applyLatexRegionSpacing('single')(state, (tr) => { state = state.apply(tr); })).toBe(true);
  const authored = serializeLatex(state.doc);
  expect(authored).toContain('\\begin{spacing}{1}\nSecond paragraph.\n\\end{spacing}');
  expect(serializeLatex(parseLatex(authored))).toBe(authored);
  expect(latexBodySpacing(state.doc).spacing.get(position)).toBe(1);
  expect(applyLatexRegionSpacing({ multiple: '1.75' })(state, (tr) => { state = state.apply(tr); })).toBe(true);
  expect(serializeLatex(state.doc)).toContain('\\begin{spacing}{1.75}');
  expect(applyLatexRegionSpacing(null)(state, (tr) => { state = state.apply(tr); })).toBe(true);
  expect(serializeLatex(state.doc)).toBe(source);
});

test('authors paragraph and fixed gaps and preserves unrelated list options', () => {
  const source = report + String.raw`Body text.

\begin{itemize}[leftmargin=3em]
\item First.
\item Second.
\end{itemize}
\end{document}`;
  let state = noteState('', 0, 'copy', parseLatex(source));
  const dispatch: NonNullable<Parameters<ReturnType<typeof setLatexParagraphGap>>[1]> = (tr) => { state = state.apply(tr); };
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1)));
  expect(setLatexParagraphGap('before', '4mm')(state, dispatch)).toBe(true);
  expect(setLatexParagraphGap('after', '6pt')(state, dispatch)).toBe(true);
  expect(latexParagraphGap(state, 'before')).toBe('4mm');
  expect(latexParagraphGap(state, 'after')).toBe('6pt');
  expect(insertLatexVerticalGap('2mm', false)(state, dispatch)).toBe(true);
  expect(serializeLatex(state.doc)).toContain('\\vspace*{4mm}\n\n\\vspace{2mm}\n\nBody text.\n\n\\vspace{6pt}');
  const position = state.doc.content.size - state.doc.lastChild!.nodeSize + 3;
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, position)));
  expect(setLatexListItemGap('3mm')(state, dispatch)).toBe(true);
  expect(latexListOptions(String(state.doc.lastChild?.attrs.open))).toMatchObject({
    leftMargin: '3em', itemSeparation: '3mm',
  });
  const authored = serializeLatex(state.doc);
  expect(authored).toContain('\\begin{itemize}[leftmargin=3em,itemsep=3mm]');
  expect(serializeLatex(parseLatex(authored))).toBe(authored);
});

test.skipIf(!Bun.which('pdflatex') || !Bun.which('pdftotext') ||
  !Bun.which('kpsewhich') ||
  Bun.spawnSync(['kpsewhich', 'enumitem.sty']).exitCode !== 0)('matches pdfTeX reference skips and baseline deltas', () => {
  const source = report + String.raw`Globalone\\
Globaltwo

\begin{itemize}[itemsep=3mm]
\item Listone
\item Listtwo
\end{itemize}

\newpage
\vspace*{4mm}
\begin{spacing}{1}
Quoteone\\
Quotetwo
\end{spacing}
\end{document}`;
  const directory = mkdtempSync(join(tmpdir(), 'tumbler-spacing-'));
  try {
    writeFileSync(join(directory, 'spacing.tex'), source);
    const compiled = Bun.spawnSync(
      ['pdflatex', '-interaction=nonstopmode', '-halt-on-error', 'spacing.tex'],
      { cwd: directory },
    );
    if (compiled.exitCode !== 0) throw new Error(compiled.stdout.toString());
    const pdf = Bun.spawnSync(['pdftotext', '-bbox', 'spacing.pdf', '-'], { cwd: directory });
    if (pdf.exitCode !== 0) throw new Error(pdf.stderr.toString());
    const ys = new Map([...pdf.stdout.toString().matchAll(/yMin="([\d.]+)"[^>]+>(\w+)<\/word>/g)]
      .map(([, y, word]) => [word, Number(y) * 96 / 72]));
    const delta = (first: string, next: string) => ys.get(next)! - ys.get(first)!;
    const doc = parseLatex(source);
    const layout = latexPageLayout(doc.attrs.prefix);
    const spacing = latexBodySpacing(doc);
    const region = [...spacing.regions.values()][0]!;
    const single = layout.leading / spacing.initial * region.stretch;
    const list = layout.typography!.list[0]!;
    const vertical = latexVerticalSpace(String.raw`\vspace*{4mm}`)!;
    expect(delta('Globalone', 'Globaltwo')).toBeCloseTo(layout.leading, 2);
    expect(delta('Quoteone', 'Quotetwo')).toBeCloseTo(single, 2);
    // The starred skip inserts a zero-height rule with topskip and preserves the preceding box depth.
    expect(delta('Globalone', 'Quoteone')).toBeCloseTo(vertical.height + single, 2);
    expect(delta('Listone', 'Listtwo')).toBeCloseTo(layout.leading + list.paragraphSeparation + 3 * 96 / 25.4, 2);
    expect(serializeLatex(doc)).toBe(source);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
