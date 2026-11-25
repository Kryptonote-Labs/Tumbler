import { expect, test } from 'bun:test';
import { blankLatex, latexMarginSettings, latexPageLayout, latexPaperSettings, latexSheetLayout, parseLatex, serializeLatex, setLatexGeometry } from '../src/latex';

test('new files start with an explicit A4 sheet and one-inch margins', () => {
  expect(blankLatex).toContain(String.raw`\usepackage[a4paper,margin=1in]{geometry}`);
  expect(latexPaperSettings(blankLatex)).toMatchObject({ paperSize: 'a4paper', margin: '1in' });
});

test('geometry edits fold legacy overrides into the package and retain unrelated options', () => {
  const source = String.raw`\documentclass{article}
\usepackage{amsmath,geometry}
\geometry{paper=letterpaper, hmargin={20mm,25mm}, includehead}
% \geometry{margin=3in}
\geometry{landscape}
\geometry{margin=1in}
\begin{document}
\geometry{margin=4in}
\end{document}`;
  const updated = setLatexGeometry(source, { paperSize: 'a5paper', margin: '25mm' });
  expect(updated).toBe(String.raw`\documentclass{article}
\usepackage{amsmath}
\usepackage[a5paper,hmargin={20mm,25mm},includehead,landscape,margin=25mm]{geometry}
% \geometry{margin=3in}
\begin{document}
\geometry{margin=4in}
\end{document}`);
  expect(latexPaperSettings(updated)).toEqual({
    paperSize: 'a5paper',
    orientation: 'landscape',
    margin: '25mm',
  });
});

test('effective paper follows the output driver and explicit geometry', () => {
  const options = { defaultPaper: 'a4paper' } as const;
  expect(latexPaperSettings(String.raw`\documentclass{article}`, options).paperSize).toBe('a4paper');
  expect(latexPaperSettings(String.raw`\usepackage[letterpaper,landscape]{geometry}`, options).paperSize).toBe('letterpaper');
  expect(latexPaperSettings(String.raw`\usepackage{graphicx}`, options).paperSize).toBe('letterpaper');
});

test('geometry keeps overrides that depend on authored lengths at their original position', () => {
  const source = String.raw`\documentclass{article}
\usepackage[a4paper]{geometry}
\newlength{\mytop}
\setlength{\mytop}{1in}
\geometry{top=\mytop}
\geometry{paper=legalpaper,bottom=2in}
\begin{document}`;
  expect(setLatexGeometry(source, { paperSize: 'a5paper' })).toBe(String.raw`\documentclass{article}
\usepackage[a4paper]{geometry}
\newlength{\mytop}
\setlength{\mytop}{1in}
\geometry{top=\mytop}
\geometry{a5paper,bottom=2in}
\begin{document}`);
});

// Registers printed by pdfTeX with geometry 5.9. The text origin includes TeX's
// one-inch origin, and the vertical origin includes headheight and headsep.
test.each([
  ['thesis', 'a4paper,12pt,twoside', 'left=2cm,right=2cm,top=2cm,bottom=3cm', '',
    [597.50787, 845.04684, 56.9055, 56.9055, 56.9055, 483.69687, 702.78308, 30]],
  ['mirror margins with a gutter', 'a4paper,twoside',
    'margin=1in,inner=2cm,vmargin={20mm,30mm},outer=35mm,bindingoffset=5mm', '',
    [597.50787, 845.04684, 71.13187, 99.58464, 56.9055, 426.79137, 702.78308, 30]],
  ['one-sided gutter', 'a4paper', 'margin=1in,inner=2cm,outer=35mm,bindingoffset=5mm', '',
    [597.50787, 845.04684, 71.13187, 71.13187, 72.26999, 426.79137, 700.50687, 30]],
  ['landscape with explicit text dimensions', 'a4paper,twoside',
    'landscape,textwidth=20cm,textheight=15cm,right=2cm,top=3cm,bindingoffset=5mm', '',
    [845.04684, 597.50787, 219.08623, 56.9055, 85.35826, 569.05511, 426.79134, 30]],
  ['grouped and partial margins', 'a4paper,twoside', 'hmargin={2cm,4cm},top=2cm', '',
    [597.50787, 845.04684, 56.9055, 113.81102, 56.9055, 426.79135, 686.7347, 30]],
  ['header and footer within the total body', 'a4paper,twoside',
    'margin=2cm,includeheadfoot,headheight=15pt,headsep=10mm,footskip=30pt', '',
    [597.50787, 845.04684, 56.9055, 56.9055, 100.35825, 483.69687, 657.7831, 30]],
  ['preamble overrides', 'a4paper,twoside', 'margin=2cm,hmargin={25mm,40mm},textwidth=10cm',
    String.raw`\geometry{bottom=35mm,outer=10mm}`,
    [597.50787, 845.04684, 71.13188, 28.45274, 56.9055, 497.92325, 688.5567, 30]],
  ['two-sided defaults', 'a4paper,twoside', '', '',
    [597.50787, 845.04684, 71.70166, 107.55254, 101.40665, 418.25368, 591.5302, 30]],
  ['partial margins with ratios', 'a4paper,twoside',
    'left=2cm,bottom=3cm,hmarginratio=2:3,vmarginratio=1:1', '',
    [597.50787, 845.04684, 56.9055, 85.35825, 85.35826, 455.24413, 674.33032, 30]],
  ['offset layout area', 'a4paper,twoside',
    'layout=a5paper,layoutoffset={10mm,15mm},margin=2cm,bindingoffset=4mm', '',
    [597.50787, 845.04684, 96.73933, 85.35825, 99.58463, 295.90869, 483.69687, 30]],
  ['non-mirrored binding', 'a4paper', 'asymmetric,left=2cm,right=3cm,bindingoffset=5mm', '',
    [597.50787, 845.04684, 71.13187, 56.9055, 101.40665, 441.01775, 591.5302, 30]],
] as const)('matches pdfTeX for %s', (_name, classOptions, options, overrides, expected) => {
  const source = `\\documentclass[${classOptions}]{report}\n\\usepackage[${options}]{geometry}\n${overrides}`;
  const paper = latexPageLayout(source);
  const verso = latexSheetLayout(paper, 1);
  const textWidth = paper.width - paper.left - paper.right;
  const textHeight = paper.height - paper.top - paper.bottom;
  expect(verso.width - verso.left - verso.right).toBeCloseTo(textWidth, 8);
  const actual = [paper.width, paper.height, paper.left, verso.left, paper.top,
    textWidth, textHeight, paper.footerBaseline - paper.top - textHeight];
  for (const [index, points] of expected.entries())
    expect(actual[index]).toBeCloseTo(points * 96 / 72.27, 2);
});

test('margin edits replace competing constraints and keep unrelated geometry', () => {
  const source = String.raw`\documentclass[a4paper,12pt]{report}
\usepackage[margin=1in,includehead,headsep=8mm]{geometry}
\geometry{hmargin={20mm,35mm},textheight=200mm}
\begin{document}
Text
\end{document}`;
  expect(latexMarginSettings(source)).toMatchObject({
    twoSided: false, margins: { left: '20mm', right: '35mm', top: '1in', bottom: '1in' },
  });
  const margins = { top: '2cm', bottom: '3cm', left: '2cm', right: '35mm' };
  const updated = setLatexGeometry(source, { margins, twoSided: true, bindingOffset: '5mm' });
  expect(updated).toBe(String.raw`\documentclass[a4paper,12pt,twoside]{report}
\usepackage[includehead,headsep=8mm,top=2cm,bottom=3cm,inner=2cm,outer=35mm,bindingoffset=5mm]{geometry}
\begin{document}
Text
\end{document}`);
  expect(latexMarginSettings(updated)).toMatchObject({ twoSided: true, margins, bindingOffset: '5mm' });
  expect(serializeLatex(parseLatex(updated))).toBe(updated);
});

test('switching sides supersedes package options and the book default', () => {
  const source = String.raw`\documentclass[12pt]{book}
\usepackage[asymmetric,bindingoffset=5mm]{geometry}
\begin{document}`;
  const updated = setLatexGeometry(source, { twoSided: false });
  expect(updated).toContain(String.raw`\documentclass[12pt,oneside]{book}`);
  expect(updated).toContain(String.raw`\usepackage[bindingoffset=5mm]{geometry}`);
  expect(latexMarginSettings(updated).twoSided).toBe(false);
  expect(latexSheetLayout(latexPageLayout(updated), 1).left).toBe(latexPageLayout(updated).left);
});

test('geometry edits reject margins that leave no room for text', () => {
  const source = String.raw`\documentclass{article}
\usepackage[a4paper,margin=1in]{geometry}`;
  const noRoom = 'The margins leave no room for text.';
  expect(() => setLatexGeometry(source, { margin: '10.5cm' })).toThrow(noRoom);
  expect(() => setLatexGeometry(source, {
    margins: { left: '2cm', right: '2cm', top: '15cm', bottom: '15cm' },
  })).toThrow(noRoom);
  expect(() => setLatexGeometry(source, { bindingOffset: '17cm' })).toThrow(noRoom);
  expect(() => setLatexGeometry(String.raw`\documentclass[twoside]{article}
\usepackage[a4paper,left=18cm]{geometry}`, { twoSided: false })).toThrow(noRoom);
});

test('geometry edits use the new paper and orientation and allow positive text dimensions', () => {
  const source = String.raw`\documentclass{article}
\usepackage[a4paper,margin=1in]{geometry}`;
  const updated = setLatexGeometry(source, {
    paperSize: 'a3paper', orientation: 'landscape', twoSided: true, bindingOffset: '7.99cm',
    margins: { left: '17cm', right: '17cm', top: '2cm', bottom: '2cm' },
  });
  const { width, left, right } = latexPageLayout(updated);
  expect(width - left - right).toBeCloseTo(0.1 * 96 / 25.4, 6);
});

test.each(['margin=12cm', 'left=20cm', 'top=15cm,bottom=15cm', 'margin=10.5cm'])(
  'imported geometry with %s leaves room for text on both sides in the editor',
  (options) => {
    const source = `\\documentclass[twoside]{article}\\usepackage[a4paper,${options}]{geometry}`;
    const paper = latexPageLayout(source);
    for (const { width, height, left, right, top, bottom } of [paper, latexSheetLayout(paper, 1)]) {
      expect(width - left - right).toBeGreaterThan(0);
      expect(height - top - bottom).toBeGreaterThan(0);
    }
  },
);
