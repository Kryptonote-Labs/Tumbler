import { Fragment } from 'prosemirror-model';
import { closeHistory } from 'prosemirror-history';
import { TextSelection, type Command } from 'prosemirror-state';

/** Enter commits a standalone rule delimiter and leaves an editable paragraph after it. */
export const horizontalRuleOnEnter: Command = (state, dispatch) => {
  const { selection } = state;
  const position = selection.$from;
  if (
    !selection.empty ||
    position.parent.type.name !== 'paragraph' ||
    position.parentOffset !== position.parent.content.size ||
    !/^[ \t]*(?:(?:-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})$/.test(
      position.parent.textContent,
    )
  )
    return false;
  const rule = state.schema.nodes.horizontal_rule!.create();
  const paragraph = state.schema.nodes.paragraph!.create();
  const content = Fragment.fromArray([rule, paragraph]);
  const from = position.before();
  const container = state.doc.resolve(from);
  if (!container.parent.canReplace(container.index(), container.index() + 1, content)) return false;
  if (dispatch) {
    const tr = state.tr.replaceWith(from, position.after(), content);
    tr.setSelection(TextSelection.create(tr.doc, from + rule.nodeSize + 1));
    dispatch(closeHistory(tr).scrollIntoView());
  }
  return true;
};
