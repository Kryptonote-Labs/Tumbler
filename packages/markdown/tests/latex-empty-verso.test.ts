import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Transform } from 'prosemirror-transform';
import {
  createLatexStructure, enableLatexEmptyVersos, latexEmptyVersos, latexFlow, latexPageNumbers,
  paginateLatex, parseLatex, serializeLatex, setLatexFrontMatter, setLatexFrontMatterPageStart,
  setLatexPageNumberSection, withLatexEmptyVersos,
  type PageBlock,
} from '../src/latex';
import { composeLatexPage } from '../src/latex-thesis';

test('a headless right-hand start adds emptypage once and round-trips through source', () => {
  const source = '\\documentclass[twoside]{report}\r\n\\begin{document}\r\n\\tableofcontents\r\n\\end{document}';
  const tr = new Transform(parseLatex(source));
  expect(serializeLatex(tr.doc)).toBe(source);
  setLatexFrontMatterPageStart(tr, 0, true);
  enableLatexEmptyVersos(tr);
  const authored = serializeLatex(tr.doc);
  expect(authored).toBe(source
    .replace('\\begin{document}', '\\usepackage{emptypage}\r\n\\begin{document}')
    .replace('\\tableofcontents', '\\cleardoublepage\n\\tableofcontents'));
  expect(serializeLatex(parseLatex(authored))).toBe(authored);
  expect(latexEmptyVersos(tr.doc.attrs.prefix)).toBe(true);
});

test('the default respects one-sided documents and explicit verso policies', () => {
  const book = '\\documentclass{book}\n';
  const begin = '\\begin{document}';
  for (const prefix of [
    '\\documentclass[oneside]{book}\n' + begin,
    book + '\\usepackage[even]{emptypage}\n' + begin,
    book + '\\usepackage[style=plain]{clrdblpg}\n' + begin,
    book + '\\renewcommand*{\\cleardoublepage}{\\clearpage}\n' + begin,
    book + '\\AtBeginDocument{\\renewcommand{\\cleardoublepage}{\\clearpage}}\n' +
      '\\usepackage{emptypage}\n' + begin,
  ]) {
    expect(withLatexEmptyVersos(prefix)).toBe(prefix);
    expect(latexEmptyVersos(prefix)).toBe(false);
  }
  const main = '\\input{preamble}\n' + begin;
  expect(withLatexEmptyVersos(main, book + '\\usepackage{emptypage}\n' + begin)).toBe(main);
  expect(latexEmptyVersos(book + '\\usepackage{clrdblpg}\n' + begin)).toBe(true);
});

test.each([1, 2])('visual pagination hides only parity sheets in a %i-column layout', (columns) => {
  const source = '\\documentclass[twoside]{report}\n\\usepackage{emptypage}\n\\begin{document}\n' +
    '\\pagestyle{headings}\nOpening.\n\n\\cleardoublepage\nMiddle.\n\n' +
    '\\clearpage\n\\null\n\\cleardoublepage\nClosing.\n\\end{document}';
  const document = parseLatex(source);
  const flow = latexFlow(document);
  const blocks: PageBlock[] = [];
  document.forEach((_, position, index) => {
    blocks.push({ position, top: index * 10, bottom: index * 10 + 10, flow: flow.get(position) });
  });
  const plan = paginateLatex(blocks, 100, 20, 0, columns);
  const starts: number[] = [];
  plan.breaks.forEach(({ position }, index) => {
    const slot = plan.breakSlots[index]!;
    if (slot % columns === 0) while (starts.length < slot / columns) starts.push(position);
  });
  expect([...plan.rectoBlanks]).toEqual([1]);
  expect(latexPageNumbers(flow, starts, plan.folioLeadIns, plan.rectoBlanks)).toEqual([
    { number: 1, visible: true, pageStyle: 'headings' },
    { number: 2, visible: false },
    { number: 3, visible: true, pageStyle: 'headings' },
    { number: 4, visible: true, pageStyle: 'headings' },
    { number: 5, visible: true, pageStyle: 'headings' },
  ]);
});

test('a recto start after an even page counter reset hides the reset sheet', () => {
  const flow = new Map([
    [0, { kind: 'content' } as const],
    [10, { kind: 'break', boundary: 'page' } as const],
    [20, { kind: 'content', before: 'recto', startAt: 4 } as const],
  ]);
  const plan = paginateLatex([0, 10, 20].map(position => ({
    position, top: position, bottom: position + 10, flow: flow.get(position),
  })), 100, 20);
  expect(plan.rectoBlanks).toEqual(new Set([1]));
  expect(latexPageNumbers(flow, [20, 20], plan.folioLeadIns, plan.rectoBlanks)).toEqual([
    { number: 1, visible: true },
    { number: 4, visible: false },
    { number: 5, visible: true },
  ]);
});

function numberedThesis(options = 'twoside') {
  const tr = new Transform(parseLatex(
    `\\documentclass[${options}]{report}\n\\begin{document}\n\\chapter{Introduction}\n\\end{document}`,
  ));
  const beforeChapter = () => tr.doc.content.size - tr.doc.lastChild!.nodeSize;
  tr.insert(0, composeLatexPage(tr.doc, 'title', ['Thesis title']));
  setLatexPageNumberSection(tr, beforeChapter(), { format: 'roman', startAt: 1 });
  tr.insert(beforeChapter(), composeLatexPage(tr.doc, 'page', ['Dedication']));
  tr.insert(beforeChapter(), composeLatexPage(tr.doc, 'page', ['Acknowledgements']));
  setLatexPageNumberSection(tr, beforeChapter(), { format: 'arabic', startAt: 1 });
  const contents = setLatexFrontMatter(tr, 'tableofcontents', true)!;
  if (options === 'twoside') setLatexFrontMatterPageStart(tr, contents, true);
  return serializeLatex(tr.doc);
}

test('authored thesis numbering and right-hand contents use recto sheets in visual pagination', () => {
  const source = numberedThesis();
  expect(source).toMatch(/\\cleardoublepage\n\\tableofcontents\s+\\cleardoublepage\n\\pagenumbering\{arabic\}/);
  const document = parseLatex(source);
  const flow = latexFlow(document);
  const blocks: PageBlock[] = [];
  const positions = new Map<string, number>();
  document.forEach((node, position, index) => {
    blocks.push({ position, top: index * 5, bottom: index * 5 + 5, flow: flow.get(position) });
    const text = String(node.attrs.source ?? node.textContent);
    for (const label of ['Dedication', '\\tableofcontents', 'Introduction'])
      if (text.includes(label)) positions.set(label, position);
  });
  const plan = paginateLatex(blocks, 100, 20);
  const starts: number[] = [];
  plan.breaks.forEach(({ position }, index) => {
    while (starts.length < plan.breakSlots[index]!) starts.push(position);
  });
  const pageOf = (label: string) => starts.findLastIndex(start => start <= positions.get(label)!) + 2;
  expect([pageOf('Dedication'), pageOf('\\tableofcontents'), pageOf('Introduction')]).toEqual([3, 5, 7]);
  expect([...plan.rectoBlanks]).toEqual([1, 5]);
  expect(latexPageNumbers(flow, starts, plan.folioLeadIns, plan.rectoBlanks)).toEqual([
    { number: 1, visible: false },
    { number: 2, visible: false },
    { number: 1, style: 'roman', visible: true },
    { number: 2, style: 'roman', visible: true },
    { number: 3, style: 'roman', visible: true },
    { number: 4, style: 'roman', visible: false },
    { number: 1, visible: true },
  ]);
});

test('one-sided numbering keeps clearpage even with openright chapters', () => {
  const source = numberedThesis('oneside,openright');
  expect(source).toContain('\\clearpage\n\\pagenumbering{roman}');
  expect(source).toContain('\\clearpage\n\\pagenumbering{arabic}');
  expect(source).not.toContain('\\cleardoublepage');
  expect(source).not.toContain('emptypage');
});

const hasTex = ['pdflatex', 'pdftotext', 'kpsewhich'].every(tool => Bun.which(tool)) &&
  spawnSync('kpsewhich', ['emptypage.sty'], { timeout: 400, stdio: 'ignore' }).status === 0;
const hasFancyhdr = hasTex &&
  spawnSync('kpsewhich', ['fancyhdr.sty'], { timeout: 400, stdio: 'ignore' }).status === 0;

function pdfPages(source: string) {
  const cwd = mkdtempSync(join(tmpdir(), 'latex-verso-'));
  const deadline = performance.now() + 1500;
  function run(tool: string, args: string[]) {
    const timeout = Math.floor(deadline - performance.now());
    if (timeout < 1) throw new Error('The TeX commands exceeded their compile budget.');
    const result = spawnSync(tool, args, { cwd, timeout, killSignal: 'SIGKILL', encoding: 'utf8' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(result.stdout + result.stderr);
    return result.stdout;
  }
  try {
    writeFileSync(join(cwd, 'document.tex'), source);
    run('pdflatex', ['-no-shell-escape', '-interaction=nonstopmode', '-halt-on-error', 'document.tex']);
    return run('pdftotext', ['-layout', 'document.pdf', '-']).split('\f').slice(0, -1).map(page => page.trim());
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test.skipIf(!hasTex && process.env.REQUIRE_LATEX_PDF !== '1')('pdfLaTeX puts authored thesis numbering and contents on rectos', () => {
  if (!hasTex) throw new Error('The LaTeX folio test requires TeX Live with emptypage and Poppler.');
  const pages = pdfPages(numberedThesis());
  expect(pages).toHaveLength(7);
  expect(pages[0]).toBe('Thesis title');
  expect(pages[1]).toBe('');
  expect(pages[2]).toMatch(/^Dedication\s+i$/);
  expect(pages[3]).toMatch(/^Acknowledgements\s+ii$/);
  expect(pages[4]).toMatch(/^Contents\s+iii$/);
  expect(pages[5]).toBe('');
  expect(pages[6]).toMatch(/^Chapter 1\s+Introduction\s+1$/);
});

test.skipIf(!hasTex)('pdfLaTeX keeps padding blank before report front matter', () => {
  const tr = new Transform(parseLatex(
    '\\documentclass[twoside]{report}\n\\begin{document}\nOpening.\n\n\\tableofcontents\n\\end{document}',
  ));
  setLatexFrontMatterPageStart(tr, tr.doc.firstChild!.nodeSize, true);
  const pages = pdfPages(serializeLatex(tr.doc));
  expect(pages).toHaveLength(3);
  expect(pages[0]).toMatch(/^Opening\.\s+1$/);
  expect(pages[1]).toBe('');
  expect(pages[2]).toMatch(/^Contents\s+3$/);
});

test.skipIf(!hasFancyhdr)('pdfLaTeX leaves fancy headers and chapter folios on content pages', () => {
  const tr = new Transform(parseLatex(
    '\\documentclass{book}\n\\usepackage{fancyhdr}\n' +
    '\\pagestyle{fancy}\\fancyhf{}\\fancyhead[C]{Running header}\\fancyfoot[C]{Folio \\thepage}\n' +
    '\\begin{document}\nOpening.\n\nMiddle.\n\n\\chapter{Example}\nClosing.\n\\end{document}',
  ));
  enableLatexEmptyVersos(tr);
  tr.insert(tr.doc.firstChild!.nodeSize, createLatexStructure(tr.doc, 'cleardoublepage'));
  const pages = pdfPages(serializeLatex(tr.doc));
  expect(pages).toHaveLength(5);
  expect(pages[0]).toMatch(/Running header[\s\S]*Opening\.[\s\S]*Folio 1/);
  expect(pages[1]).toBe('');
  expect(pages[2]).toMatch(/Running header[\s\S]*Middle\.[\s\S]*Folio 3/);
  expect(pages[3]).toBe('');
  expect(pages[4]).toMatch(/Chapter 1[\s\S]*Example[\s\S]*Closing\.[\s\S]*\b5$/);
});
