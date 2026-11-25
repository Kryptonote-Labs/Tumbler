import { readLatexPackages, withLatexPackage } from './latex-preamble';
import { withLatexEmptyVersos } from './latex-page-start';
import { argument, groupAt, latexCommands, whitespaceEnd } from './latex-syntax';

import { latexSpacingValue, spacingCommands, type LatexLineSpacingChoice } from './latex-spacing';
export { latexLineSpacing } from './latex-spacing';

type Family = 'cmr' | 'lmr';

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
    if (authored.trim() === name) return prefix;
    const value = authored.trim() ? authored.replace(authored.trim(), () => name) : name;
    const updated = prefix.slice(0, group.from) + value + prefix.slice(group.to);
    return effectivePrefix === prefix ? withLatexEmptyVersos(updated) : updated;
  }
  if (classArgument(effectivePrefix))
    throw new Error('Change the class in the project file that declares it.');
  const newline = /\r\n|\n/.exec(prefix)?.[0] ?? '\n';
  return withLatexEmptyVersos('\\documentclass{' + name + '}' + newline + prefix);
}

export function setLatexLineSpacing(prefix: string, spacing: LatexLineSpacingChoice, effectivePrefix = prefix) {
  const value = latexSpacingValue(spacing);
  const next = typeof spacing === 'string' ? withLatexPackage(prefix, 'setspace', effectivePrefix) : prefix;
  // setstretch avoids the vertical skip added by singlespacing.
  const command = typeof spacing !== 'string' ? '\\linespread{' + value + '}' :
    spacing === 'single' ? '\\setstretch{1}' : '\\' + spacingCommands[spacing];
  return insertPreambleLine(next, command, /(?:^|(?<=\n))\\(?:setstretch\{1\}|onehalfspacing|doublespacing|linespread\{\d*\.?\d+\})\r?\n$/);
}

export function setLatexRomanFamily(prefix: string, family: Family, effectivePrefix = prefix) {
  const next = family === 'lmr' ? withLatexPackage(prefix, 'lmodern', effectivePrefix) : prefix;
  return insertPreambleLine(next, '\\renewcommand{\\rmdefault}{' + family + '}',
    /(?:^|(?<=\n))\\renewcommand\{\\rmdefault\}\{(?:cmr|lmr)\}\r?\n$/);
}
