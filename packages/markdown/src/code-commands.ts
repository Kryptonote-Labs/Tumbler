import { closeHistory } from 'prosemirror-history';
import { NodeSelection, TextSelection, type Command, type EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

/** Clicking empty space beneath a final code block starts a paragraph outside it. */
export function continueAfterNoteCode(view: EditorView, event: MouseEvent) {
  if (
    !view.editable ||
    event.defaultPrevented ||
    event.button !== 0 ||
    event.shiftKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    !(event.target instanceof HTMLElement) ||
    (event.target !== view.dom && !event.target.contains(view.dom))
  )
    return false;
  const { state } = view;
  const last = state.doc.lastChild;
  if (last?.type.name !== 'code_block') return false;
  const block = view.nodeDOM(state.doc.content.size - last.nodeSize);
  if (!(block instanceof HTMLElement)) return false;
  const bounds = view.dom.getBoundingClientRect();
  if (
    event.clientY < block.getBoundingClientRect().bottom ||
    event.clientX < bounds.left ||
    event.clientX > bounds.right
  )
    return false;
  const after = state.doc.content.size;
  const paragraph = state.schema.nodes.paragraph;
  if (!paragraph) return false;
  const tr = state.tr.insert(after, paragraph.create());
  view.dispatch(
    closeHistory(tr.setSelection(TextSelection.create(tr.doc, after + 1))).scrollIntoView(),
  );
  view.focus();
  event.preventDefault();
  return true;
}

/** A single code block targeted by the cursor, text selection, or block selection. */
export function noteCodeBlock(state: EditorState) {
  const { selection } = state;
  if (selection instanceof NodeSelection && selection.node.type.name === 'code_block')
    return { node: selection.node, pos: selection.from };
  if (
    selection.$from.parent.type.name !== 'code_block' ||
    !selection.$from.sameParent(selection.$to)
  )
    return;
  return { node: selection.$from.parent, pos: selection.$from.before() };
}

export function setNoteCodeLanguage(params: string): Command {
  return (state, dispatch) => {
    const block = noteCodeBlock(state);
    if (!block) return false;
    dispatch?.(state.tr.setNodeMarkup(block.pos, undefined, { ...block.node.attrs, params }));
    return true;
  };
}

export const selectNoteCode: Command = (state, dispatch) => {
  const block = noteCodeBlock(state);
  if (!block) return false;
  dispatch?.(
    state.tr.setSelection(
      TextSelection.create(state.doc, block.pos + 1, block.pos + block.node.nodeSize - 1),
    ),
  );
  return true;
};

export const leaveNoteCode: Command = (state, dispatch) => {
  const block = noteCodeBlock(state);
  const paragraph = state.schema.nodes.paragraph;
  if (!block || !paragraph) return false;
  const after = block.pos + block.node.nodeSize;
  const position = state.doc.resolve(after);
  if (!position.parent.canReplaceWith(position.index(), position.index(), paragraph)) return false;
  if (dispatch) {
    const tr = state.tr.insert(after, paragraph.create());
    dispatch(tr.setSelection(TextSelection.create(tr.doc, after + 1)).scrollIntoView());
  }
  return true;
};

/** Tab inserts two spaces; selected lines and Shift+Tab change their leading indentation. */
export function indentNoteCode(outdent = false): Command {
  return (state, dispatch) => {
    const block = noteCodeBlock(state);
    if (!block) return false;
    const { selection } = state;
    const origin = block.pos + 1;
    const text = block.node.textContent;
    if (selection.empty && !outdent) {
      dispatch?.(state.tr.insertText('  '));
      return true;
    }
    const from = Math.max(0, selection.from - origin);
    const to = Math.min(text.length, selection.to - origin);
    const first = text.slice(0, from).lastIndexOf('\n') + 1;
    const last = to > from && text[to - 1] === '\n' ? to - 1 : to;
    const lines: number[] = [];
    for (let at = first; at <= last;) {
      lines.push(at);
      const next = text.indexOf('\n', at);
      if (next < 0) break;
      at = next + 1;
    }
    const tr = state.tr;
    for (const at of lines.reverse()) {
      if (!outdent) tr.insertText('  ', origin + at);
      else {
        const length = text[at] === '\t' ? 1 : (/^ {1,2}/.exec(text.slice(at))?.[0].length ?? 0);
        if (length) tr.delete(origin + at, origin + at + length);
      }
    }
    dispatch?.(tr);
    return true;
  };
}

export const newlineInNoteCode: Command = (state, dispatch) => {
  const block = noteCodeBlock(state);
  if (!block || state.selection instanceof NodeSelection) return false;
  const offset = state.selection.from - block.pos - 1;
  const text = block.node.textContent;
  const lineStart = text.slice(0, offset).lastIndexOf('\n') + 1;
  const line = text.slice(lineStart, offset);
  if (state.selection.empty && offset === text.length && lineStart > 0 && /^[ \t]*$/.test(line)) {
    // The second Enter removes the empty final code line and adds a paragraph after the block.
    return leaveNoteCode(
      state,
      dispatch
        ? (tr) =>
            dispatch(closeHistory(tr.delete(block.pos + lineStart, block.pos + 1 + text.length)))
        : undefined,
    );
  }
  const indent = /^[ \t]*/.exec(line)?.[0] ?? '';
  dispatch?.(state.tr.insertText('\n' + indent).scrollIntoView());
  return true;
};
