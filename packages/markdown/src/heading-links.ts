import { Plugin } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import type { Node } from 'prosemirror-model';
import { noteHeadings } from './headings';

/** Fragment navigation is local to this editor, without changing the app URL or another pane. */
export function scrollToNoteHeading(view: EditorView, fragment: string) {
  let target: string;
  try {
    target = decodeURIComponent(fragment.replace(/^#/, '')).normalize('NFC').toLowerCase();
  } catch {
    return false;
  }
  const headings = noteHeadings(view.state.doc);
  const heading =
    headings.find(({ slug }) => slug === target) ??
    headings.find(({ text }) => text.normalize('NFC').toLowerCase() === target);
  if (!heading) return false;
  const dom = view.nodeDOM(heading.pos);
  if (!(dom instanceof view.dom.ownerDocument.defaultView!.HTMLElement)) return false;
  dom.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'instant' });
  return true;
}

export function noteHeadingLinks() {
  const decorations = (doc: Node) =>
    DecorationSet.create(
      doc,
      noteHeadings(doc).map(({ slug, pos }) =>
        Decoration.node(pos, pos + doc.nodeAt(pos)!.nodeSize, { 'data-note-heading': slug }),
      ),
    );
  function touchesHeading(doc: Node, from: number, to: number) {
    let found = false;
    doc.nodesBetween(Math.max(0, from - 1), Math.min(doc.content.size, to + 1), (node) => {
      if (node.type.name === 'heading') found = true;
      return !node.isTextblock;
    });
    return found;
  }
  return new Plugin<DecorationSet>({
    state: {
      init: (_config, state) => decorations(state.doc),
      apply(tr, previous) {
        if (!tr.docChanged) return previous;
        const start = tr.before.content.findDiffStart(tr.doc.content);
        if (start === null) return previous;
        const end = tr.before.content.findDiffEnd(tr.doc.content);
        const mapped = previous.map(tr.mapping, tr.doc);
        if (
          mapped.find().length !== previous.find().length ||
          touchesHeading(tr.before, start, Math.max(start, end?.a ?? start)) ||
          touchesHeading(tr.doc, start, Math.max(start, end?.b ?? start))
        )
          return decorations(tr.doc);
        return mapped;
      },
    },
    props: {
      decorations(state) {
        return this.getState(state);
      },
    },
  });
}
