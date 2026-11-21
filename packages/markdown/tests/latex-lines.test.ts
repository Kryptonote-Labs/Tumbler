import { expect, test } from 'bun:test';
import {
  composeLatexParagraph,
  hyphenateLatexEnglish,
  latexPageLayout,
  latexParagraphText,
  measureLatexRoman,
  parseLatex,
  serializeLatex,
} from '../src/latex';

const simpleMetrics = {
  word: (text: string) => text.length,
  space: 1,
  stretch: 0.5,
  shrink: 0.25,
};

test('line breaks retain offsets and a nonbreaking space keeps words together', () => {
  const source = 'alpha beta\nred\u00a0green blue';
  const lines = composeLatexParagraph(source, 12, 0, simpleMetrics);
  expect(lines.map(({ from, to }) => source.slice(from, to))).toEqual([
    'alpha beta',
    'red\u00a0green',
    'blue',
  ]);
});

test('English discretionary breaks come from TeX and never insert a source character', () => {
  expect(hyphenateLatexEnglish('obligatory')).toEqual([5, 6]);
  expect(hyphenateLatexEnglish('present')).toEqual([]);
  const text = 'obligatory';
  const lines = composeLatexParagraph(text, 6, 0, {
    ...simpleMetrics,
    hyphenate: hyphenateLatexEnglish,
  });
  expect(lines).toEqual([
    { from: 0, to: 5, spaceAdjustment: 0, hyphen: true },
    { from: 5, to: 10, spaceAdjustment: 0 },
  ]);
  expect(lines.map(({ from, to }) => text.slice(from, to)).join('')).toBe(text);
});

test('the Roman metric engine honors ligatures, kerning and optical sizes', () => {
  const width = (text: string, font: 'cmr10' | 'cmr12' = 'cmr10') =>
    measureLatexRoman(text, font, 10)!;
  expect(width('fi')).toBeLessThan(width('f') + width('i'));
  expect(width('AV')).toBeLessThan(width('A') + width('V'));
  expect(width('Visual', 'cmr12')).not.toBe(width('Visual'));
  expect(measureLatexRoman('España', 'cmr10', 10)).toBeUndefined();
  expect(latexPageLayout('\\documentclass[12pt]{article}').typography?.romanFont).toBe('cmr12');
  expect(
    latexPageLayout('\\documentclass{article}\\usepackage[spanish]{babel}').typography?.hyphenation,
  ).toBeUndefined();
});

test('paragraph projections keep formatting, explicit breaks and escaped spaces addressable', () => {
  const source = String.raw`\noindent Meet \textbf{Eli} at 9~am.\\
Bring water.`;
  const document = parseLatex(source);
  const paragraph = latexParagraphText(document.child(0))!;
  expect(paragraph.noIndent).toBe(true);
  expect(paragraph.segments.map(({ text }) => text.trim())).toEqual([
    'Meet Eli at 9\u00a0am.',
    'Bring water.',
  ]);
  const marked = paragraph.segments[0]!.runs.find(({ bold }) => bold)!;
  expect(paragraph.segments[0]!.text.slice(marked.from, marked.to)).toBe('Eli');
  expect(document.child(0).nodeAt(marked.position)?.text).toBe('Eli');
  expect(serializeLatex(document)).toBe(source);
});

test('inline formulas and printable TeX ligatures retain their editor positions', () => {
  const source = "``The solution''---$x=2$.";
  const document = parseLatex(source);
  const node = document.child(0);
  const [segment] = latexParagraphText(node)!.segments;
  expect(segment!.text).toBe('“The solution”—\ufffc.');
  const formula = segment!.runs.find(({ kind }) => kind === 'math')!;
  expect(segment!.text.slice(formula.from, formula.to)).toBe('\ufffc');
  expect(node.nodeAt(formula.position)?.attrs.source).toBe('x=2');
  expect(serializeLatex(document)).toBe(source);
});
