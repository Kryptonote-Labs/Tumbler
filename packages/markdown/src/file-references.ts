import { Plugin, TextSelection, type EditorState, type Command } from 'prosemirror-state';
import { closeHistory } from 'prosemirror-history';
import { Decoration, DecorationSet } from 'prosemirror-view';

/** The unfinished workspace reference at the caret, read from model text rather than DOM labels. */
export function noteFileQuery(state: EditorState) {
  const { selection } = state;
  const { $from } = selection;
  if (
    !selection.empty ||
    $from.parent.type.spec.code ||
    $from.marks().some((mark) => ['code', 'wikilink', 'link'].includes(mark.type.name))
  )
    return;
  const before = $from.parent.textBetween(0, $from.parentOffset, undefined, (node) =>
    node.type.name === 'hard_break' ? '\n' : '\ufffc',
  );
  const match = /(?<!\\)\[\[\/([^\[\]\n|]*)$/.exec(before);
  if (!match) return;
  return { from: selection.from - match[0].length, to: selection.from, query: match[1]! };
}

export function insertNoteFileReference(
  target: string,
  label: string,
  expected: NonNullable<ReturnType<typeof noteFileQuery>>,
): Command {
  return (state, dispatch) => {
    const query = noteFileQuery(state);
    if (
      !query ||
      query.from !== expected.from ||
      query.to !== expected.to ||
      query.query !== expected.query
    )
      return false;
    const tr = state.tr
      .insertText(label, query.from, query.to)
      .addMark(
        query.from,
        query.from + label.length,
        state.schema.marks.wikilink!.create({ target }),
      )
      .removeStoredMark(state.schema.marks.wikilink!);
    tr.setSelection(TextSelection.create(tr.doc, query.from + label.length));
    dispatch?.(closeHistory(tr).scrollIntoView());
    return true;
  };
}

export function noteFileQueryHighlighting() {
  return new Plugin({
    props: {
      decorations(state) {
        const query = noteFileQuery(state);
        return query
          ? DecorationSet.create(state.doc, [
              Decoration.inline(query.from, query.to, { class: 'note-file-query' }),
            ])
          : null;
      },
    },
  });
}

/** Keyboard activation goes through the same link click path as pointer activation. */
export const followNoteLink: Command = (state, _dispatch, view) => {
  if (!view) return false;
  const window = view.dom.ownerDocument.defaultView!;
  const active = view.dom.ownerDocument.activeElement;
  const focused = active instanceof window.Element ? active.closest('a') : null;
  if (focused && view.dom.contains(focused)) {
    focused.click();
    return true;
  }
  const { $from } = state.selection;
  const marks = [
    ...$from.marks(),
    ...($from.nodeBefore?.marks ?? []),
    ...($from.nodeAfter?.marks ?? []),
  ];
  if (!marks.some((mark) => mark.type.name === 'link' || mark.type.name === 'wikilink'))
    return false;
  for (const pos of [
    $from.pos,
    Math.min($from.end(), $from.pos + 1),
    Math.max($from.start(), $from.pos - 1),
  ]) {
    const { node } = view.domAtPos(pos);
    const element = node instanceof window.Element ? node : node.parentElement;
    const link = element?.closest('a');
    if (link && view.dom.contains(link)) {
      link.click();
      return true;
    }
  }
  return false;
};
