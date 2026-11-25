import { isLatexHeading } from './latex-spec';
import { latexEffectivePrefix } from './latex-project';
import { readLatexSubfigures } from './latex-figures';
import { readLatexCodeBlock } from './latex-code';
import { latexBoxTitle, latexEnvironmentName, latexEnvironmentOption, readLatexTheorems, type LatexTheoremStyle } from './latex-environments';
import { readLatexTextMacros } from './latex-macros';
import { latexRomanNumber } from './latex-number-format';
import { readLatexBookMatter, readLatexClass } from './latex-flow';
import type { Node } from 'prosemirror-model';
import { commandEnd, environmentAt, groupAt, latexCommands, whitespaceEnd } from './latex-syntax';

export type LatexNumbering = {
  /** Heading positions and the number LaTeX prints, such as `2.1`, `A` or `I` for a part. */
  headings: Map<number, { number: string; command: string; appendix?: true }>;
  /** Display equation positions, with one entry per row and null for an unnumbered row. */
  equations: Map<number, (string | null)[]>;
  /** Captioned figure and table positions. */
  floats: Map<number, { kind: 'figure' | 'table'; number: string }>;
  /** Label keys and the text `\ref` prints for them. */
  labels: Map<string, string>;
  labelTypes: Map<string, string>;
  algorithms: Map<number, string>;
  listings: Map<number, string>;
  containers: Map<number, { title: string; kind: 'theorem' | 'proof' | 'box'; style?: LatexTheoremStyle }>;
  /** Inline `\footnote` positions and the mark LaTeX prints, while the count is known. */
  footnotes: Map<number, string>;
};

// Commands and environments whose effect on counters the editor does not model.
const opaqueCounters =
  /\\(?:setcounter(?!\s*\{(?:tocdepth|secnumdepth)\})|addtocounter|stepcounter|refstepcounter|numberwithin|counterwithin|counterwithout|(?:(?:re)?newcommand\*?|(?:g|e|x)?def)\s*\{?\\the(?:part|chapter|section|subsection|subsubsection|paragraph|subparagraph|equation|figure|table|footnote|lstlisting)(?![A-Za-z@]))\b|\\begin\s*\{(?:multline|flalign|alignat|eqnarray|subequations|xalignat)\*?\}/;
const counterAt = new RegExp(opaqueCounters.source, 'y');
const standardAppendix = /^\s*\\par\s*\\setcounter\s*\{chapter\}\s*\{0\}\s*\\setcounter\s*\{section\}\s*\{0\}(?:\s*\\def\s*\\[A-Za-z@]+[0-9]*\s*\{Appendix\})+\s*\\def\s*\\thechapter\s*\{\s*\\Alph\s*\{chapter\}\s*\}\s*$/;
const rawCounters =
  /\\(?:part|chapter|section|subsection|subsubsection|caption|captionof)\b|\\begin\s*\{(?:equation|align|gather|figure|table)\*?\}/;
const latexHeadings = ['section', 'subsection', 'subsubsection', 'paragraph', 'subparagraph'];
const floatEnvironment = /^\\begin\s*\{(figure|table|longtable)\*?\}/;
const subfloats = /\\begin\s*\{(subfigure|subtable)\}[\s\S]*?\\end\s*\{\1\}/g;
const numberedEquation = /^\\begin\s*\{(equation|align|gather)\}$/;
const labelCommand = /\\label\s*\{([^{}]+)\}/g;
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

function* sectionDepthAssignments(source: string): Generator<string | undefined> {
  const deferred: string[] = [];
  let inactive = 0;
  for (const command of latexCommands(source)) {
    if (command.name === 'fi' && inactive) {
      inactive--;
      continue;
    }
    if (command.name === 'else' && inactive === 1) {
      inactive = 0;
      continue;
    }
    if (command.name === 'iffalse' || (inactive && command.name.startsWith('if'))) inactive++;
    if (inactive) continue;
    const argument = groupAt(source, whitespaceEnd(source, command.end));
    if (!argument) continue;
    const name = source.slice(argument.from, argument.to);
    if (command.name === 'AtBeginDocument') {
      deferred.push(name);
      continue;
    }
    if (command.name !== 'setcounter' || name !== 'secnumdepth') continue;
    const value = groupAt(source, whitespaceEnd(source, argument.end));
    yield value && source.slice(value.from, value.to).trim();
  }
  for (const body of deferred) yield* sectionDepthAssignments(body);
}

/**
 * Number headings, equations, figures and tables the way the standard article, report and book
 * classes do, and resolve labels. Returns undefined when the source changes counters in ways the
 * editor does not model, so callers show no number rather than a wrong one.
 */
export function latexNumbering(document: Node): LatexNumbering | undefined {
  const prefix = latexEffectivePrefix(document);
  const documentClass = readLatexClass(prefix).name;
  if (documentClass && !['article', 'report', 'book'].includes(documentClass.trim())) return;
  const theoremDefinitions = readLatexTheorems(prefix);
  const theoremCounters = new Set([...theoremDefinitions.values()].map(({ counter }) => counter));
  const changesTheoremNumber = (source: string) =>
    [...source.matchAll(/\\(?:(?:re)?newcommand\*?|(?:g|e|x)?def)\s*\{?\\the([A-Za-z@]+)(?![A-Za-z@])/g)]
      .some((match) => theoremCounters.has(match[1]));
  // A literal preamble declaration resets the equation counter whenever its parent advances.
  // Leave opaque counter changes to TeX, including changes nested in a macro or condition.
  const equationParentCommand = /\\(?:numberwithin|counterwithin)\s*\{equation\}\s*\{(chapter|section|subsection|subsubsection)\}/y;
  let equationParent = documentClass === 'article' || !documentClass ? undefined : 'chapter';
  let remainingPrefix = prefix;
  if (![...latexCommands(prefix)].some(({ name }) => /^if[A-Za-z@]*$/.test(name))) {
    let declaredParent: string | undefined;
    for (const command of [...latexCommands(prefix)].reverse()) {
      equationParentCommand.lastIndex = command.start;
      const relation = equationParentCommand.exec(prefix);
      if (!relation) continue;
      const parent = relation[1]!;
      if (declaredParent && declaredParent !== parent) return;
      declaredParent = equationParent = parent;
      remainingPrefix = remainingPrefix.slice(0, command.start) + remainingPrefix.slice(command.start + relation[0].length);
    }
  }
  const macros = readLatexTextMacros(prefix);
  function modifiesCounters(source: string): boolean {
    const pending = [source];
    const visited = new Set<string>();
    while (pending.length) {
      const body = pending.pop()!;
      if (visited.has(body)) continue;
      visited.add(body);
      if (changesTheoremNumber(body)) return true;
      for (const command of latexCommands(body)) {
        counterAt.lastIndex = command.start;
        if (counterAt.test(body)) return true;
        if (command.name === 'AtBeginDocument') {
          const hook = groupAt(body, whitespaceEnd(body, command.end));
          if (hook) pending.push(body.slice(hook.from, hook.to));
        }
        const macro = macros.get(command.name);
        if (macro && !(command.name === 'appendix' && standardAppendix.test(macro.replacement)))
          pending.push(macro.replacement);
      }
    }
    return false;
  }
  // Literal macro definitions are inert until TeX executes their calls.
  let declarationTarget = -1;
  for (const command of latexCommands(remainingPrefix)) {
    if (command.start === declarationTarget) continue;
    if (/^(?:[gex]?def|(?:re|provide)?newcommand|renewcommand|providecommand|DeclareRobustCommand)$/.test(command.name))
      declarationTarget = whitespaceEnd(remainingPrefix, command.end + Number(remainingPrefix[command.end] === '*'));
    counterAt.lastIndex = command.start;
    if (counterAt.test(remainingPrefix)) return;
    if (macros.has(command.name) &&
        modifiesCounters(remainingPrefix.slice(command.start, command.end))) return;
    if (command.name === 'AtBeginDocument') {
      const body = groupAt(remainingPrefix, whitespaceEnd(remainingPrefix, command.end));
      if (body && modifiesCounters(remainingPrefix.slice(body.from, body.to))) return;
    }
  }
  if (changesTheoremNumber(prefix)) return;
  const chapters = documentClass === 'report' || documentClass === 'book';
  let depth = chapters ? 2 : 3;
  for (const literal of sectionDepthAssignments(prefix)) {
    if (!literal || !/^[+-]?\d+$/.test(literal)) return;
    depth = Number(literal);
  }
  const levels = ['part', 'chapter', ...latexHeadings];
  const counters = new Map(levels.map((name) => [name, 0]));
  let equation = 0;
  let listing = 0;
  const floatCount = { figure: 0, table: 0 };
  let appendix = false;
  let mainMatter = true;
  let current: { number: string; type: string } | undefined;
  let algorithm = 0;
  const theoremCounts = new Map<string, number>();
  const labelScopes: { end: number; previous: typeof current }[] = [];
  let opaque = false;
  const result: LatexNumbering = {
    headings: new Map(),
    equations: new Map(),
    floats: new Map(),
    labels: new Map(),
    labelTypes: new Map(),
    algorithms: new Map(),
    containers: new Map(),
    listings: new Map(),
    footnotes: new Map(),
  };
  let footnote = 0;
  // A footnote the editor cannot see, such as one in a caption, makes later marks unknown.
  let footnotesKnown = true;

  const value = (name: string): string => {
    const count = counters.get(name) ?? 0;
    if (name === 'part') return latexRomanNumber(count);
    const top = chapters ? 'chapter' : 'section';
    if (name === top) return appendix ? alph(count) : String(count);
    const parent = levels[levels.indexOf(name) - 1]!;
    return value(parent) + '.' + count;
  };
  const within = (count: number) => (chapters ? value('chapter') + '.' + count : String(count));
  const labelsIn = (source: string, text: string, kind: string) => {
    for (const match of source.matchAll(labelCommand)) {
      const key = match[1]!.trim();
      result.labels.set(key, text);
      result.labelTypes.set(key, kind);
    }
  };

  document.descendants((node, position) => {
    if (opaque) return false;
    while (labelScopes.length && position >= labelScopes.at(-1)!.end)
      current = labelScopes.pop()!.previous;
    const type = node.type.name;
    if (type === 'latex_container') {
      const open = String(node.attrs.open ?? '');
      const name = latexEnvironmentName(open);
      const theorem = name && theoremDefinitions.get(name);
      const option = latexEnvironmentOption(open);
      if (name === 'proof') result.containers.set(position, { title: (option ?? 'Proof') + '.', kind: 'proof' });
      else if (name === 'tcolorbox') result.containers.set(position, { title: latexBoxTitle(open) ?? '', kind: 'box' });
      else if (theorem) {
        let number = '';
        if (theorem.counter) {
          const within = theorem.within ?? theoremDefinitions.get(theorem.counter)?.within;
          const scope = within && counters.has(within) ? value(within) : '';
          const key = theorem.counter + ':' + scope;
          const next = (theoremCounts.get(key) ?? 0) + 1;
          theoremCounts.set(key, next);
          number = scope ? scope + '.' + next : String(next);
          labelScopes.push({ end: position + node.nodeSize, previous: current });
          current = { number, type: name };
        }
        result.containers.set(position, {
          title: theorem.title + (number ? ' ' + number : '') + (option ? ' (' + option + ')' : '') + '.',
          kind: 'theorem',
          ...(theorem.style && { style: theorem.style }),
        });
      }
      return true;
    }
    if (isLatexHeading(node)) {
      const open = String(node.attrs.open ?? '');
      const [, name = latexHeadings[node.attrs.level - 1] ?? 'section', star] =
        /^\\([a-z]+)(\*)?/.exec(open) ?? [];
      if (star || !counters.has(name)) return true;
      if (name === 'chapter' && !mainMatter) {
        result.headings.set(position, { number: '', command: name });
        return true;
      }
      const level = levels.indexOf(name);
      if ((name === 'part' && !chapters ? 0 : level - 1) > depth) return true;
      counters.set(name, counters.get(name)! + 1);
      // A part does not restart chapter or section numbers.
      if (name !== 'part') for (const lower of levels.slice(level + 1)) counters.set(lower, 0);
      if (equationParent && level <= levels.indexOf(equationParent) && name !== 'part') equation = 0;
      if (name === 'chapter') {
        listing = 0;
        footnote = 0;
        floatCount.figure = floatCount.table = 0;
      }
      current = { number: value(name), type: appendix && name === (chapters ? 'chapter' : 'section') ? 'appendix' : name };
      result.headings.set(position, { number: current.number, command: name, ...(appendix && name === 'chapter' ? { appendix: true } : {}) });
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
        equation++;
        return equationParent ? value(equationParent) + '.' + equation : String(equation);
      });
      if (environment || numbers.some((number) => number !== null))
        result.equations.set(position, numbers);
      rows.forEach((row, index) => {
        const number = numbers[index];
        if (number != null) labelsIn(row, number, 'equation');
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
      if (modifiesCounters(source) || !sectionDepthAssignments(source).next().done) {
        opaque = true;
        return false;
      }
      const matter = documentClass === 'book' && readLatexBookMatter(source);
      if (matter) {
        mainMatter = matter === 'main';
        return false;
      }
      if (source.trim() === '\\appendix') {
        appendix = true;
        counters.set(chapters ? 'chapter' : 'section', 0);
        return false;
      }
      if (type === 'latex_raw' && /^\\begin\s*\{(?:lstlisting|verbatim\*?)\}/.test(source)) {
        const code = readLatexCodeBlock(source);
        if (code?.caption) {
          const number = within(++listing);
          result.listings.set(position, number);
          if (code.label) {
            result.labels.set(code.label, number);
            result.labelTypes.set(code.label, 'listing');
          }
        }
        return false;
      }
      if (type === 'latex_raw' && /^\\begin\s*\{algorithm\*?\}/.test(source.trim())) {
        const caption = /\\caption\b/.exec(source);
        if (caption) {
          const number = String(++algorithm);
          result.algorithms.set(position, number);
          labelsIn(source.slice(caption.index), number, 'algorithm');
        }
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
          if (index === 0) {
            result.floats.set(position, { kind, number });
            const panels = readLatexSubfigures(source).filter(panel => panel.caption);
            panels.forEach((panel, index) => {
              if (panel.label) result.labels.set(panel.label, number + alph(index + 1).toLowerCase());
            });
          }
          const next = captions[index + 1]?.index ?? body.length;
          labelsIn(body.slice(match.index, next), number, kind);
        }
        return false;
      }
      if (rawCounters.test(source)) {
        opaque = true;
        return false;
      }
      // A label in plain text refers to the most recent numbered heading.
      if (type === 'latex_inline' && current) labelsIn(source, current.number, current.type);
      return false;
    }
    return true;
  });
  return opaque ? undefined : result;
}
