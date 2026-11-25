import { latexBaseClass, readLatexClass } from './latex-class';
import { updateLatexBoundary } from './latex-boundary-step';
import { geometrySides, readGeometry } from './latex-geometry';
import { readLatexPackages, withLatexPackage } from './latex-preamble';
import { latexEffectivePrefix } from './latex-project';
import { latexDocumentStartCommands } from './latex-syntax';
import type { Transform } from 'prosemirror-transform';

export const latexRightPageBreak = '\\cleardoublepage';

/** The standard class's page opening rules, including geometry side overrides. */
export function latexPageOpening(prefix: string) {
  const { name, options } = readLatexClass(prefix);
  const base = latexBaseClass(name);
  const book = base === 'book';
  const chaptered = book || base === 'report';
  const geometry = readGeometry(prefix);
  const { twoSided } = geometrySides(base, options, geometry.loaded ? geometry.options : []);
  const openRight = !options.includes('openany') && (book || options.includes('openright'));
  return { base, options, chaptered, twoSided, chapterOnRight: chaptered && twoSided && openRight };
}

function redefinesDoublePage(prefix: string, after = -1) {
  let active = after < 0;
  for (const { name, start, end } of latexDocumentStartCommands(prefix)) {
    if (start === after) active = true;
    if (active && /^(?:[gex]?def|let|(?:re)?newcommand|providecommand|DeclareRobustCommand)$/.test(name) &&
        /^\*?\s*(?:\{\s*)?\\cleardoublepage(?![A-Za-z@])/.test(prefix.slice(end))) return true;
  }
  return false;
}

/** Whether the standard odd-page padding uses the empty page style. */
export function latexEmptyVersos(prefix: string) {
  const policy = readLatexPackages(prefix).findLast(({ name }) => name === 'emptypage' || name === 'clrdblpg');
  if (!policy || redefinesDoublePage(prefix, policy.offset)) return false;
  if (policy.name === 'emptypage') return !policy.options.includes('even');
  const style = policy.options.findLast(option => /^style\s*=/.test(option));
  return style === undefined || /^style\s*=\s*(?:empty|\{empty\})$/.test(style);
}

/** Enable empty verso pages for standard two-sided layouts unless the source sets its own policy. */
export function withLatexEmptyVersos(prefix: string, effectivePrefix = prefix) {
  const { base, twoSided } = latexPageOpening(effectivePrefix);
  if (!twoSided || !['article', 'report', 'book', 'letter'].includes(base)) return prefix;
  if (readLatexPackages(effectivePrefix).some(({ name }) => name === 'clrdblpg')) return prefix;
  if (redefinesDoublePage(effectivePrefix)) return prefix;
  return withLatexPackage(prefix, 'emptypage', effectivePrefix);
}

/** Use empty verso padding when authoring right-hand starts in a two-sided document. */
export function enableLatexEmptyVersos(tr: Transform) {
  const prefix = String(tr.doc.attrs.prefix);
  updateLatexBoundary(tr, 'prefix', withLatexEmptyVersos(prefix, latexEffectivePrefix(tr.doc)));
}

/** The explicit right-page break at the start of an authored page, if any. */
export function latexRightPagePrefix(source: string) {
  return /^\\cleardoublepage(?![A-Za-z@])\s*/.exec(source)?.[0] ?? '';
}
