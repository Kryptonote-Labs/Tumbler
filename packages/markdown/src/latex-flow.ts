import { isLatexHeading } from './latex-spec';
import { latexEffectivePrefix } from './latex-project';
import { latexColourDefinition } from './latex-colour';
import { latexLetterCommandAt } from './latex-letter';
import { latexRomanNumber } from './latex-number-format';
import type { Node } from 'prosemirror-model';
import { commandEnd, groupAt, latexCommands, whitespaceEnd } from './latex-syntax';

export type LatexBreak = 'column' | 'page' | 'recto';
type FolioStyle = 'roman' | 'arabic';

/** A source command can occupy no space, or constrain where visible content flows. */
export type LatexBlockFlow =
  | { kind: 'break'; boundary: LatexBreak }
  | { kind: 'omit' }
  | {
      kind: 'content';
      before?: LatexBreak;
      wideFloat?: true;
      after?: LatexBreak;
      folio?: { visible: false; restartAfter: boolean };
      numbering?: FolioStyle;
    };

export type LatexPageNumber = { number: number; visible: boolean; style?: 'roman' };

export function latexPageLabel(folio: LatexPageNumber) {
  return folio.style === 'roman' ? latexRomanNumber(folio.number).toLowerCase() : String(folio.number);
}

export function readLatexBookMatter(source: string) {
  switch (source.trim()) {
    case '\\frontmatter': return 'front';
    case '\\mainmatter': return 'main';
    case '\\backmatter': return 'back';
  }
}

export function readLatexClass(source: string): { name: string; options: string[] } {
  for (const { name, end } of latexCommands(source)) {
    if (name !== 'documentclass') continue;
    const start = whitespaceEnd(source, end);
    const optional = groupAt(source, start, '[', ']');
    const required = groupAt(source, whitespaceEnd(source, optional?.end ?? start));
    if (required) {
      return {
        name: source.slice(required.from, required.to).trim(),
        options: optional
          ? source
              .slice(optional.from, optional.to)
              .replace(/(?<!\\)%[^\r\n]*/g, '')
              .split(',')
              .map((option) => option.trim())
          : [],
      };
    }
  }
  return { name: 'article', options: [] };
}

export function latexBreakCommand(source: string): LatexBreak | undefined {
  switch (source.trim()) {
    case '\\newpage':
      return 'column';
    case '\\clearpage':
      return 'page';
    case '\\cleardoublepage':
      return 'recto';
  }
}

const chapterLists = new Set(['tableofcontents', 'listoffigures', 'listoftables']);

/** Resolve source directives into layout effects at editor positions. Unknown classes keep
 * explicit break commands. The measured layout and edit history remain independent. */
export function latexFlow(document: Node): ReadonlyMap<number, LatexBlockFlow> {
  const { name, options } = readLatexClass(latexEffectivePrefix(document));
  const chapters = name === 'report' || name === 'book';
  const columns = options.includes('twocolumn');
  const standard = chapters || name === 'article';
  const openRight = options.findLast((option) => option === 'openright' || option === 'openany');
  const twoSided = options.findLast((option) => option === 'twoside' || option === 'oneside');
  const recto = twoSided ? twoSided === 'twoside' : name === 'book';
  const chapterBoundary: LatexBreak =
    recto && (openRight ? openRight === 'openright' : name === 'book') ? 'recto' : 'page';
  const titleOption = options.findLast(
    (option) => option === 'titlepage' || option === 'notitlepage',
  );
  const titlePage = standard && (titleOption ? titleOption === 'titlepage' : chapters);
  const flow = new Map<number, LatexBlockFlow>();
  const included: { node: Node; position: number }[] = [];
  let titlePrinted = false;
  let numbering: FolioStyle | undefined;

  document.descendants((node, position) => {
    if (node.type.name === 'latex_include' && /^\\include\b/.test(node.attrs.open ?? ''))
      included.push({ node, position });
    const source = node.type.name === 'latex_raw' ? String(node.attrs.source).trim() : '';
    const letterCommand = name === 'letter' && latexLetterCommandAt(source, 0);
    if ((standard && source === '\\appendix') || latexColourDefinition(source) || (letterCommand && ['address', 'signature', 'name', 'date'].includes(letterCommand.command))) {
      flow.set(position, { kind: 'omit' });
      return false;
    }
    const matter = name === 'book' && readLatexBookMatter(source);
    if (matter) {
      flow.set(position, { kind: 'break', boundary: matter === 'back' ? chapterBoundary : recto ? 'recto' : 'page' });
      if (matter !== 'back') numbering = matter === 'front' ? 'roman' : 'arabic';
      return false;
    }
    const explicit = latexBreakCommand(source);
    if (explicit) {
      flow.set(position, { kind: 'break', boundary: explicit === 'recto' && !recto ? 'page' : explicit });
      return false;
    }
    if (numbering && node.isBlock && (node.isAtom || node.isTextblock)) {
      flow.set(position, { kind: 'content', numbering });
      numbering = undefined;
    }
    const effect = (change: Omit<Extract<LatexBlockFlow, { kind: 'content' }>, 'kind'>) => {
      flow.set(position, { ...flow.get(position), ...change, kind: 'content' });
    };
    if (isLatexHeading(node) && chapters) {
      const open = String(node.attrs.open ?? '');
      const command = open.slice(1, commandEnd(open, 0));
      if (command === 'chapter' || command === 'part') {
        effect(command === 'chapter'
          ? { before: chapterBoundary }
          : { before: chapterBoundary, after: chapterBoundary });
      }
    } else if (node.type.name === 'latex_raw') {
      if (name === 'letter' && /^\\opening\s*\{/.test(source)) {
        effect({ before: 'page', numbering: 'arabic', folio: { visible: false, restartAfter: false } });
        return;
      }
      if (name === 'beamer' && /^\\begin\s*\{frame\}/.test(source)) {
        effect({ before: 'page', after: 'page' });
        return;
      }
      if (columns && /^\\begin\s*\{figure\*\}/.test(source)) {
        effect({ wideFloat: true });
        return;
      }
      const command = source.slice(1, commandEnd(source, 0));
      if (source !== '\\' + command) return;
      if (command === 'maketitle' && titlePage && !titlePrinted) {
        titlePrinted = true;
        effect({
          before: name === 'book' && recto ? 'recto' : 'page',
          after: 'page',
          folio: { visible: false, restartAfter: !recto },
        });
      } else if (chapters && chapterLists.has(command)) {
        effect({ before: chapterBoundary });
      }
    }
  });
  for (const { node, position } of included) {
    let first: number | undefined;
    let last: number | undefined;
    node.descendants((child, relative) => {
      if (!child.isBlock || (!child.isAtom && !child.isTextblock)) return;
      const at = position + relative + 1;
      const rule = flow.get(at);
      if (!rule || rule.kind === 'content') {
        first ??= at;
        last = at;
      }
      return false;
    });
    if (first === undefined || last === undefined) continue;
    const start = flow.get(first);
    flow.set(first, { ...start, kind: 'content', before: start?.kind === 'content' && start.before === 'recto' ? 'recto' : 'page' });
    const end = flow.get(last);
    flow.set(last, { ...end, kind: 'content', after: end?.kind === 'content' && end.after === 'recto' ? 'recto' : 'page' });
  }
  return flow;
}

/** Resolve printed page numbers from the physical page starts returned by layout. */
export function latexPageNumbers(
  flow: ReadonlyMap<number, LatexBlockFlow>,
  pageStarts: readonly number[],
): LatexPageNumber[] {
  const overrides = new Map<number, { visible: false; restartAfter: boolean }>();
  const resets = new Map<number, FolioStyle>();
  for (const [position, effect] of flow) {
    if (effect.kind !== 'content') continue;
    const page = pageStarts.findLastIndex(start => start <= position) + 1;
    if (effect.folio) overrides.set(page, effect.folio);
    if (effect.numbering) resets.set(page, effect.numbering);
  }
  let number = 1;
  let style: FolioStyle = 'arabic';
  return Array.from({ length: pageStarts.length + 1 }, (_, page) => {
    const override = overrides.get(page);
    const reset = resets.get(page);
    if (reset) {
      style = reset;
      number = 1;
    }
    const folio: LatexPageNumber = { number, visible: override?.visible ?? true, ...(style === 'roman' ? { style } : {}) };
    number = override?.restartAfter ? 1 : number + 1;
    return folio;
  });
}
