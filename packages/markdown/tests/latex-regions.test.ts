import { expect, test } from 'bun:test';
import { noteSchema } from '../src';
import {
  latexPageLayout,
  latexNaturalColumns,
  materializeLatexRegions,
  paginateLatexRegions,
  parseLatex,
  readLatexBeamerFrame,
  readLatexTableBlock,
  readLatexTikzStateDiagram,
  serializeLatex,
  setLatexTableCell,
} from '../src/latex';

test('a landscape section preserves delimiters and can still edit its own paragraphs', () => {
  const source = String.raw`Before.
\begin{landscape}
Write your notes here.
\end{landscape}
After.`;
  const parsed = parseLatex(source);
  const section = parsed.child(1);
  expect(section.type.name).toBe('latex_landscape');
  expect(serializeLatex(parsed)).toBe(source);
  const opaque = noteSchema.nodes.latex_raw!.create({
    before: '\n',
    source: source.slice(source.indexOf('\\begin'), source.indexOf('\nAfter.')),
  });
  const legacy = parsed.type.create(parsed.attrs, [parsed.child(0), opaque, parsed.child(2)]);
  const native = materializeLatexRegions(legacy).doc;
  expect(native.eq(parsed)).toBe(true);
  expect(serializeLatex(native)).toBe(source);
});

test('each landscape boundary changes the following sheet dimensions', () => {
  const paper = latexPageLayout(String.raw`\documentclass{article}`);
  const layout = paginateLatexRegions(
    [
      { position: 0, top: 0, bottom: 80 },
      { position: 9, landscape: 8, top: 80, bottom: 160 },
      { position: 19, top: 160, bottom: 250 },
    ],
    paper,
  );
  expect(layout.papers.map(({ width, height }) => [width, height])).toEqual([
    [paper.width, paper.height],
    [paper.height, paper.width],
    [paper.width, paper.height],
  ]);
  expect(layout.breaks.map(({ position }) => position)).toEqual([8, 19]);
  expect(layout.breaks[0]!.height + 80).toBeCloseTo(
    paper.height + paper.gap + paper.left - paper.top,
  );
});

test('flexible tabular columns retain the width argument during an edit', () => {
  const source = String.raw`\begin{tabularx}{\linewidth}{lXX}A & B & C \\ \end{tabularx}`;
  const table = readLatexTableBlock(source)!;
  expect(table.spec.width).toBe('\\linewidth');
  expect(table.spec.columns).toEqual(['l', 'X', 'X']);
  expect(setLatexTableCell(source, 0, 1, 'Updated', false)).toBe(
    source.replace(' B ', ' Updated '),
  );
});

test('empty intercolumn material removes the spacing on both adjacent sides', () => {
  const source = String.raw`\begin{tabular}{@{}l@{}cr@{}}A & B & C \\ \end{tabular}`;
  expect(latexNaturalColumns(readLatexTableBlock(source)!)).toEqual([
    { align: 'left', padBefore: false, padAfter: false },
    { align: 'center', padBefore: false, padAfter: true },
    { align: 'right', padBefore: true, padAfter: false },
  ]);
});

test('explicit Beamer overlays reserve hidden items and project only their visible content', () => {
  const source = String.raw`\begin{frame}{Workshop}
\begin{itemize}
\item<1-> Review the agenda.
\item<2-> Break for questions.
\end{itemize}
\only<2>{Discuss the next meeting.}
\end{frame}`;
  const frame = readLatexBeamerFrame(source)!;
  expect(frame.title).toBe('Workshop');
  expect(frame.overlays.map((page) => page.hiddenItems)).toEqual([[1], []]);
  expect(frame.overlays[0]!.body).not.toContain('Discuss the next meeting.');
  expect(frame.overlays[1]!.body).toContain('Discuss the next meeting.');
  expect(serializeLatex(parseLatex(source))).toBe(source);
});

test('a TikZ automaton retains its named states and transition directions', () => {
  const source = String.raw`\begin{tikzpicture}[node distance=38mm,auto]
\node[state] (locked) {locked};
\node[state,right=of locked] (unlocked) {unlocked};
\draw[->] (locked) edge[bend left] node {coin} (unlocked)
 (unlocked) edge[bend left] node {push} (locked);
\end{tikzpicture}`;
  const model = readLatexTikzStateDiagram(source)!;
  expect(model.separationMm).toBe(38);
  expect(model.states[1]!.relative).toEqual({ direction: 'right', reference: 'locked' });
  expect(model.transitions.map(({ from, label, to }) => [from, label, to])).toEqual([
    ['locked', 'coin', 'unlocked'],
    ['unlocked', 'push', 'locked'],
  ]);
});
