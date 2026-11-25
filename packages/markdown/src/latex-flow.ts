import { readLatexClass } from './latex-class';
import { readLatexSpacingCommand } from './latex-spacing-syntax';
import { latexComposedPageKind } from './latex-page-composition';
import { hasStandardBookAbstract, latexAbstractAt, latexGeneratedListAt } from './latex-front-matter';
import { latexPageOpening, latexRightPagePrefix } from './latex-page-start';
import { isLatexHeading } from './latex-spec';
import { isLatexTitlePage } from './latex-text-layout';
import { latexEffectivePrefix } from './latex-project';
import { latexColourDefinition } from './latex-colour';
import { isLatexBibliographyBlock } from './latex-bibliography';
import { latexLetterCommandAt } from './latex-letter';
import { latexRomanNumber } from './latex-number-format';
import { readLatexTextMacros } from './latex-macros';
import { latexCustomTitlePage, readLatexContentsEntry, readLatexListSequence, readLatexStateMacro } from './latex-state-command';
import { readLatexTitledEnvironments } from './latex-titled-environments';
import { readLatexTitleSetter } from './latex-metadata';
import { latexVerticalSpace } from './latex-vertical-space';
import type { Node } from 'prosemirror-model';
import { commandEnd, groupAt, latexCommands, latexDocumentStartCommands, whitespaceEnd } from './latex-syntax';

export { readLatexClass } from './latex-class';

export type LatexBreak = 'column' | 'page' | 'recto';
export const latexPageNumberFormats = ['arabic', 'roman', 'Roman', 'alph', 'Alph', 'gobble'] as const;
export type LatexPageNumberFormat = typeof latexPageNumberFormats[number];

/** A source command can occupy no space, or constrain where visible content flows. */
type FolioEffect = {
  folio?: { visible: false; restartAfter: boolean };
  numbering?: LatexPageNumberFormat;
  startAt?: number;
  extendedLetters?: 'alph' | 'Alph';
  pageStyle?: string;
  documentStyle?: string;
};

export type LatexBlockFlow =
  | { kind: 'break'; boundary: LatexBreak }
  | ({ kind: 'omit' } & FolioEffect)
  | ({
      kind: 'content';
      before?: LatexBreak;
      wideFloat?: true;
      after?: LatexBreak;
    } & FolioEffect);

export type LatexPageNumber = { number: number; visible: boolean; style?: Exclude<LatexPageNumberFormat, 'arabic'>; extendedLetters?: true; pageStyle?: string };

function alphabeticPageNumber(number: number, uppercase: boolean, extended: boolean | undefined) {
  if (number > 26 && !extended) return '';
  let label = '';
  while (number > 0) {
    number--;
    label = String.fromCharCode((uppercase ? 65 : 97) + number % 26) + label;
    number = Math.floor(number / 26);
  }
  return label;
}

export function latexPageLabel(folio: LatexPageNumber) {
  const { number, style } = folio;
  switch (style) {
    case 'roman': return latexRomanNumber(number).toLowerCase();
    case 'Roman': return latexRomanNumber(number);
    case 'alph':
    case 'Alph': return alphabeticPageNumber(number, style === 'Alph', folio.extendedLetters);
    case 'gobble': return '';
    default: return String(number);
  }
}

export function readLatexBookMatter(source: string) {
  switch (source.trim()) {
    case '\\frontmatter': return 'front';
    case '\\mainmatter': return 'main';
    case '\\backmatter': return 'back';
  }
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

/** Page commands that are meaningful without any printed text. */
export function readLatexPageDirective(source: string, position = 0) {
  const end = commandEnd(source, position);
  const name = source.slice(position, end);
  if (name === '\\null' && /^\s*(?:$|\\(?:newpage|clearpage|cleardoublepage)\b)/.test(source.slice(end)))
    return { kind: 'blank' as const, end };
  if (name === '\\renewcommand') {
    const group = groupAt(source, whitespaceEnd(source, end));
    if (!group || source.slice(group.from, group.to).trim() !== '\\thepage') return;
    const body = groupAt(source, whitespaceEnd(source, group.end));
    const alias = body && /^\\tumblerPage([Aa]lph)\{\\value\{page\}\}$/.exec(source.slice(body.from, body.to).trim())?.[1];
    if (body && (alias === 'alph' || alias === 'Alph')) {
      const value: 'alph' | 'Alph' = alias;
      return { kind: 'extended-letters' as const, value, end: body.end };
    }
    return;
  }
  if (name === '\\setcounter') {
    const counter = groupAt(source, whitespaceEnd(source, end));
    if (!counter || source.slice(counter.from, counter.to).trim() !== 'page') return;
    const argument = groupAt(source, whitespaceEnd(source, counter.end));
    if (!argument) return;
    const value = source.slice(argument.from, argument.to).trim();
    if (/^[+-]?\d+$/.test(value) && Number.isSafeInteger(Number(value)))
      return { kind: 'counter' as const, value: Number(value), end: argument.end };
    return;
  }
  if (name !== '\\pagenumbering' && name !== '\\thispagestyle' && name !== '\\pagestyle') return;
  const argument = groupAt(source, whitespaceEnd(source, end));
  if (!argument) return;
  const value = source.slice(argument.from, argument.to).trim();
  const style = latexPageNumberFormats.find((format) => format === value);
  if (name === '\\pagenumbering' && style)
    return { kind: 'numbering' as const, value: style, end: argument.end };
  if (name === '\\pagestyle' && /^[\w@-]+$/.test(value))
    return { kind: 'document-style' as const, value, end: argument.end };
  if (name === '\\thispagestyle' && value === 'empty')
    return { kind: 'hide' as const, end: argument.end };
  if (name === '\\thispagestyle' && /^[\w@-]+$/.test(value))
    return { kind: 'page-style' as const, value, end: argument.end };
}

/** Resolve source directives into layout effects at editor positions. Unknown classes keep
 * explicit break commands. The measured layout and edit history remain independent. */
export function latexFlow(document: Node): ReadonlyMap<number, LatexBlockFlow> {
  const prefix = latexEffectivePrefix(document);
  const { base: name, options, chaptered: chapters, twoSided: recto, chapterOnRight } = latexPageOpening(prefix);
  const macros = readLatexTextMacros(prefix);
  const customTitle = latexCustomTitlePage(prefix, macros);
  const titled = readLatexTitledEnvironments(prefix, macros);
  const columns = options.includes('twocolumn');
  const standard = chapters || name === 'article';
  const chapterBoundary: LatexBreak = chapterOnRight ? 'recto' : 'page';
  const titleOption = options.findLast(
    (option) => option === 'titlepage' || option === 'notitlepage',
  );
  const titlePage = standard && (titleOption ? titleOption === 'titlepage' : chapters);
  const flow = new Map<number, LatexBlockFlow>();
  const bounded: { node: Node; position: number; before?: LatexBreak | undefined; after?: LatexBreak | undefined; title?: true }[] = [];
  let titlePrinted = false;
  let numbering: LatexPageNumberFormat | undefined;
  let startAt: number | undefined;
  let extendedLetters: FolioEffect['extendedLetters'];
  let pageStyle: string | undefined;
  let documentStyle: string | undefined;
  let activeDocumentStyle: string | undefined = name === 'book' ? 'headings' : undefined;
  function setDocumentStyle(value: string) {
    activeDocumentStyle = documentStyle = value;
  }
  for (const command of latexDocumentStartCommands(prefix)) {
    const directive = readLatexPageDirective(prefix, command.start);
    if (directive?.kind === 'document-style') activeDocumentStyle = directive.value;
    if (directive?.kind === 'page-style') pageStyle = directive.value;
    if (directive?.kind === 'hide') pageStyle = 'empty';
    if (directive?.kind === 'numbering') {
      numbering = directive.value;
      startAt = 1;
      extendedLetters = undefined;
    }
    if (directive?.kind === 'counter') startAt = directive.value;
    if (directive?.kind === 'extended-letters') extendedLetters = directive.value;
  }
  let pageHasContent = false;
  function setDocumentState(source: string) {
    for (const command of latexCommands(source)) {
      const directive = readLatexPageDirective(source, command.start);
      if (directive?.kind === 'numbering') {
        numbering = directive.value;
        startAt = 1;
        extendedLetters = undefined;
      }
      if (directive?.kind === 'counter') startAt = directive.value;
      if (directive?.kind === 'extended-letters') extendedLetters = directive.value;
      if (directive?.kind === 'document-style') setDocumentStyle(directive.value);
    }
  }
  const boundary = (value: 'page' | 'recto' | undefined) =>
    value === 'recto' && !recto ? 'page' : value;

  document.descendants((node, position) => {
    if (node.type.name === 'latex_include' && /^\\include\b/.test(node.attrs.open ?? ''))
      bounded.push({ node, position, before: 'page', after: 'page' });
    if (node.type.name === 'blockquote') {
      const open = String(node.attrs.open);
      const abstract = latexAbstractAt(open);
      const group = /^\\begin\s*\{([^}]+)\}/.exec(open.slice(abstract?.start ?? 0))?.[1];
      const environment = group && titled.get(group);
      const explicit = abstract?.right ? boundary('recto') : undefined;
      if (environment) bounded.push({
        node, position, before: explicit ?? boundary(environment.before), after: boundary(environment.after),
      });
      else if (titlePage && group === 'abstract' && name !== 'book')
        bounded.push({ node, position, before: explicit ?? 'page', after: 'page', title: true });
      else if (group === 'abstract' && (explicit || (name === 'book' && hasStandardBookAbstract(prefix))))
        bounded.push({ node, position, before: explicit ?? 'page' });
    }
    const source = node.type.name === 'latex_raw' ? String(node.attrs.source).trim() : '';
    const spacing = readLatexSpacingCommand(source, 0);
    if (spacing?.end === source.length) {
      flow.set(position, { kind: 'omit' });
      return false;
    }
    const state = source && readLatexStateMacro(source, macros);
    if (state && state.end === source.length) {
      setDocumentState(state.expansion);
      flow.set(position, { kind: 'omit' });
      return false;
    }
    const letterCommand = name === 'letter' && latexLetterCommandAt(source, 0);
    if ((standard && (source === '\\appendix' || readLatexTitleSetter(source))) || /^\\bibliographystyle\s*\{[^{}]+\}$/.test(source) || readLatexContentsEntry(source) || latexColourDefinition(source) || (letterCommand && ['address', 'signature', 'name', 'date'].includes(letterCommand.command))) {
      flow.set(position, { kind: 'omit' });
      return false;
    }
    const matter = name === 'book' && readLatexBookMatter(source);
    if (matter) {
      flow.set(position, { kind: 'break', boundary: matter === 'back' ? chapterBoundary : recto ? 'recto' : 'page' });
      pageHasContent = false;
      if (matter !== 'back') {
        numbering = matter === 'front' ? 'roman' : 'arabic';
        startAt = 1;
        extendedLetters = undefined;
      }
      return false;
    }
    const explicit = latexBreakCommand(source);
    if (explicit) {
      pageHasContent = false;
      flow.set(position, { kind: 'break', boundary: explicit === 'recto' && !recto ? 'page' : explicit });
      return false;
    }
    const effect = (change: Omit<Extract<LatexBlockFlow, { kind: 'content' }>, 'kind'>) => {
      flow.set(position, { ...flow.get(position), ...change, kind: 'content' });
    };
    const directive = readLatexPageDirective(
      node.type.name === 'latex_inline' ? String(node.attrs.source).trim() : source,
    );
    if (directive?.kind === 'numbering' || directive?.kind === 'counter' || directive?.kind === 'extended-letters' || directive?.kind === 'hide' ||
        directive?.kind === 'page-style' || directive?.kind === 'document-style' || source.startsWith('%')) {
      const change: FolioEffect = {};
      if (directive?.kind === 'numbering') {
        if (pageHasContent) change.numbering = directive.value;
        else {
          numbering = directive.value;
          startAt = 1;
          extendedLetters = undefined;
        }
      }
      if (directive?.kind === 'counter') {
        if (pageHasContent) change.startAt = directive.value;
        else startAt = directive.value;
      }
      if (directive?.kind === 'extended-letters') {
        if (pageHasContent) change.extendedLetters = directive.value;
        else extendedLetters = directive.value;
      }
      if (directive?.kind === 'document-style') {
        activeDocumentStyle = directive.value;
        if (pageHasContent) change.documentStyle = directive.value;
        else documentStyle = directive.value;
      }
      if (directive?.kind === 'hide' || directive?.kind === 'page-style') {
        const value = directive.kind === 'hide' ? 'empty' : directive.value;
        if (pageHasContent) change.pageStyle = value;
        else pageStyle = value;
      }
      flow.set(position, { kind: 'omit', ...change });
      return false;
    }
    const explicitTitle = standard && isLatexTitlePage(node);
    const skip = latexVerticalSpace(source);
    const plainChapter = () => {
      const rule = flow.get(position);
      if ((activeDocumentStyle && activeDocumentStyle !== 'plain') ||
          (rule?.kind === 'content' && rule.pageStyle)) effect({ pageStyle: 'plain' });
    };
    if (node.isBlock && (node.isAtom || node.isTextblock || explicitTitle) &&
        !(skip?.end === source.length && !skip.starred)) {
      if (numbering) effect({ numbering });
      if (startAt !== undefined) effect({ startAt });
      if (extendedLetters) effect({ extendedLetters });
      if (pageStyle) effect({ pageStyle });
      if (documentStyle) effect({ documentStyle });
      documentStyle = undefined;
      numbering = undefined;
      startAt = undefined;
      extendedLetters = undefined;
      pageStyle = undefined;
      pageHasContent = true;
    }
    const lists = source && readLatexListSequence(source, macros);
    if (lists && lists.end === source.length) {
      const before = boundary(lists.lists[0]?.before) ?? (chapters ? chapterBoundary : undefined);
      const after = boundary(lists.after);
      effect({ ...(before && { before }), ...(after && { after }) });
      if (chapters) plainChapter();
      setDocumentState(lists.afterLists);
      if (lists.after) pageHasContent = false;
      return false;
    }
    const rightPage = recto && !!latexRightPagePrefix(source);
    if (node.type.name === 'latex_raw' && latexComposedPageKind(source) === 'page') {
      effect({ before: rightPage ? 'recto' : 'page', after: 'page' });
      pageHasContent = false;
      return false;
    }
    if (explicitTitle) {
      effect({ before: rightPage || (name === 'book' && recto) ? 'recto' : 'page', after: 'page', startAt: 1, folio: { visible: false, restartAfter: !recto } });
      pageHasContent = false;
      return false;
    }
    if (isLatexHeading(node) && chapters) {
      const open = String(node.attrs.open ?? '');
      const command = open.slice(1, commandEnd(open, 0));
      if (command === 'chapter' || command === 'part') {
        effect(command === 'chapter'
          ? { before: chapterBoundary }
          : { before: chapterBoundary, after: chapterBoundary });
        if (command === 'part') pageHasContent = false;
        // The standard chapter command selects \thispagestyle{plain}.
        plainChapter();
      }
    } else if (node.type.name === 'latex_raw') {
      const list = latexGeneratedListAt(source);
      if (list?.end === source.length) {
        if (list.right) effect({ before: rightPage ? 'recto' : 'page' });
        else if (chapters) effect({ before: list.right === false ? 'page' : chapterBoundary });
        if (chapters) plainChapter();
        return false;
      }
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
      if (chapters && isLatexBibliographyBlock(source)) {
        effect({ before: chapterBoundary });
        plainChapter();
        return false;
      }
      const command = source.slice(1, commandEnd(source, 0));
      if (source !== '\\' + command) return;
      if (command === 'maketitle' && (titlePage || customTitle) && !titlePrinted) {
        titlePrinted = true;
        pageHasContent = false;
        effect({
          before: name === 'book' && recto ? 'recto' : 'page',
          after: recto ? customTitle?.boundary ?? 'page' : 'page',
          startAt: 1,
          folio: { visible: false, restartAfter: !recto },
        });
      } else if (command === 'maketitle' && name === 'article' && !titlePrinted) {
        titlePrinted = true;
        plainChapter();
      }
    }
  });
  for (const { node, position, before, after, title } of bounded) {
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
    if (before) flow.set(first, { ...start, kind: 'content', before:
      start?.kind === 'content' && start.before === 'recto' ? 'recto' : before });
    if (title) flow.set(first, {
      ...flow.get(first), kind: 'content', startAt: 1, pageStyle: 'empty',
      folio: { visible: false, restartAfter: !recto },
    });
    const end = flow.get(last);
    if (after) flow.set(last, { ...end, kind: 'content', after:
      end?.kind === 'content' && end.after === 'recto' ? 'recto' : after });
  }
  return flow;
}

/** Resolve printed page numbers from the physical page starts returned by layout. */
export function latexPageNumbers(
  flow: ReadonlyMap<number, LatexBlockFlow>,
  pageStarts: readonly number[],
  folioLeadIns: ReadonlySet<number> = new Set(),
  emptyPages?: ReadonlySet<number>,
): LatexPageNumber[] {
  const overrides = new Map<number, { visible: false; restartAfter: boolean }>();
  const resets = new Map<number, number>();
  const formats = new Map<number, LatexPageNumberFormat>();
  const extensions = new Map<number, boolean>();
  const pageStyles = new Map<number, string>();
  const documentStyles = new Map<number, string>();
  for (const [position, effect] of [...flow].sort(([a], [b]) => a - b)) {
    if (effect.kind === 'break') continue;
    const page = pageStarts.findLastIndex(start => start <= position) + 1;
    const folioPage = folioLeadIns.has(position) ? page - 1 : page;
    if (effect.folio) overrides.set(page, effect.folio);
    if (effect.numbering) {
      formats.set(folioPage, effect.numbering);
      resets.set(folioPage, 1);
      extensions.set(folioPage, false);
    }
    if (effect.extendedLetters) {
      extensions.set(folioPage, true);
      formats.set(folioPage, effect.extendedLetters);
    }
    if (effect.startAt !== undefined) resets.set(folioPage, effect.startAt);
    if (effect.pageStyle) pageStyles.set(page, effect.pageStyle);
    if (effect.documentStyle) documentStyles.set(folioPage, effect.documentStyle);
  }
  let number = 1;
  let style: LatexPageNumberFormat = 'arabic';
  let currentStyle: string | undefined;
  let extendedLetters = false;
  return Array.from({ length: pageStarts.length + 1 }, (_, page) => {
    const override = overrides.get(page);
    style = formats.get(page) ?? style;
    number = resets.get(page) ?? number;
    extendedLetters = extensions.get(page) ?? extendedLetters;
    currentStyle = documentStyles.get(page) ?? currentStyle;
    const pageStyle = emptyPages?.has(page) ? 'empty' : pageStyles.get(page) ?? currentStyle;
    const folio: LatexPageNumber = {
      number,
      visible: pageStyle !== 'empty' && (override?.visible ?? true),
      ...(style !== 'arabic' ? { style } : {}),
      ...(extendedLetters && { extendedLetters: true }),
      ...(pageStyle && pageStyle !== 'empty' && { pageStyle }),
    };
    number = override?.restartAfter ? 1 : number + 1;
    return folio;
  });
}
