import type { Node } from 'prosemirror-model';
import type { Transform } from 'prosemirror-transform';
import { updateLatexBoundary, updateLatexNodeSource } from './latex-boundary-step';
import { readLatexPageDirective } from './latex-flow';
import { latexComposedPageKind } from './latex-page-composition';
import { latexRightPageBreak, latexRightPagePrefix, latexPageOpening } from './latex-page-start';
import { latexEffectivePrefix } from './latex-project';
import type { LatexGeneratedList } from './latex-state-command';

export type LatexFrontMatter = 'abstract' | LatexGeneratedList;
const listCommand = /^\\(tableofcontents|listoftables|listoffigures)(?![A-Za-z@])/;
const nextListPage = '\\begingroup\n\\csname @openrightfalse\\endcsname\n';
const nextListOpen = /^\\begingroup\s*\\csname\s+@openrightfalse\s*\\endcsname\s*/;
const endGroup = /^\s*\\endgroup(?![A-Za-z@])/;
const abstractOpen = /^\\begin\s*\{abstract\}/;
const bookAbstract = '\\ifdefined\\abstract\\else\\newenvironment{abstract}{\\csname @openrightfalse\\endcsname\\chapter*{Abstract}}{\\par}\\fi';

/** Read a generated list with its local page-opening instructions. */
export function latexGeneratedListAt(source: string, start = 0) {
  const rest = source.slice(start);
  const right = latexRightPagePrefix(rest);
  const next = nextListOpen.exec(rest)?.[0];
  const offset = next?.length ?? right.length;
  const command = listCommand.exec(rest.slice(offset));
  if (!command) return;
  const after = offset + command[0].length;
  const close = next ? endGroup.exec(rest.slice(after)) : null;
  if (next && !close) return;
  return { kind: command[1] as LatexGeneratedList, end: start + after + (close?.[0].length ?? 0),
    right: right ? true : next ? false : undefined };
}

export function latexGeneratedListKind(source: string) {
  const text = source.trim();
  const list = latexGeneratedListAt(text);
  if (list?.end === text.length) return list.kind;
}

/** The abstract environment may carry a page break as part of its opener. */
export function latexAbstractAt(source: string, start = 0) {
  const rest = source.slice(start);
  const right = latexRightPagePrefix(rest);
  const open = abstractOpen.exec(rest.slice(right.length));
  if (open) return { start: start + right.length, end: start + right.length + open[0].length, right: !!right };
}

export function isEditableLatexAbstract(node: Node) {
  return node.type.name === 'blockquote' && !!latexAbstractAt(String(node.attrs.open));
}

export function hasStandardBookAbstract(prefix: string) {
  return prefix.includes(bookAbstract);
}

function rawSource(node: Node | null) {
  return node?.type.name === 'latex_raw' ? String(node.attrs.source).trim() : '';
}

/** Find standalone front matter in the order it prints. */
export function latexFrontMatterOrder(document: Node) {
  const blocks: { kind: LatexFrontMatter; position: number }[] = [];
  document.forEach((node, position) => {
    const source = rawSource(node);
    const kind = isEditableLatexAbstract(node) || latexAbstractAt(source) ? 'abstract' : latexGeneratedListKind(source);
    if (kind) blocks.push({ kind, position });
  });
  return blocks;
}

/** Find top-level instances of a front matter block in document order. */
export function latexFrontMatterBlocks(document: Node, kind: LatexFrontMatter) {
  return latexFrontMatterOrder(document).filter(block => block.kind === kind).map(block => block.position);
}

const pageCommands = /^(?:\\(?:clearpage|cleardoublepage|newpage|frontmatter|(?:this)?pagestyle\s*\{\w*\}|pagenumbering\s*\{\w*\})\s*)+$/;

function frontMatterPosition(document: Node, kind: LatexFrontMatter) {
  let position = 0;
  let frontNumbering = false;
  for (const node of document.children) {
    const source = rawSource(node);
    const page = latexComposedPageKind(source);
    const directive = readLatexPageDirective(source);
    if (directive?.kind === 'numbering') {
      if (frontNumbering && directive.value === 'arabic') break;
      frontNumbering ||= directive.value === 'roman' || directive.value === 'Roman';
    }
    const front = kind !== 'abstract' &&
      (page === 'page' || isEditableLatexAbstract(node) || latexAbstractAt(source) || latexGeneratedListKind(source));
    if (source !== '\\maketitle' && page !== 'title' && !front && !pageCommands.test(source) &&
        directive?.kind !== 'counter' && directive?.kind !== 'extended-letters') break;
    position += node.nodeSize;
  }
  return position;
}

/** Show or hide standalone front matter. Without a position, new lists follow those already in place. */
export function setLatexFrontMatter(tr: Transform, kind: LatexFrontMatter, shown: boolean, position?: number) {
  const existing = latexFrontMatterBlocks(tr.doc, kind);
  if (!shown) {
    for (const at of existing.reverse())
      tr.delete(at, at + tr.doc.nodeAt(at)!.nodeSize);
    return;
  }
  if (existing.length) return;
  const at = position ?? frontMatterPosition(tr.doc, kind);
  const prefix = latexEffectivePrefix(tr.doc);
  const { base, chapterOnRight } = latexPageOpening(prefix);
  const { blockquote, paragraph, latex_raw } = tr.doc.type.schema.nodes;
  const before = tr.doc.nodeAt(at)?.attrs.before || '\n\n';
  if (kind === 'abstract') {
    if (base === 'book' && !hasStandardBookAbstract(prefix)) {
      const authored = String(tr.doc.attrs.prefix);
      const begin = /\\begin\s*\{document\}\s*$/.exec(authored);
      if (begin) updateLatexBoundary(tr, 'prefix', authored.slice(0, begin.index) + bookAbstract + '\n' + authored.slice(begin.index));
    }
    tr.insert(at, blockquote!.create({
      before, open: (chapterOnRight ? latexRightPageBreak + '\n' : '') + '\\begin{abstract}',
      close: '\n\\end{abstract}',
    }, paragraph!.create({ before: '\n' })));
  } else {
    tr.insert(at, latex_raw!.create({ before, source: '\\' + kind }));
  }
  const following = at + tr.doc.nodeAt(at)!.nodeSize;
  const next = tr.doc.nodeAt(following);
  if (next && !/\r?\n[ \t]*\r?\n/.test(String(next.attrs.before ?? ''))) {
    const newline = String(tr.doc.attrs.prefix).includes('\r\n') ? '\r\n' : '\n';
    tr.setNodeAttribute(following, 'before', newline + newline);
  }
  return at;
}

/** Move a list one place in the front matter, keeping each list's page start setting. */
export function moveLatexGeneratedList(tr: Transform, position: number, direction: -1 | 1) {
  const lists = latexFrontMatterOrder(tr.doc).filter(block => block.kind !== 'abstract');
  const index = lists.findIndex(list => list.position === position);
  const other = index < 0 ? undefined : lists[index + direction];
  if (!other) return;
  const current = String(tr.doc.nodeAt(position)!.attrs.source);
  const target = String(tr.doc.nodeAt(other.position)!.attrs.source);
  updateLatexNodeSource(tr, position, target);
  updateLatexNodeSource(tr, other.position, current);
}

/** The right-page switch includes the standard class default for generated lists. */
export function latexFrontMatterStartsRight(document: Node, position: number) {
  const node = document.nodeAt(position);
  const source = rawSource(node);
  const abstract = latexAbstractAt(node?.type.name === 'blockquote' ? String(node.attrs.open) : source);
  const { chapterOnRight } = latexPageOpening(latexEffectivePrefix(document));
  const list = latexGeneratedListAt(source);
  return list ? list.right ?? chapterOnRight : abstract?.right ?? false;
}

/** Set a front matter page start. The next-page override of openright is local to the list. */
export function setLatexFrontMatterPageStart(tr: Transform, position: number, right: boolean) {
  if (latexFrontMatterStartsRight(tr.doc, position) === right) return;
  const node = tr.doc.nodeAt(position);
  const source = rawSource(node);
  const list = latexGeneratedListKind(source);
  const { chapterOnRight } = latexPageOpening(latexEffectivePrefix(tr.doc));
  if (list) {
    const command = '\\' + list;
    updateLatexNodeSource(tr, position, right === chapterOnRight ? command :
      right ? latexRightPageBreak + '\n' + command : nextListPage + command + '\n\\endgroup');
  } else if (node && isEditableLatexAbstract(node)) {
    const open = String(node.attrs.open);
    tr.setNodeAttribute(position, 'open', right ? latexRightPageBreak + '\n' + open : open.slice(latexRightPagePrefix(open).length));
  } else if (latexAbstractAt(source)) {
    updateLatexNodeSource(tr, position, right ? latexRightPageBreak + '\n' + source : source.slice(latexRightPagePrefix(source).length));
  }
}
