import { readLatexClass } from './latex-flow';
import type { Node } from 'prosemirror-model';
import { commandEnd, environmentAt, groupAt } from './latex-syntax';

export type LatexNumbering = {
  /** Heading positions and the number LaTeX prints, such as `2.1`, `A` or `I` for a part. */
  headings: Map<number, { number: string; command: string }>;
  /** Display equation positions, with one entry per row and null for an unnumbered row. */
  equations: Map<number, (string | null)[]>;
  /** Captioned figure and table positions. */
  floats: Map<number, { kind: 'figure' | 'table'; number: string }>;
  /** Label keys and the text `\ref` prints for them. */
  labels: Map<string, string>;
  /** Inline `\footnote` positions and the mark LaTeX prints, while the count is known. */
  footnotes: Map<number, string>;
};

// Commands and environments whose effect on counters the editor does not model.
const opaqueCounters =
  /\\(?:setcounter(?!\s*\{tocdepth\})|addtocounter|stepcounter|refstepcounter|numberwithin|counterwithin|counterwithout|frontmatter|mainmatter|backmatter|(?:re)?newcommand\s*\{?\\the[a-z]+)\b|\\begin\s*\{(?:multline|flalign|alignat|eqnarray|subequations|xalignat)\*?\}/;
const rawCounters =
  /\\(?:part|chapter|section|subsection|subsubsection|caption|captionof)\b|\\begin\s*\{(?:equation|align|gather|figure|table)\*?\}/;
const latexHeadings = ['section', 'subsection', 'subsubsection', 'paragraph', 'subparagraph'];
const floatEnvironment = /^\\begin\s*\{(figure|table|longtable)\*?\}/;
const subfloats = /\\begin\s*\{(subfigure|subtable)\}[\s\S]*?\\end\s*\{\1\}/g;
const numberedEquation = /^\\begin\s*\{(equation|align|gather)\}$/;
const labelCommand = /\\label\s*\{([^{}]+)\}/g;
const roman = (value: number) =>
  [
    ['M', 1000],
    ['CM', 900],
    ['D', 500],
    ['CD', 400],
    ['C', 100],
    ['XC', 90],
    ['L', 50],
    ['XL', 40],
    ['X', 10],
    ['IX', 9],
    ['V', 5],
    ['IV', 4],
    ['I', 1],
  ].reduce((result, [symbol, size]) => {
    while (value >= (size as number)) {
      result += symbol;
      value -= size as number;
    }
    return result;
  }, '');
const alph = (value: number) => (value > 0 && value <= 26 ? String.fromCharCode(64 + value) : '?');

/** Split an alignment body at top-level `\\`, ignoring a trailing empty row like amsmath does. */
export function latexEquationRows(source: string) {
  const rows: string[] = [];
  let start = 0;
  for (let position = 0; position < source.length; position++) {
    if (source[position] === '{') position = (groupAt(source, position)?.end ?? source.length) - 1;
    else if (source.startsWith('\\begin', position))
      position = (environmentAt(source, position)?.end ?? source.length) - 1;
    else if (source.startsWith('\\\\', position)) {
      rows.push(source.slice(start, position));
      start = position + 2;
      position++;
    } else if (source[position] === '\\') position = commandEnd(source, position) - 1;
  }
  const last = source.slice(start);
  if (last.trim() || !rows.length) rows.push(last);
  return rows;
}

/**
 * Number headings, equations, figures and tables the way the standard article, report and book
 * classes do, and resolve labels. Returns undefined when the source changes counters in ways the
 * editor does not model, so callers show no number rather than a wrong one.
 */
export function latexNumbering(document: Node): LatexNumbering | undefined {
  const prefix = String(document.attrs.prefix ?? '');
  const documentClass = readLatexClass(prefix).name;
  if (documentClass && !['article', 'report', 'book'].includes(documentClass.trim())) return;
  if (opaqueCounters.test(prefix)) return;
  const chapters = documentClass === 'report' || documentClass === 'book';
  const depth = chapters ? 2 : 3;
  const levels = ['part', 'chapter', ...latexHeadings];
  const counters = new Map(levels.map((name) => [name, 0]));
  let equation = 0;
  const floatCount = { figure: 0, table: 0 };
  let appendix = false;
  let current = '';
  let opaque = false;
  const result: LatexNumbering = {
    headings: new Map(),
    equations: new Map(),
    floats: new Map(),
    labels: new Map(),
    footnotes: new Map(),
  };
  let footnote = 0;
  // A footnote the editor cannot see, such as one in a caption, makes later marks unknown.
  let footnotesKnown = true;

  const value = (name: string): string => {
    const count = counters.get(name) ?? 0;
    if (name === 'part') return roman(count);
    const top = chapters ? 'chapter' : 'section';
    if (name === top) return appendix ? alph(count) : String(count);
    const parent = levels[levels.indexOf(name) - 1]!;
    return value(parent) + '.' + count;
  };
  const within = (count: number) => (chapters ? value('chapter') + '.' + count : String(count));
  const labelsIn = (source: string, text: string) => {
    for (const match of source.matchAll(labelCommand)) result.labels.set(match[1]!.trim(), text);
  };

  document.descendants((node, position) => {
    if (opaque) return false;
    const type = node.type.name;
    if (type === 'heading') {
      const open = String(node.attrs.open ?? '');
      const [, name = latexHeadings[node.attrs.level - 1] ?? 'section', star] =
        /^\\([a-z]+)(\*)?/.exec(open) ?? [];
      if (star || !counters.has(name)) return true;
      const level = levels.indexOf(name);
      if (name !== 'part' && level - 1 > depth) return true;
      counters.set(name, counters.get(name)! + 1);
      // A part does not restart chapter or section numbers.
      if (name !== 'part') for (const lower of levels.slice(level + 1)) counters.set(lower, 0);
      if (name === 'chapter') {
        equation = 0;
        footnote = 0;
        floatCount.figure = floatCount.table = 0;
      }
      current = value(name);
      result.headings.set(position, { number: current, command: name });
      return true;
    }
    if (type === 'latex_display_math') {
      const open = String(node.attrs.open ?? '');
      const source = String(node.attrs.source);
      const environment = numberedEquation.exec(open)?.[1];
      const rows = environment === 'equation' ? [source] : latexEquationRows(source);
      const numbers = rows.map((row) => {
        const tag = /\\tag\*?\s*\{([^{}]*)\}/.exec(row)?.[1];
        if (tag !== undefined) return tag;
        if (!environment || /\\(?:nonumber|notag)\b/.test(row)) return null;
        return within(++equation);
      });
      if (environment || numbers.some((number) => number !== null))
        result.equations.set(position, numbers);
      rows.forEach((row, index) => {
        const number = numbers[index];
        if (number != null) labelsIn(row, number);
      });
      return false;
    }
    if (type === 'latex_raw' || type === 'latex_inline') {
      const source = String(node.attrs.source);
      if (type === 'latex_inline' && /^\\footnote\s*\{/.test(source)) {
        if (footnotesKnown) result.footnotes.set(position, String(++footnote));
        if (/\\footnote(?:mark|text)?\b/.test(source.slice(9))) footnotesKnown = false;
        return false;
      }
      if (/\\footnote(?:mark|text)?\b/.test(source)) footnotesKnown = false;
      if (opaqueCounters.test(source)) {
        opaque = true;
        return false;
      }
      if (source.trim() === '\\appendix') {
        appendix = true;
        counters.set(chapters ? 'chapter' : 'section', 0);
        return false;
      }
      const environment = floatEnvironment.exec(source.trim())?.[1];
      const kind = environment === 'figure' ? 'figure' :
        environment === 'table' || environment === 'longtable' ? 'table' : undefined;
      if (kind) {
        const body = source.replace(subfloats, '');
        const captions = [...body.matchAll(/\\caption\b/g)];
        for (const [index, match] of captions.entries()) {
          const number = within(++floatCount[kind]);
          if (index === 0) result.floats.set(position, { kind, number });
          const next = captions[index + 1]?.index ?? body.length;
          labelsIn(body.slice(match.index, next), number);
        }
        return false;
      }
      if (rawCounters.test(source)) {
        opaque = true;
        return false;
      }
      // A label in plain text refers to the most recent numbered heading.
      if (type === 'latex_inline' && current) labelsIn(source, current);
      return false;
    }
    return true;
  });
  return opaque ? undefined : result;
}
