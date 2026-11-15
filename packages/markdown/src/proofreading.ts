import type { Node } from 'prosemirror-model';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';

export type NoteProofreadingSpan = { from: number; to: number; spelling: boolean };
export const noteProofreadingKey = new PluginKey<DecorationSet>('note-proofreading');
/** Read model text, never DOM text: formatting and presence widgets cannot split a checked word. */
export function noteProseSnapshot(doc: Node) {
  let text = '';
  const blocks: { start: number; end: number; from: number }[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return;
    if (node.type.spec.code) return false;
    const start = text.length;
    node.forEach((child) => {
      if (child.isText)
        text += child.marks.some((mark) => mark.type.name === 'code')
          ? ' '.repeat(child.nodeSize)
          : child.text;
      else text += child.type.name === 'hard_break' ? '\n' : ' '.repeat(child.nodeSize);
    });
    blocks.push({ start, end: text.length, from: pos + 1 });
    text += '\n';
    return false;
  });
  return {
    text,
    range(start: number, end: number) {
      let left = 0;
      let right = blocks.length - 1;
      while (left <= right) {
        const middle = (left + right) >>> 1;
        if (blocks[middle]!.start <= start) left = middle + 1;
        else right = middle - 1;
      }
      const block = blocks[right];
      if (!block || end > block.end) return;
      const from = block.from + start - block.start;
      const to = block.from + end - block.start;
      let excluded = false;
      doc.nodesBetween(from, to, (node) => {
        if ((node.isInline && !node.isText) || node.marks.some((mark) => mark.type.name === 'code'))
          excluded = true;
        return !excluded;
      });
      if (excluded) return;
      return { from, to };
    },
  };
}
export function noteProofreadingPlugin() {
  return new Plugin<DecorationSet>({
    key: noteProofreadingKey,
    state: {
      init: () => DecorationSet.empty,
      apply(tr, current) {
        const issues: NoteProofreadingSpan[] | undefined = tr.getMeta(noteProofreadingKey);
        if (!issues) return tr.docChanged ? current.map(tr.mapping, tr.doc) : current;
        return DecorationSet.create(
          tr.doc,
          issues.map((issue) =>
            Decoration.inline(issue.from, issue.to, {
              class: issue.spelling ? 'note-spelling-issue' : 'note-grammar-issue',
            }),
          ),
        );
      },
    },
    props: {
      decorations(state) {
        return noteProofreadingKey.getState(state);
      },
    },
  });
}
export function setNoteProofreading(view: EditorView, issues: NoteProofreadingSpan[]) {
  if (!view.isDestroyed)
    view.dispatch(
      view.state.tr.setMeta(noteProofreadingKey, issues).setMeta('addToHistory', false),
    );
}
