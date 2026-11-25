import { expect, test } from 'bun:test';
import {
  editLatexPageComposition, interpretLatexComposedPage, latexComposedPageSource,
  latexComposedTextSource, latexFlow, latexPageLayout, parseLatex, readLatexPageComposition,
  serializeLatex,
} from '../src/latex';

const prefix = String.raw`\documentclass[a4paper,12pt,twoside]{report}
\usepackage[left=2cm,right=2cm,top=2cm,bottom=3cm]{geometry}
\renewcommand{\baselinestretch}{1.5}`;
const layout = latexPageLayout(prefix);

function fillLine(source: string, index: number, text: string) {
  const line = readLatexPageComposition(source)!.lines[index]!;
  return source.slice(0, line.from) + latexComposedTextSource(text) + source.slice(line.to);
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
  let source = latexComposedPageSource('title');
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

test('an ordinary centred dedication matches pdfTeX and preserves the running folio', () => {
  let source = fillLine(latexComposedPageSource('page'), 0, 'For everyone who taught me');
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
