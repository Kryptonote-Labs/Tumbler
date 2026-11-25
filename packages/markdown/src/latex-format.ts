import { readLatexPackages, withLatexPackage } from './latex-preamble';
import { argument, groupAt, latexCommands, whitespaceEnd } from './latex-syntax';

const spacingCommands = {
  single: 'singlespacing',
  onehalf: 'onehalfspacing',
  double: 'doublespacing',
} as const;

type Spacing = keyof typeof spacingCommands;
type Family = 'cmr' | 'lmr';


export function latexLineSpacing(
  prefix: string,
  points = 10,
): { mode: Spacing | 'custom'; stretch: number } {
  let mode: Spacing | 'custom' = 'single';
  let stretch = 1;
  const size = points === 12 ? 2 : points === 11 ? 1 : 0;
  const factors = { single: 1, onehalf: [1.25, 1.213, 1.241][size]!, double: [1.667, 1.618, 1.655][size]! };
  const setspace = readLatexPackages(prefix).find((entry) => entry.name === 'setspace');
  function preset(value: Spacing) {
    mode = value;
    stretch = factors[value];
  }
  for (const { name, start, end } of latexCommands(prefix)) {
    if (start === setspace?.offset) {
      // setspace processes its known options in declaration order.
      if (setspace.options.includes('singlespacing')) preset('single');
      if (setspace.options.includes('onehalfspacing')) preset('onehalf');
      if (setspace.options.includes('doublespacing')) preset('double');
    }
    if (setspace && start > setspace.offset) {
      if (name === 'singlespacing') preset('single');
      if (name === 'onehalfspacing') preset('onehalf');
      if (name === 'doublespacing') preset('double');
    }
    if (name !== 'setstretch' && name !== 'renewcommand' && name !== 'linespread') continue;
    const first = argument(prefix, end);
    const value =
      name === 'linespread' || (name === 'setstretch' && setspace) ? first?.value :
      name === 'renewcommand' && first?.value === '\\baselinestretch'
        ? argument(prefix, first.end)?.value
        : undefined;
    if (value && /^\d*\.?\d+$/.test(value) && Number(value) > 0 && Number.isFinite(Number(value))) {
      stretch = Number(value);
      mode = stretch === 1 ? 'single' : 'custom';
    }
  }
  return { mode, stretch };
}

export function latexRomanFamily(prefix: string) {
  let family: string | undefined;
  const lmodern = readLatexPackages(prefix).find((entry) => entry.name === 'lmodern');
  for (const { name, start, end } of latexCommands(prefix)) {
    if (start === lmodern?.offset) family = 'lmr';
    if (name !== 'renewcommand') continue;
    const first = argument(prefix, end);
    if (first?.value === '\\rmdefault') family = argument(prefix, first.end)?.value;
  }
  return family;
}

function insertPreambleLine(prefix: string, line: string, replace?: RegExp) {
  const begin = [...latexCommands(prefix)].find(
    ({ name, end }) => name === 'begin' && argument(prefix, end)?.value === 'document',
  );
  if (!begin) throw new Error('This file has no preamble.');
  const newline = /\r\n|\n/.exec(prefix)?.[0] ?? '\n';
  const end = prefix.slice(0, begin.start);
  const before = replace ? end.replace(replace, '') : end;
  return before + (before && !before.endsWith('\n') ? newline : '') + line + newline + prefix.slice(begin.start);
}

function classArgument(prefix: string) {
  for (const { name, end } of latexCommands(prefix)) {
    if (name !== 'documentclass') continue;
    const start = whitespaceEnd(prefix, end);
    const options = groupAt(prefix, start, '[', ']');
    const group = groupAt(prefix, whitespaceEnd(prefix, options?.end ?? start));
    if (group) return group;
  }
}

/** The authored class name, without resolving a local class to its base class. */
export function latexDocumentClassName(prefix: string) {
  const group = classArgument(prefix);
  return group && prefix.slice(group.from, group.to).trim();
}

export function setLatexDocumentClass(prefix: string, name: string, effectivePrefix = prefix) {
  if (!/^[\w./@+-]+$/.test(name)) throw new Error('Enter a LaTeX class name.');
  const group = classArgument(prefix);
  if (group) {
    const authored = prefix.slice(group.from, group.to);
    return prefix.slice(0, group.from) + (authored.trim() ? authored.replace(authored.trim(), () => name) : name) + prefix.slice(group.to);
  }
  if (classArgument(effectivePrefix))
    throw new Error('Change the class in the project file that declares it.');
  const newline = /\r\n|\n/.exec(prefix)?.[0] ?? '\n';
  return '\\documentclass{' + name + '}' + newline + prefix;
}

export function setLatexLineSpacing(prefix: string, spacing: Spacing, effectivePrefix = prefix) {
  const next = withLatexPackage(prefix, 'setspace', effectivePrefix);
  // Using setstretch for Single avoids singlespacing's additional vertical skip.
  const command = spacing === 'single' ? '\\setstretch{1}' : '\\' + spacingCommands[spacing];
  return insertPreambleLine(next, command, /(?:^|(?<=\n))\\(?:setstretch\{1\}|onehalfspacing|doublespacing)\r?\n$/);
}

export function setLatexRomanFamily(prefix: string, family: Family, effectivePrefix = prefix) {
  const next = family === 'lmr' ? withLatexPackage(prefix, 'lmodern', effectivePrefix) : prefix;
  return insertPreambleLine(next, '\\renewcommand{\\rmdefault}{' + family + '}',
    /(?:^|(?<=\n))\\renewcommand\{\\rmdefault\}\{(?:cmr|lmr)\}\r?\n$/);
}
