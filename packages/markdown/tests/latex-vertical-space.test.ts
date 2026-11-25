import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Transform } from 'prosemirror-transform';
import {
  latexFlow,
  latexPageLayout,
  latexPageNumbers,
  latexParagraphText,
  latexVerticalSpace,
  materializeLatexStructures,
  paginateLatex,
  parseLatex,
  readLatexPageComposition,
  serializeLatex,
  type PageBlock,
} from '../src/latex';

const dedication = String.raw`\pagenumbering{roman}
\thispagestyle{empty}
\begin{center}
  \vspace*{\fill}
  Acknowledgement
  \vspace*{\fill}
\end{center}
\clearpage`;

test('imports centred page glue and hides only the dedication folio without rewriting the source', () => {
  const source = dedication + '\r\nNext page.\r\n';
  const document = parseLatex(source);
  const first = document.child(0).nodeSize + document.child(1).nodeSize;
  const center = document.nodeAt(first)!;
  expect(center.type.name).toBe('latex_container');
  expect(center.children.map((node) => node.type.name)).toEqual(['latex_raw', 'paragraph', 'latex_raw']);
  expect(readLatexPageComposition(dedication)).toBeUndefined();
  expect(materializeLatexStructures(document).docChanged).toBe(false);
  expect(serializeLatex(document)).toBe(source);

  const edit = new Transform(document);
  edit.insert(first + center.child(0).nodeSize + 2, document.type.schema.text('A short '));
  expect(serializeLatex(edit.doc)).toBe(source.replace('Acknowledgement', 'A short Acknowledgement'));

  const flow = latexFlow(document);
  const top = first + 1;
  const text = top + center.child(0).nodeSize;
  const bottom = text + center.child(1).nodeSize;
  const boundary = first + center.nodeSize;
  const next = boundary + document.nodeAt(boundary)!.nodeSize;
  const plan = paginateLatex([
    { position: top, top: 0, bottom: 0, flow: flow.get(top), fills: [{ position: top, order: 2, weight: 1 }] },
    { position: text, top: 0, bottom: 20 },
    { position: bottom, top: 20, bottom: 20, fills: [{ position: bottom, order: 2, weight: 1 }] },
    { position: boundary, top: 20, bottom: 20, flow: flow.get(boundary) },
    { position: next, top: 20, bottom: 40 },
  ], 200, 30);
  expect([...plan.stretches]).toEqual([[top, 90], [bottom, 90]]);
  expect(plan.breaks).toEqual([{ position: next, height: 30 }]);
  expect(latexPageNumbers(flow, [next])).toEqual([
    { number: 1, visible: false, style: 'roman' },
    { number: 2, visible: true, style: 'roman' },
  ]);
});

test.each(['center', 'flushleft', 'flushright'])('%s keeps skips inside editable paragraph text', (environment) => {
  const inline = String.raw`One\vspace { 2.5em } two\vspace* {\stretch{ 2.5 }} three`;
  const source = '\\begin{' + environment + '}\n\\vspace{10mm}\n' + inline + '\n\\end{' + environment + '}';
  const document = parseLatex(source);
  const paragraph = document.firstChild!.lastChild!;
  expect(paragraph.type.name).toBe('paragraph');
  expect(latexParagraphText(paragraph)?.segments.map(({ text }) => text)).toEqual(['One two three']);
  expect(latexVerticalSpace(paragraph.child(1).attrs.source)).toMatchObject({
    length: '2.5em', height: 2.5, unit: 'em', starred: false,
  });
  expect(latexVerticalSpace(paragraph.child(3).attrs.source)).toMatchObject({
    starred: true, height: 0, fill: { order: 2, weight: 2.5 },
  });
  expect(serializeLatex(document)).toBe(source);
});

test('sets only the highest-order fills per sheet, including split lines and footnote room', () => {
  const plan = paginateLatex([
    { position: 0, top: 0, bottom: 13, discardableSpace: 13 },
    { position: 1, top: 13, bottom: 13, fills: [{ position: 1, order: 2, weight: 1 }] },
    { position: 2, top: 13, bottom: 33, notes: [8], fills: [{ position: 4, order: 2, weight: 3 }] },
    { position: 7, top: 33, bottom: 33, fills: [{ position: 7, order: 1, weight: 5 }] },
    { position: 8, top: 33, bottom: 33, flow: { kind: 'break', boundary: 'page' } },
    { position: 9, top: 33, bottom: 45, discardableSpace: 12 },
    {
      position: 10, top: 45, bottom: 155, forceFragments: true,
      split: () => [
        { position: 10, top: 45, bottom: 65, fills: [{ position: 11, order: 2, weight: 1 }] },
        { position: 12, top: 65, bottom: 85 },
        { position: 13, top: 135, bottom: 155, fills: [{ position: 14, order: 2, weight: 1 }] },
      ],
    },
  ], 100, 30, 4);
  expect([...plan.discardedSpaces]).toEqual([0, 9]);
  expect([...plan.stretches]).toEqual([[1, 17], [4, 51], [11, 60], [14, 80]]);
  expect(plan.breaks.map(({ position }) => position)).toEqual([10, 13]);
  expect(plan.pages).toBe(3);
});

const hasTex = ['pdflatex', 'pdftotext'].every((tool) => Bun.which(tool));

test.skipIf(!hasTex && process.env.REQUIRE_LATEX_PDF !== '1')('PDF places the dedication and inline skips like page glue', () => {
  if (!hasTex) throw new Error('The vertical spacing test requires pdfLaTeX and Poppler.');
  const prefix = '\\documentclass{article}\n\\begin{document}\n';
  const body = dedication + '\n' + String.raw`\vspace{36pt}
\vspace*{\stretch{2}}
One\vspace{24pt} continues\\
Two\vspace*{\stretch{1}} continues\\
Three
\end{document}`;
  const source = prefix + body;
  const document = parseLatex(source);
  expect(serializeLatex(document)).toBe(source);
  const layout = latexPageLayout(prefix);
  const bodyHeight = layout.height - layout.top - layout.bottom;
  const folder = mkdtempSync(join(tmpdir(), 'tumbler-vertical-space-'));
  try {
    writeFileSync(join(folder, 'spacing.tex'), serializeLatex(document));
    const deadline = performance.now() + 1500;
    function run(tool: string, args: string[]) {
      const timeout = Math.floor(deadline - performance.now());
      if (timeout < 1) throw new Error('The TeX commands exceeded their compile budget.');
      const result = spawnSync(tool, args, { cwd: folder, timeout, killSignal: 'SIGKILL', encoding: 'utf8' });
      if (result.error) throw result.error;
      if (result.status !== 0) throw new Error(result.stdout + result.stderr);
      return result.stdout;
    }
    run('pdflatex', ['-no-shell-escape', '-interaction=nonstopmode', '-halt-on-error', 'spacing.tex']);
    const pdf = run('pdftotext', ['-bbox', 'spacing.pdf', '-']);
    const pages = [...pdf.matchAll(/<page\b[^>]*>([\s\S]*?)<\/page>/g)].map(([, page]) =>
      new Map([...page!.matchAll(/yMin="([\d.]+)"[^>]*>(\w+)<\/word>/g)]
        .map(([, y, word]) => [word, Number(y) * 96 / 72])),
    );
    expect(pages).toHaveLength(2);
    expect([...pages[0]!.keys()]).toEqual(['Acknowledgement']);
    expect(pages[1]!.has('ii')).toBe(true);
    expect(Math.abs(pages[0]!.get('Acknowledgement')! - layout.top - bodyHeight / 2)).toBeLessThan(layout.leading);

    const px = (source: string) => latexVerticalSpace(source)!.height;
    const first = layout.firstBaseline + layout.leading;
    const second = first + layout.leading + px(String.raw`\vspace{24pt}`);
    const third = second + layout.leading;
    const skipped = px(String.raw`\vspace{36pt}`);
    const blocks: PageBlock[] = [
      { position: 0, top: 0, bottom: skipped, discardableSpace: skipped },
      { position: 1, top: skipped, bottom: skipped, fills: [{ position: 1, order: 2, weight: 2 }] },
      { position: 2, top: skipped, bottom: skipped + first },
      { position: 3, top: skipped + first, bottom: skipped + second, fills: [{ position: 3, order: 2, weight: 1 }] },
      { position: 4, top: skipped + second, bottom: skipped + third },
    ];
    const plan = paginateLatex(blocks, bodyHeight, layout.gap);
    const y = (word: string) => pages[1]!.get(word)!;
    expect(y('Two') - y('One')).toBeCloseTo(second - first, 2);
    expect(Math.abs(y('Three') - y('Two') - (third - second + plan.stretches.get(3)!))).toBeLessThan(1);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
