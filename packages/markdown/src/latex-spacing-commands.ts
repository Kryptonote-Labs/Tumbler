import type { Node, NodeType } from 'prosemirror-model';
import type { Command, EditorState } from 'prosemirror-state';
import { findWrapping, liftTarget } from 'prosemirror-transform';
import { updateLatexBoundary, updateLatexNodeSource } from './latex-boundary-step';
import { latexLength } from './latex-lengths';
import { withLatexPackage } from './latex-preamble';
import { latexVerticalSpace } from './latex-presentation';
import { latexEffectivePrefix } from './latex-project';
import { latexSpacingRegion, latexSpacingValue, type LatexLineSpacingChoice } from './latex-spacing';
import { argument, commandEnd, groupAt, whitespaceEnd } from './latex-syntax';

function packagePrefix(state: EditorState, name: string) {
  return withLatexPackage(String(state.doc.attrs.prefix), name, latexEffectivePrefix(state.doc));
}

function sharedAncestor(state: EditorState, match: (node: Node) => boolean) {
  const { $from, $to } = state.selection;
  for (let depth = $from.sharedDepth($to.pos); depth > 0; depth--) {
    const node = $from.node(depth);
    if (match(node)) return { node, position: $from.before(depth) };
  }
}

/** The setspace region containing the full selection. */
export function latexSelectedSpacingRegion(state: EditorState) {
  const target = sharedAncestor(state, (node) =>
    node.type.name === 'latex_container' && !!latexSpacingRegion(String(node.attrs.open)));
  if (!target) return;
  const region = latexSpacingRegion(String(target.node.attrs.open));
  return region && { ...target, region };
}

/** Set spacing on whole selected blocks, or change or remove the region around the selection. */
export function applyLatexRegionSpacing(choice: LatexLineSpacingChoice | null): Command {
  return (state, dispatch) => {
    const current = latexSelectedSpacingRegion(state);
    if (choice === null) {
      if (!current) return false;
      const { position, node } = current;
      const range = state.doc.resolve(position + 1).blockRange(state.doc.resolve(position + node.nodeSize - 1));
      const target = range && liftTarget(range);
      if (!range || target == null) return false;
      if (dispatch) {
        const tr = state.tr.lift(range, target);
        tr.setNodeAttribute(position, 'before', node.attrs.before);
        dispatch(tr.scrollIntoView());
      }
      return true;
    }

    const value = latexSpacingValue(choice);
    const name = choice === 'onehalf' ? 'onehalfspace' : choice === 'double' ? 'doublespace' : 'spacing';
    const open = '\\begin{' + name + '}' + (name === 'spacing' ? '{' + (choice === 'single' ? '1' : value) + '}' : '');
    const close = '\\end{' + name + '}';
    const { $from, $to } = state.selection;
    if (current) {
      if (dispatch) {
        const { position, node, region } = current;
        const previousClose = String(node.attrs.close);
        const first = previousClose.lastIndexOf('\\end');
        const tr = state.tr.setNodeAttribute(position, 'open', open + String(node.attrs.open).slice(region.end));
        tr.setNodeAttribute(position, 'close', first < 0 ? '\n' + close : previousClose.slice(0, first) + close);
        dispatch(tr.scrollIntoView());
      }
      return true;
    }

    const type: NodeType | undefined = state.schema.nodes.latex_container;
    const range = $from.blockRange($to);
    if (!type || !range) return false;
    const first = range.parent.child(range.startIndex);
    const wrap = findWrapping(range, type, { before: first.attrs.before, open, close: '\n' + close });
    if (!wrap) return false;
    if (dispatch) {
      const tr = updateLatexBoundary(state.tr, 'prefix', packagePrefix(state, 'setspace'));
      tr.wrap(range, wrap);
      const node = tr.doc.nodeAt(range.start + 1);
      if (node && 'before' in node.attrs) tr.setNodeAttribute(range.start + 1, 'before', '\n');
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

/** The innermost numbered or bulleted list containing the full selection. */
export function latexSelectedList(state: EditorState) {
  return sharedAncestor(state, (node) =>
    (node.type.name === 'bullet_list' || node.type.name === 'ordered_list') &&
    !/^\\begin\s*\{description\}/.test(String(node.attrs.open)));
}

function gapLength(value: string) {
  const length = value.trim();
  if (latexLength(length, 1, 1) === undefined)
    throw new Error('Enter a length such as 3mm or 6pt.');
  return length;
}

/** Set or clear an enumitem itemsep override without changing the other local options. */
export function setLatexListItemGap(value: string): Command {
  return (state, dispatch) => {
    const list = latexSelectedList(state);
    if (!list) return false;
    const length = value.trim() ? gapLength(value) : '';
    if (!dispatch) return true;
    const authored = String(list.node.attrs.open ??
      (list.node.type.name === 'ordered_list' ? '\\begin{enumerate}\n' : '\\begin{itemize}\n'));
    const environment = argument(authored, commandEnd(authored, 0));
    if (!environment) return false;
    const option = groupAt(authored, whitespaceEnd(authored, environment.end), '[', ']');
    const options: string[] = [];
    if (option) {
      for (let start = option.from; start < option.to;) {
        let end = start;
        while (end < option.to && authored[end] !== ',') end = groupAt(authored, end)?.end ?? end + 1;
        const entry = authored.slice(start, end);
        if (!/^\s*itemsep\s*=/.test(entry) && entry.trim()) options.push(entry);
        start = end + 1;
      }
    }
    if (length) options.push('itemsep=' + length);
    if (!length && !option) return true;
    const open = authored.slice(0, option ? option.from - 1 : environment.end) +
      (options.length ? '[' + options.join(',') + ']' : '') +
      authored.slice(option?.end ?? environment.end);
    const tr = state.tr;
    if (length) updateLatexBoundary(tr, 'prefix', packagePrefix(state, 'enumitem'));
    dispatch(tr.setNodeAttribute(list.position, 'open', open).scrollIntoView());
    return true;
  };
}

type Side = 'before' | 'after';

function paragraphBoundary(state: EditorState, side: Side) {
  const $point = side === 'before' ? state.selection.$from : state.selection.$to;
  if ($point.parent.type.name !== 'paragraph') return;
  const position = side === 'before' ? $point.before() : $point.after();
  const at = state.doc.resolve(position);
  const type = state.schema.nodes.latex_raw;
  if (!type || !at.parent.canReplaceWith(at.index(), at.index(), type)) return;
  const adjacent = side === 'before' ? at.nodeBefore : at.nodeAfter;
  const source = adjacent?.type === type ? String(adjacent.attrs.source) : '';
  const space = latexVerticalSpace(source);
  const existing = adjacent && space?.end === source.length && space.starred === (side === 'before')
    ? { position: side === 'before' ? position - adjacent.nodeSize : position, node: adjacent, length: space.length }
    : undefined;
  return { position, type, existing };
}

export function latexParagraphGap(state: EditorState, side: Side) {
  return paragraphBoundary(state, side)?.existing?.length ?? '';
}

/** Set a fixed skip at the first or last paragraph boundary of the selection. */
export function setLatexParagraphGap(side: Side, value: string): Command {
  return verticalGap(side, value, side === 'before', true);
}

/** Insert a standalone skip above the selected paragraph without deleting the selection. */
export function insertLatexVerticalGap(value: string, preserveAtPageStart: boolean): Command {
  return verticalGap('before', value, preserveAtPageStart, false);
}

function verticalGap(side: Side, value: string, starred: boolean, replace: boolean): Command {
  return (state, dispatch) => {
    const boundary = paragraphBoundary(state, side);
    if (!boundary) return false;
    const length = replace && !value.trim() ? '' : gapLength(value);
    if (!dispatch) return true;
    const { position, type, existing } = boundary;
    const source = '\\vspace' + (starred ? '*' : '') + '{' + length + '}';
    const tr = state.tr;
    if (replace && existing) {
      if (length) updateLatexNodeSource(tr, existing.position, source);
      else tr.delete(existing.position, existing.position + existing.node.nodeSize);
    } else if (length) {
      const next = tr.doc.nodeAt(position);
      const before = side === 'before' ? next?.attrs.before ?? (position === 0 ? '' : '\n\n') : '\n\n';
      tr.insert(position, type.create({ before, source }));
      if (side === 'before' && next) tr.setNodeAttribute(position + tr.doc.nodeAt(position)!.nodeSize, 'before', '\n\n');
    }
    if (tr.docChanged) dispatch(tr.scrollIntoView());
    return true;
  };
}
