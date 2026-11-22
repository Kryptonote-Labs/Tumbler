import type { Node } from 'prosemirror-model';
import { commandEnd, groupAt, latexCommands, whitespaceEnd } from './latex-syntax';

export type LatexBreak = 'column' | 'page' | 'recto';

/** A source command can occupy no space, or constrain where visible content flows. */
export type LatexBlockFlow =
  | { kind: 'break'; boundary: LatexBreak }
  | {
      kind: 'content';
      before?: LatexBreak;
      after?: LatexBreak;
      folio?: { visible: false; restartAfter: boolean };
    };

export type LatexPageNumber = { number: number; visible: boolean };

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
  const { name, options } = readLatexClass(String(document.attrs.prefix ?? ''));
  const chapters = name === 'report' || name === 'book';
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
  let titlePrinted = false;

  document.descendants((node, position) => {
    if (node.type.name === 'heading' && chapters) {
      const open = String(node.attrs.open ?? '');
      const command = open.slice(1, commandEnd(open, 0));
      if (command === 'chapter' || command === 'part') {
        flow.set(
          position,
          command === 'chapter'
            ? { kind: 'content', before: chapterBoundary }
            : { kind: 'content', before: chapterBoundary, after: chapterBoundary },
        );
      }
    } else if (node.type.name === 'latex_raw') {
      const source = String(node.attrs.source).trim();
      if (name === 'beamer' && /^\\begin\s*\{frame\}/.test(source)) {
        flow.set(position, { kind: 'content', before: 'page', after: 'page' });
        return;
      }
      const command = source.slice(1, commandEnd(source, 0));
      if (source !== '\\' + command) return;
      const boundary = latexBreakCommand(source);
      if (boundary) {
        flow.set(position, {
          kind: 'break',
          boundary: boundary === 'recto' && !recto ? 'page' : boundary,
        });
      } else if (command === 'maketitle' && titlePage && !titlePrinted) {
        titlePrinted = true;
        flow.set(position, {
          kind: 'content',
          before: 'page',
          after: 'page',
          folio: { visible: false, restartAfter: !recto },
        });
      } else if (chapters && chapterLists.has(command)) {
        flow.set(position, { kind: 'content', before: chapterBoundary });
      }
    }
  });
  return flow;
}

/** Resolve printed page numbers from the physical page starts returned by layout. */
export function latexPageNumbers(
  flow: ReadonlyMap<number, LatexBlockFlow>,
  pageStarts: readonly number[],
): LatexPageNumber[] {
  const overrides = new Map<number, { visible: false; restartAfter: boolean }>();
  for (const [position, effect] of flow) {
    if (effect.kind !== 'content' || !effect.folio) continue;
    const next = pageStarts.findIndex((start) => start > position);
    overrides.set(next < 0 ? pageStarts.length : next, effect.folio);
  }
  let number = 1;
  return Array.from({ length: pageStarts.length + 1 }, (_, page) => {
    const override = overrides.get(page);
    const folio = { number, visible: override?.visible ?? true };
    number = override?.restartAfter ? 1 : number + 1;
    return folio;
  });
}
