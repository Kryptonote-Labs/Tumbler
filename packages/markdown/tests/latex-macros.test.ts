import { expect, test } from 'bun:test';
import { interpretLatexText, latexPageLayout, readLatexTextMacros } from '../src/latex';

test('optional defaults, aliases, and formatting compose into printed inline content', () => {
  const macros = readLatexTextMacros(String.raw`
% \newcommand{\total}[1]{Ignored}
\newcommand{\amount}[2][USD]{\textbf{#1 \$#2}}
\newcommand{\total}[1]{\amount{#1}}
\providecommand{\total}[1]{Ignored}
\newcommand{\recursive}{\recursive}`);
  expect(interpretLatexText(String.raw`\total{5}`, macros)).toEqual([
    { style: 'strong', content: ['USD ', '$', '5'] },
  ]);
  expect(interpretLatexText(String.raw`\amount[CAD]{8}`, macros)).toEqual([
    { style: 'strong', content: ['CAD ', '$', '8'] },
  ]);
  expect(interpretLatexText(String.raw`\recursive`, macros)).toBeUndefined();
  expect(interpretLatexText(String.raw`\unknown{5}`, macros)).toBeUndefined();
});

test('the output driver can change the sheet without changing the class text block', () => {
  const source = String.raw`\documentclass[letterpaper]{article}`;
  const logical = latexPageLayout(source);
  const physical = latexPageLayout(source, { defaultPaper: 'a4paper' });
  expect(physical.width).toBeCloseTo(210 * 96 / 25.4, 4);
  expect(physical.height).toBeCloseTo(297 * 96 / 25.4, 4);
  expect(physical.left).toBe(logical.left);
  expect(physical.top).toBe(logical.top);
  expect(physical.width - physical.left - physical.right).toBeCloseTo(logical.width - logical.left - logical.right, 4);
  expect(physical.footerBaseline).toBeCloseTo(logical.footerBaseline, 4);
  const explicit = latexPageLayout(source + String.raw`\usepackage{geometry}`, { defaultPaper: 'a4paper' });
  expect(explicit.width).toBe(logical.width);
});
