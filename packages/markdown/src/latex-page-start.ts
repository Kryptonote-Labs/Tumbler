import { latexBaseClass, readLatexClass } from './latex-class';

export const latexRightPageBreak = '\\cleardoublepage';

/** The standard class's page opening rules, based on its base class and options. */
export function latexPageOpening(prefix: string) {
  const { name, options } = readLatexClass(prefix);
  const base = latexBaseClass(name);
  const book = base === 'book';
  const chaptered = book || base === 'report';
  const twoSided = options.includes('twoside') || (book && !options.includes('oneside'));
  const openRight = !options.includes('openany') && (book || options.includes('openright'));
  return { base, options, chaptered, twoSided, chapterOnRight: chaptered && twoSided && openRight };
}

/** The explicit right-page break at the start of an authored page, if any. */
export function latexRightPagePrefix(source: string) {
  return /^\\cleardoublepage(?![A-Za-z@])\s*/.exec(source)?.[0] ?? '';
}
