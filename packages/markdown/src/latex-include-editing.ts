import { keydownHandler } from 'prosemirror-keymap';
import type { Node, ResolvedPos } from 'prosemirror-model';
import { Plugin, Selection, TextSelection, type Command, type SelectionBookmark, type Transaction } from 'prosemirror-state';
import type { Mappable } from 'prosemirror-transform';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { latexFlow } from './latex-flow';

const include = 'latex_include';

function isIncludeBoundary($pos: ResolvedPos) {
  const { parent, nodeBefore, nodeAfter } = $pos;
  const paragraph = parent.type.schema.nodes.paragraph!;
  return !parent.inlineContent &&
    (nodeBefore?.type.name === include || nodeAfter?.type.name === include) &&
    parent.canReplaceWith($pos.index(), $pos.index(), paragraph);
}

function resolveBoundary($pos: ResolvedPos): Selection {
  return isIncludeBoundary($pos) ? new IncludeBoundarySelection($pos) : Selection.near($pos);
}

/** A caret in the including file, between blocks. It carries no document content. */
class IncludeBoundarySelection extends Selection {
  constructor($pos: ResolvedPos) {
    super($pos, $pos);
    this.visible = false;
  }

  map(doc: Node, mapping: Mappable) {
    return resolveBoundary(doc.resolve(mapping.map(this.head)));
  }

  eq(other: Selection) {
    return other instanceof IncludeBoundarySelection && other.head === this.head;
  }

  toJSON() {
    return { type: 'latex-include-boundary', pos: this.head };
  }

  override getBookmark(): SelectionBookmark {
    return new IncludeBoundaryBookmark(this.head);
  }

  static override fromJSON(doc: Node, json: { pos: number }) {
    return resolveBoundary(doc.resolve(json.pos));
  }
}

class IncludeBoundaryBookmark implements SelectionBookmark {
  constructor(readonly position: number) {}

  map(mapping: Mappable) {
    return new IncludeBoundaryBookmark(mapping.map(this.position));
  }

  resolve(doc: Node) {
    return resolveBoundary(doc.resolve(this.position));
  }
}

Selection.jsonID('latex-include-boundary', IncludeBoundarySelection);

// Keep the original separator on its block, adding only what is needed to end the new paragraph.
function openParagraph(tr: Transaction, $pos: ResolvedPos) {
  const { pos, nodeBefore, nodeAfter, doc } = $pos;
  const paragraph = doc.type.schema.nodes.paragraph!;
  const separator: string | null = nodeAfter?.attrs.before ?? null;
  const newline = separator?.includes('\r\n') || nodeBefore?.attrs.before?.includes('\r\n') ? '\r\n' : '\n';
  const before = nodeBefore ? newline.repeat(2) : separator?.match(/^\r?\n/)?.[0] ?? '';
  tr.insert(pos, paragraph.create({ before }));
  if (nodeAfter && separator !== null && !/\r?\n[^\S\r\n]*\r?\n/.test(separator)) {
    const extra = /\n/.test(separator) ? newline : newline.repeat(2);
    tr.setNodeAttribute(pos + 2, 'before', extra + separator);
  }
  return tr.setSelection(TextSelection.create(tr.doc, pos + 1));
}

function moveAcrossBoundary(direction: -1 | 1, edge: 'left' | 'right' | 'up' | 'down'): Command {
  return (state, dispatch, view) => {
    const { selection, doc } = state;
    const { $head } = selection;
    if (selection instanceof IncludeBoundarySelection) {
      const next = Selection.findFrom($head, direction, true);
      if (next) dispatch?.(state.tr.setSelection(next).scrollIntoView());
      return true;
    }
    if (!(selection instanceof TextSelection) || !selection.empty || !view?.endOfTextblock(edge))
      return false;

    let flow: ReturnType<typeof latexFlow> | undefined;
    for (let depth = $head.depth; depth > 0; depth--) {
      const $boundary = doc.resolve(direction > 0 ? $head.after(depth) : $head.before(depth));
      const beside = direction > 0 ? $boundary.nodeAfter : $boundary.nodeBefore;
      // Ordinary text already provides a caret in the same file. Keep its normal navigation.
      if (isIncludeBoundary($boundary) && beside?.type.name !== 'paragraph') {
        dispatch?.(state.tr.setSelection(new IncludeBoundarySelection($boundary)).scrollIntoView());
        return true;
      }

      // Hidden page and style directives can sit between the last visible line and the file edge.
      const parent = $boundary.parent;
      const index = direction > 0 ? $boundary.index() : $boundary.index() - 1;
      let offset = $boundary.pos;
      for (let i = index; i >= 0 && i < parent.childCount; i += direction) {
        const child = parent.child(i);
        if (child.type.name !== 'latex_raw') return false;
        if (direction < 0) offset -= child.nodeSize;
        const rule = (flow ??= latexFlow(doc)).get(offset);
        if (rule?.kind !== 'break' && rule?.kind !== 'omit') return false;
        if (direction > 0) offset += child.nodeSize;
      }
    }
    return false;
  };
}

const enterBoundary: Command = (state, dispatch) => {
  if (!(state.selection instanceof IncludeBoundarySelection)) return false;
  dispatch?.(openParagraph(state.tr, state.selection.$head).scrollIntoView());
  return true;
};

const keydown = keydownHandler({
  ArrowLeft: moveAcrossBoundary(-1, 'left'),
  ArrowRight: moveAcrossBoundary(1, 'right'),
  ArrowUp: moveAcrossBoundary(-1, 'up'),
  ArrowDown: moveAcrossBoundary(1, 'down'),
  Enter: enterBoundary,
});

const boundaryTargets = new WeakMap<Node, DecorationSet>();

function targets(doc: Node) {
  const cached = boundaryTargets.get(doc);
  if (cached) return cached;
  const positions = new Set<number>();
  doc.descendants((node, position) => {
    if (node.type.name === include) {
      positions.add(position);
      positions.add(position + node.nodeSize);
    }
    return !node.isTextblock;
  });
  const decorations = [...positions].flatMap((position) => {
    if (!isIncludeBoundary(doc.resolve(position))) return [];
    return [Decoration.widget(position, (view, getPos) => {
      const target = view.dom.ownerDocument.createElement('div');
      target.className = 'latex-include-boundary';
      target.setAttribute('aria-hidden', 'true');
      const hit = target.appendChild(view.dom.ownerDocument.createElement('span'));
      hit.addEventListener('mousedown', (event) => {
        const pos = getPos();
        if (!view.editable || pos === undefined || event.button !== 0 ||
            event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
        const $pos = view.state.doc.resolve(pos);
        if (!isIncludeBoundary($pos)) return;
        event.preventDefault();
        view.dispatch(view.state.tr.setSelection(new IncludeBoundarySelection($pos)));
        view.focus();
      });
      return target;
    }, { key: 'latex-include-boundary', ignoreSelection: true })];
  });
  const set = DecorationSet.create(doc, decorations);
  boundaryTargets.set(doc, set);
  return set;
}

export function latexIncludeEditing() {
  return new Plugin({
    props: {
      handleKeyDown: keydown,
      createSelectionBetween(view, $anchor, $head) {
        const current = view.state.selection;
        if (!(current instanceof IncludeBoundarySelection) || $anchor.pos !== $head.pos) return null;
        // The DOM caret may be on either side of a widget while the gap is selected.
        return $head.pos === current.head ? current : null;
      },
      handleTextInput(view, from, to, text) {
        const { state } = view;
        if (!(state.selection instanceof IncludeBoundarySelection) || from !== to ||
            from !== state.selection.head) return false;
        view.dispatch(openParagraph(state.tr, state.selection.$head).insertText(text).scrollIntoView());
        return true;
      },
      handlePaste(view, _event, slice) {
        const { state } = view;
        if (!(state.selection instanceof IncludeBoundarySelection) || !slice.size) return false;
        view.dispatch(openParagraph(state.tr, state.selection.$head)
          .replaceSelection(slice).setMeta('paste', true).setMeta('uiEvent', 'paste').scrollIntoView());
        return true;
      },
      handleDOMEvents: {
        beforeinput(view, event) {
          if (event.inputType === 'insertCompositionText' && view.state.selection instanceof IncludeBoundarySelection)
            view.dispatch(openParagraph(view.state.tr, view.state.selection.$head));
          return false;
        },
      },
      decorations(state) {
        const { doc, selection } = state;
        const widgets = targets(doc);
        if (!(selection instanceof IncludeBoundarySelection)) return widgets;
        return widgets.add(doc, [Decoration.widget(selection.head, (view) => {
          const caret = view.dom.ownerDocument.createElement('div');
          caret.className = 'latex-include-caret';
          caret.setAttribute('aria-hidden', 'true');
          return caret;
        }, { key: 'latex-include-caret', ignoreSelection: true })]);
      },
    },
  });
}
