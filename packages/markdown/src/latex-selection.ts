import type { Node, ResolvedPos } from 'prosemirror-model';
import { NodeSelection, Plugin, Selection, TextSelection } from 'prosemirror-state';
import type { Mappable } from 'prosemirror-transform';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';

/** Whether an object, such as the title or an equation, lies wholly between two positions. */
function holdsObject(doc: Node, a: number, b: number) {
  const from = Math.min(a, b),
    to = Math.max(a, b);
  let found = false;
  doc.nodesBetween(from, to, (node, position) => {
    if (found) return false;
    if (node.isAtom && !node.isText && position >= from && position + node.nodeSize <= to)
      found = true;
    return !found;
  });
  return found;
}

/**
 * A range whose end sits beside an object with no text beyond it, such as before the title at the
 * top of the page. A text selection would have to stop short of the object and leave it out.
 */
export class LatexRangeSelection extends Selection {
  map(doc: Node, mapping: Mappable): Selection {
    return latexRangeSelection(
      doc.resolve(mapping.map(this.anchor)),
      doc.resolve(mapping.map(this.head)),
    );
  }

  eq(other: Selection): boolean {
    return (
      other instanceof LatexRangeSelection &&
      other.anchor === this.anchor &&
      other.head === this.head
    );
  }

  toJSON() {
    return { type: 'latex-range', anchor: this.anchor, head: this.head };
  }

  static override fromJSON(doc: Node, json: { anchor: number; head: number }) {
    return latexRangeSelection(doc.resolve(json.anchor), doc.resolve(json.head));
  }
}
Selection.jsonID('latex-range', LatexRangeSelection);

/**
 * The selection between two positions. Ends between blocks move into the nearest text, as usual,
 * unless that would leave an object out of the range; then they stay where they are.
 */
export function latexRangeSelection($anchor: ResolvedPos, $head: ResolvedPos): Selection {
  const text = TextSelection.between($anchor, $head);
  if ($anchor.pos === $head.pos) return text;
  const doc = $anchor.doc;
  const keep = ($raw: ResolvedPos, $text: ResolvedPos) =>
    !$raw.parent.inlineContent && holdsObject(doc, $raw.pos, $text.pos) ? $raw : $text;
  const $from = keep($anchor, text.$anchor),
    $to = keep($head, text.$head);
  if ($from === text.$anchor && $to === text.$head) return text;
  return new LatexRangeSelection($from, $to);
}

/**
 * Where a range reaches when the pointer is over a block object beside its end. The browser places
 * the end on whichever side of the object it likes; a range dragged into an object takes it in.
 */
function throughObject(view: EditorView, $anchor: ResolvedPos, $head: ResolvedPos) {
  if ($head.parent.inlineContent) return $head;
  const focus = view.dom.ownerDocument.getSelection()?.focusNode ?? null;
  const forward = $head.pos >= $anchor.pos;
  const sides = [
    [$head.nodeBefore, $head.pos - ($head.nodeBefore?.nodeSize ?? 0)],
    [$head.nodeAfter, $head.pos],
  ] as const;
  for (const [node, start] of sides) {
    if (!node?.isAtom || !node.isBlock || !view.nodeDOM(start)?.contains(focus)) continue;
    return $head.doc.resolve(forward ? start + node.nodeSize : start);
  }
  return $head;
}

/**
 * Objects inside a range selection, such as equations, citations and the title, show as selected
 * whole, as an image does in a word processor; their own fields take no part in it. A range
 * dragged past an object at the edge of the page takes the object in.
 */
export function latexObjectSelection() {
  return new Plugin({
    props: {
      createSelectionBetween: (view, $anchor, $head) => {
        const selection = latexRangeSelection($anchor, throughObject(view, $anchor, $head));
        return selection instanceof LatexRangeSelection ? selection : null;
      },
      decorations({ doc, selection }) {
        if (selection.empty || selection instanceof NodeSelection) return null;
        const selected: Decoration[] = [];
        doc.nodesBetween(selection.from, selection.to, (node, position) => {
          if (!node.isAtom || node.isText) return;
          if (position >= selection.from && position + node.nodeSize <= selection.to)
            selected.push(
              Decoration.node(position, position + node.nodeSize, {
                class: 'latex-in-selection',
              }),
            );
          return false;
        });
        return selected.length ? DecorationSet.create(doc, selected) : null;
      },
    },
  });
}
