import type { Node } from 'prosemirror-model';
import type { Transform } from 'prosemirror-transform';
import { latexComposedPageKind } from './latex-page-composition';
import { readLatexPageDirective } from './latex-flow';
import type { LatexGeneratedList } from './latex-state-command';

export type LatexFrontMatter = 'abstract' | LatexGeneratedList;

const order: readonly LatexFrontMatter[] = ['abstract', 'tableofcontents', 'listoffigures', 'listoftables'];
const abstractOpen = /^\\begin\s*\{abstract\}/;

export function isEditableLatexAbstract(node: Node) {
  return node.type.name === 'blockquote' && abstractOpen.test(String(node.attrs.open ?? ''));
}

function rawSource(node: Node) {
  return node.type.name === 'latex_raw' ? String(node.attrs.source).trim() : '';
}

function isFrontMatter(node: Node, kind: LatexFrontMatter) {
  return kind === 'abstract'
    ? isEditableLatexAbstract(node) || abstractOpen.test(rawSource(node))
    : rawSource(node) === '\\' + kind;
}

/** Find top-level instances of a front matter block in document order. */
export function latexFrontMatterBlocks(document: Node, kind: LatexFrontMatter) {
  const positions: number[] = [];
  document.forEach((node, offset) => {
    if (isFrontMatter(node, kind)) positions.push(offset);
  });
  return positions;
}

const pageCommands =
  /^(?:\\(?:clearpage|cleardoublepage|newpage|(?:this)?pagestyle\s*\{\w*\}|pagenumbering\s*\{\w*\})\s*)+$/;

function frontMatterPosition(document: Node, kind: LatexFrontMatter) {
  const earlier = order.slice(0, order.indexOf(kind));
  let position = 0;
  let frontNumbering = false;
  for (let index = 0; index < document.childCount; index++) {
    const node = document.child(index);
    const source = rawSource(node);
    const page = latexComposedPageKind(source);
    const directive = readLatexPageDirective(source);
    if (directive?.kind === 'numbering') {
      if (frontNumbering && directive.value === 'arabic') break;
      frontNumbering ||= directive.value === 'roman' || directive.value === 'Roman';
    }
    if (
      source !== '\\maketitle' && page !== 'title' && !(page === 'page' && kind !== 'abstract') &&
      !earlier.some(other => isFrontMatter(node, other)) && !pageCommands.test(source) &&
      directive?.kind !== 'counter' && directive?.kind !== 'extended-letters'
    ) break;
    position += node.nodeSize;
  }
  return position;
}

/** Show or hide a generated list or an editable abstract. Returns the start of a new block. */
export function setLatexFrontMatter(tr: Transform, kind: LatexFrontMatter, shown: boolean) {
  const existing = latexFrontMatterBlocks(tr.doc, kind);
  if (!shown) {
    for (const position of existing.reverse()) {
      const node = tr.doc.nodeAt(position);
      if (node) tr.delete(position, position + node.nodeSize);
    }
    return;
  }
  if (existing.length) return;
  const { nodes } = tr.doc.type.schema;
  const at = frontMatterPosition(tr.doc, kind);
  const before = tr.doc.nodeAt(at)?.attrs.before || '\n\n';
  const node = kind === 'abstract'
    ? nodes.blockquote!.create(
        { before, open: '\\begin{abstract}\n', close: '\n\\end{abstract}' },
        nodes.paragraph!.create({ before: '' }),
      )
    : nodes.latex_raw!.create({ before, source: '\\' + kind });
  tr.insert(at, node);
  const next = tr.doc.nodeAt(at + node.nodeSize);
  if (next && !/\r?\n[ \t]*\r?\n/.test(String(next.attrs.before ?? ''))) {
    const newline = String(tr.doc.attrs.prefix).includes('\r\n') ? '\r\n' : '\n';
    tr.setNodeAttribute(at + node.nodeSize, 'before', newline + newline);
  }
  return at;
}
