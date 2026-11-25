import type { Mark } from 'prosemirror-model';
import type { Command, EditorState, Transaction } from 'prosemirror-state';
import { updateLatexBoundary } from './latex-boundary-step';
import { authoredLatexStyle, authoredLatexStyleOrder, formattableLatexText, isLatexStyleMark, latexStylePackages, type LatexStyle, type LatexToggleStyle } from './latex-inline-format';
import { withLatexPackage } from './latex-preamble';
import { latexEffectivePrefix } from './latex-project';

type Style = LatexStyle['style'];
const pairedStyles = new Map([['superscript', 'subscript'], ['subscript', 'superscript']]);

function hasStyle(mark: Mark, style: Style, value?: string) {
  if (mark.type.name === style && (style === 'strong' || style === 'em')) return true;
  if (!isLatexStyleMark(mark) || mark.attrs.style !== style) return false;
  return value === undefined || [mark.attrs.colour, mark.attrs.href, mark.attrs.size].includes(value);
}

export function latexStyleActive(state: EditorState, style: Style, value?: string) {
  const { empty, from, to, $from } = state.selection;
  const matches = (mark: Mark) => hasStyle(mark, style, value);
  if (empty) return (state.storedMarks ?? $from.marks()).some(matches);
  let found = false;
  let complete = true;
  state.doc.nodesBetween(from, to, (node) => {
    if (!node.isInline) return complete;
    if (!formattableLatexText(node) && !node.marks.some(matches)) return false;
    found = true;
    if (!node.marks.some(matches)) complete = false;
    return false;
  });
  return found && complete;
}

function changeStyle(state: EditorState, style: Style, replacement?: Mark) {
  const tr = state.tr;
  const paired = pairedStyles.get(style);
  const remove = (mark: Mark) => hasStyle(mark, style) || mark.attrs.style === paired && paired !== undefined;
  const { empty, from, to, $from } = state.selection;
  if (empty) {
    const marks = (state.storedMarks ?? $from.marks()).filter((mark) => !remove(mark));
    return tr.setStoredMarks(replacement ? replacement.addToSet(marks) : marks);
  }
  state.doc.nodesBetween(from, to, (node, position) => {
    if (!node.isInline) return;
    const start = Math.max(from, position);
    const end = Math.min(to, position + node.nodeSize);
    for (const mark of node.marks)
      if (remove(mark)) tr.removeMark(start, end, mark);
    if (replacement && formattableLatexText(node)) tr.addMark(start, end, replacement);
  });
  return tr;
}

export function setLatexStyle(format: LatexStyle): Command {
  return (state, dispatch) => {
    const attrs = authoredLatexStyle(format);
    if (!attrs) return false;
    const mark = state.schema.marks.latex_style!.create({ ...attrs, order: authoredLatexStyleOrder });
    dispatch?.(changeStyle(state, format.style, mark));
    return true;
  };
}

export function removeLatexStyle(style: Style): Command {
  return (state, dispatch) => {
    dispatch?.(changeStyle(state, style));
    return true;
  };
}

export function toggleLatexStyle(style: LatexToggleStyle): Command {
  const apply = setLatexStyle({ style });
  return (state, dispatch) => (latexStyleActive(state, style) ? removeLatexStyle(style) : apply)(state, dispatch);
}

/** A caret inside a link edits its whole marked range. */
export function latexLinkSelection(state: EditorState) {
  const { from, to, $from, $to, empty } = state.selection;
  if (!$from.sameParent($to) || !$from.parent.isTextblock) return;
  const children = $from.parent.children;
  let index = $from.index();
  const matches = (mark: Mark) => hasStyle(mark, 'link');
  let mark = children[index]?.marks.find(matches);
  if (!mark && empty && !$from.textOffset) mark = children[--index]?.marks.find(matches);
  if (!mark) return { from, to, href: '' };
  let start = index;
  let end = index + 1;
  while (start > 0 && mark.isInSet(children[start - 1]!.marks)) start--;
  while (end < children.length && mark.isInSet(children[end]!.marks)) end++;
  const linkFrom = $from.posAtIndex(start);
  const linkTo = $from.posAtIndex(end);
  if (!empty && to > linkTo) return { from, to, href: '' };
  return { from: linkFrom, to: linkTo, href: String(mark.attrs.href) };
}

export function setLatexLink(href: string, range: { from: number; to: number }): Command {
  return (state, dispatch) => {
    const attrs = href ? authoredLatexStyle({ style: 'link', href }) : undefined;
    if (href && !attrs) return false;
    if (!dispatch) return true;
    const { from, to } = range;
    const mark = attrs && state.schema.marks.latex_link!.create({ ...attrs, order: authoredLatexStyleOrder });
    const tr = state.tr;
    if (from === to && mark) {
      const marks = (state.storedMarks ?? state.doc.resolve(from).marks()).filter(item => !hasStyle(item, 'link'));
      tr.replaceWith(from, to, state.schema.text(href, mark.addToSet(marks))).removeStoredMark(mark);
    } else if (from < to) {
      // A URL command prints its argument verbatim. Switch it to ordinary editable text before
      // unlinking it or replacing its target, so percent and hash characters remain printable.
      state.doc.nodesBetween(from, to, (node, position) => {
        if (!node.isInline) return;
        const previous = node.marks.filter(item => hasStyle(item, 'link'));
        const start = tr.mapping.map(Math.max(from, position));
        let end = tr.mapping.map(Math.min(to, position + node.nodeSize));
        if (node.type.name === 'latex_inline' && node.attrs.urlArgument) {
          const text = String(node.attrs.label);
          tr.replaceWith(start, end, state.schema.text(text, node.marks.filter(item => !hasStyle(item, 'link'))));
          end = start + text.length;
        } else {
          for (const item of previous) tr.removeMark(start, end, item);
        }
        if (mark && (formattableLatexText(node) || node.attrs.urlArgument)) tr.addMark(start, end, mark);
      });
    }
    if (!tr.docChanged) return false;
    dispatch(tr.scrollIntoView());
    return true;
  };
}

const authoredPackages = new WeakMap<EditorState['doc'], ReadonlySet<string>>();
const allPackages = new WeakMap<EditorState['doc'], ReadonlySet<string>>();

function requiredPackages(node: EditorState['doc'], includeImported: boolean): ReadonlySet<string> {
  const cache = includeImported ? allPackages : authoredPackages;
  const known = cache.get(node);
  if (known) return known;
  const names = new Set<string>();
  for (const mark of node.marks)
    for (const name of latexStylePackages(mark, includeImported)) names.add(name);
  node.forEach(child => {
    for (const name of requiredPackages(child, includeImported)) names.add(name);
  });
  cache.set(node, names);
  return names;
}

export function addLatexFormattingPackages(
  transaction: Transaction,
  previous: EditorState['doc'],
  options: { rebased: boolean; pasted: boolean },
) {
  const required = requiredPackages(transaction.doc, options.pasted);
  if (!required.size) return;
  const existing = requiredPackages(previous, options.pasted);
  const effective = latexEffectivePrefix(transaction.doc);
  let prefix: string = transaction.doc.attrs.prefix;
  for (const name of required)
    if ((!existing.has(name) || options.rebased) && withLatexPackage(effective, name) !== effective)
      prefix = withLatexPackage(prefix, name);
  updateLatexBoundary(transaction, 'prefix', prefix);
}
