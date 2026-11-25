import { latexLength } from './latex-lengths';
import { commandEnd, groupAt, whitespaceEnd } from './latex-syntax';

/** The infinite part of TeX glue. Only the highest non-zero order stretches. */
export type LatexFill = { order: 1 | 2 | 3; weight: number };

export function latexFillShares(fills: readonly LatexFill[]) {
  const totals = [0, 0, 0, 0];
  for (const { order, weight } of fills) totals[order] = totals[order]! + weight;
  const order = totals.findLastIndex((total) => total !== 0);
  return fills.map((fill) => fill.order === order ? fill.weight / totals[order]! : 0);
}

export function latexVerticalLength(length: string, fixed: (value: string) => number | undefined = latexLength) {
  const stretch = /^\\stretch\s*\{\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*\}$/.exec(length);
  const weight = length === '\\fill' ? 1 : Number(stretch?.[1]);
  if (Number.isFinite(weight)) return { height: 0, fill: { order: 2 as const, weight } };
  const height = fixed(length);
  if (height !== undefined) return { height, fill: undefined };
}

/** Read a fixed or flexible \vspace command while retaining its authored span. */
export function latexVerticalSpace(source: string, start = 0) {
  const end = commandEnd(source, start);
  if (source.slice(start, end) !== '\\vspace') return;
  const at = whitespaceEnd(source, end);
  const starred = source[at] === '*';
  const group = groupAt(source, whitespaceEnd(source, at + Number(starred)));
  if (!group) return;
  const length = source.slice(group.from, group.to).trim();
  const glue = latexVerticalLength(length, (value) => latexLength(value, 1, 1));
  if (!glue) return;
  const unit = length.endsWith('em') ? 'em' : length.endsWith('ex') ? 'ex' : 'px';
  return { ...glue, unit, starred, length, end: group.end };
}
