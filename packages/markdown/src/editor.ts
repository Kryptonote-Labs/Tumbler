import { noteCodeBlockView } from './code-block-view';
import type { NoteEditorOptions } from './editor-options';
export { NoteCopyFeedback, type NoteCopyStatus } from './copy-feedback';
export type { NoteEditorOptions } from './editor-options';
import { noteCodeHighlighting } from './code-highlighting';
import { noteHeadingLinks, scrollToNoteHeading } from './heading-links';
import { noteFileQueryHighlighting, followNoteLink } from './file-references';
import { horizontalRuleOnEnter } from './paragraph-commands';
export { noteFileQuery, insertNoteFileReference, followNoteLink } from './file-references';
export { scrollToNoteHeading } from './heading-links';
import { continueAfterNoteCode, indentNoteCode, newlineInNoteCode } from './code-commands';
export {
  noteCodeBlock,
  setNoteCodeLanguage,
  selectNoteCode,
  leaveNoteCode,
  indentNoteCode,
  continueAfterNoteCode,
} from './code-commands';
export { noteCodeLanguages, noteCodeLanguage } from './code-highlighting';
import { taskItemView } from './task-item';
import { notePresencePlugin } from './presence';
import { noteProofreadingPlugin } from './proofreading';
export { noteProseSnapshot, setNoteProofreading } from './proofreading';
export {
  mapNoteRange,
  noteRangeToConfirmed,
  noteRangeFromConfirmed,
  NoteCursorHistory,
  setNoteCursors,
  type NoteRange,
} from './presence';
import { EditorState, Plugin, TextSelection, type Command } from 'prosemirror-state';
import {
  baseKeymap,
  chainCommands,
  toggleMark,
  setBlockType,
  wrapIn,
  exitCode,
} from 'prosemirror-commands';
import { keymap } from 'prosemirror-keymap';
import { history, undo, redo } from 'prosemirror-history';
import {
  inputRules,
  InputRule,
  textblockTypeInputRule,
  wrappingInputRule,
  undoInputRule,
} from 'prosemirror-inputrules';
import { wrapInList, splitListItem, liftListItem, sinkListItem } from 'prosemirror-schema-list';
import { collab } from 'prosemirror-collab';
import { tableEditing, goToNextCell } from 'prosemirror-tables';
import { Fragment, Slice } from 'prosemirror-model';
import {
  noteSchema as schema,
  parseNote,
  serializeNote,
  noteColours,
  type NoteColour,
} from './index';
export { EditorView } from 'prosemirror-view';
export { getVersion, sendableSteps, receiveTransaction } from 'prosemirror-collab';
export { Step } from 'prosemirror-transform';
export { undo, redo, toggleMark, setBlockType, wrapIn, wrapInList, TextSelection };
export type { Command, EditorState };

// Replace only the completed syntax; selection and undo are handled by ProseMirror.
function inlineRule(
  pattern: RegExp,
  mark: string,
  textGroup = 1,
  attrs?: (match: RegExpMatchArray) => Record<string, unknown>,
) {
  return new InputRule(
    pattern,
    (state, match, start, end) => {
      const text = match[textGroup]!;
      const leading = match[0].length - match[0].trimStart().length;
      const from = start + leading;
      const prefix = match[0].indexOf(text, leading);
      const contentStart = start + prefix;
      const contentEnd = contentStart + text.length;
      const tr = state.tr.insertText(match[0].slice(end - start), end);
      tr.delete(contentEnd, start + match[0].length).delete(from, contentStart);
      tr.addMark(from, from + text.length, schema.marks[mark]!.create(attrs?.(match)));
      tr.setStoredMarks(
        state.doc
          .resolve(from)
          .marks()
          .filter((existing) => existing.type !== schema.marks[mark]),
      );
      return tr;
    },
    { inCodeMark: false },
  );
}
export function noteInputRules() {
  return inputRules({
    rules: [
      textblockTypeInputRule(/^(#{1,6})\s$/, schema.nodes.heading!, (match) => ({
        level: match[1]!.length,
      })),
      textblockTypeInputRule(/^```([\w+#.-]*)\s$/, schema.nodes.code_block!, (match) => ({
        params: match[1],
      })),
      wrappingInputRule(/^\s*>\s$/, schema.nodes.blockquote!),
      wrappingInputRule(/^\s*[-+*]\s$/, schema.nodes.bullet_list!),
      wrappingInputRule(
        /^(\d+)\.\s$/,
        schema.nodes.ordered_list!,
        (match) => ({ order: +match[1]! }),
        (match, node) => node.childCount + node.attrs.order === +match[1]!,
      ),
      new InputRule(/^\[([ xX])\]\s$/, (state, match, start, end) => {
        const $from = state.doc.resolve(start);
        if ($from.parent.type !== schema.nodes.paragraph) return null;
        for (let depth = $from.depth; depth > 0; depth--) {
          if ($from.node(depth).type === schema.nodes.list_item) {
            return state.tr
              .delete(start, end)
              .setNodeMarkup($from.before(depth), undefined, { checked: match[1] !== ' ' });
          }
        }
        return null;
      }),
      new InputRule(/^\[!([\w-]+)\]\s$/, (state, match, start, end) => {
        const $from = state.doc.resolve(start);
        if ($from.depth < 2 || $from.node($from.depth - 1).type !== schema.nodes.blockquote)
          return null;
        return state.tr
          .delete(start, end)
          .setNodeMarkup($from.before($from.depth - 1), schema.nodes.callout!, {
            kind: match[1]!.toLowerCase(),
          });
      }),
      inlineRule(/\*\*([^*]+)\*\*$/, 'strong'),
      inlineRule(/(?:^|\s)\*([^*]+)\*$/, 'em'),
      inlineRule(/~~([^~]+)~~$/, 'strike'),
      inlineRule(/`([^`]+)`$/, 'code'),
      inlineRule(/==(?:(🔴|🟠|🟡|🟢|🔵|🟣))?([^=\n]+)==$/, 'highlight', 2, (match) => ({
        colour: noteColours.find((colour) => colour.emoji === match[1])?.name ?? 'yellow',
      })),
      inlineRule(/(?<![=\\])=(🔴|🟠|🟡|🟢|🔵|🟣)([^=\n]+)=$/, 'colour', 2, (match) => ({
        colour: noteColours.find((colour) => colour.emoji === match[1])!.name,
      })),
      new InputRule(/\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]$/, (state, match, start, end) => {
        const text = match[2] ?? match[1]!.replace(/^\/+/, '');
        return state.tr
          .insertText(text, start, end)
          .addMark(start, start + text.length, schema.marks.wikilink!.create({ target: match[1] }))
          .removeStoredMark(schema.marks.wikilink!);
      }),
      new InputRule(/^(?:---|\*\*\*)\s$/, (state, _match, start, end) =>
        state.tr.delete(start, end).replaceSelectionWith(schema.nodes.horizontal_rule!.create()),
      ),
    ],
  });
}
export function noteState(
  markdown: string,
  version = 0,
  clientID?: string,
  document?: import('prosemirror-model').Node,
  options: NoteEditorOptions = {},
) {
  return EditorState.create({
    schema,
    doc: document ?? parseNote(markdown),
    plugins: [
      noteInputRules(),
      noteCodeHighlighting(),
      noteHeadingLinks(),
      noteFileQueryHighlighting(),
      notePresencePlugin(),
      noteProofreadingPlugin(),
      keymap({
        'Ctrl-Space': followNoteLink,
        'Mod-z': undo,
        'Mod-y': redo,
        'Shift-Mod-z': redo,
        Backspace: undoInputRule,
        'Mod-b': toggleMark(schema.marks.strong!),
        'Mod-i': toggleMark(schema.marks.em!),
        'Mod-`': toggleMark(schema.marks.code!),
        Enter: chainCommands(newlineInNoteCode, horizontalRuleOnEnter, (state, dispatch, view) => {
          const position = state.selection.$from;
          const fence = /^```([\w+#.-]*)$/.exec(position.parent.textContent);
          if (position.parent.type === schema.nodes.paragraph && fence) {
            dispatch?.(
              state.tr
                .delete(position.start(), position.end())
                .setNodeMarkup(position.before(), schema.nodes.code_block!, {
                  params: fence[1],
                }),
            );
            return true;
          }
          let task = false;
          for (let depth = position.depth; depth > 0; depth--)
            if (
              position.node(depth).type === schema.nodes.list_item &&
              position.node(depth).attrs.checked !== null
            )
              task = true;
          return splitListItem(schema.nodes.list_item!, task ? { checked: false } : undefined)(
            state,
            dispatch,
            view,
          );
        }),
        Tab: chainCommands(
          indentNoteCode(),
          goToNextCell(1),
          sinkListItem(schema.nodes.list_item!),
        ),
        'Shift-Tab': chainCommands(
          indentNoteCode(true),
          goToNextCell(-1),
          liftListItem(schema.nodes.list_item!),
        ),
        'Mod-Enter': exitCode,
        'Mod-Alt-0': setBlockType(schema.nodes.paragraph!),
        ...Object.fromEntries(
          [1, 2, 3, 4, 5, 6].map((level) => [
            `Mod-Alt-${level}`,
            setBlockType(schema.nodes.heading!, { level }),
          ]),
        ),
      }),
      keymap(baseKeymap),
      history(),
      collab(clientID === undefined ? { version } : { version, clientID }),
      tableEditing(),
      new Plugin({
        view: (view) => {
          let editable = view.editable;
          return {
            update: () => {
              if (editable === view.editable) return;
              editable = view.editable;
              for (const checkbox of view.dom.querySelectorAll<HTMLInputElement>(
                'input[data-note-task]',
              ))
                checkbox.disabled = !view.editable;
              for (const language of view.dom.querySelectorAll<HTMLElement>('.note-code-language'))
                language.inert = !view.editable;
            },
          };
        },
        props: {
          nodeViews: { list_item: taskItemView, code_block: noteCodeBlockView(options) },
          markViews: options.wikiLinkView ? { wikilink: options.wikiLinkView } : {},
          clipboardTextSerializer: (slice) =>
            slice.content.firstChild?.type.name.startsWith('table_')
              ? slice.content.textBetween(0, slice.content.size, '\t')
              : serializeNote(schema.topNodeType.create(null, slice.content)),
          clipboardTextParser: (text, $context, plain) => {
            if (plain || $context.parent.type.spec.code)
              return new Slice(text ? Fragment.from(schema.text(text)) : Fragment.empty, 0, 0);
            return Slice.maxOpen(parseNote(text).content);
          },
          handleDOMEvents: {
            mousedown: continueAfterNoteCode,
            click: (view, event) => {
              if (event.defaultPrevented) return true;
              const link =
                event.target instanceof view.dom.ownerDocument.defaultView!.Element
                  ? event.target.closest('a')
                  : null;
              if (!link) return false;
              const reference = link.getAttribute('data-wikilink');
              const fragment = reference?.startsWith('#')
                ? reference
                : reference
                  ? undefined
                  : link.getAttribute('href');
              if (fragment?.startsWith('#')) {
                event.preventDefault();
                scrollToNoteHeading(view, fragment);
                return true;
              }
              return false;
            },
          },
        },
      }),
    ],
  });
}
export { lift } from 'prosemirror-commands';
export { selectAll } from 'prosemirror-commands';
export {
  addRowAfter,
  addColumnAfter,
  deleteRow,
  deleteColumn,
  deleteTable,
  isInTable,
} from 'prosemirror-tables';
export function insertNoteTable(): Command {
  return (state, dispatch) => {
    const paragraph = () => schema.nodes.paragraph!.create();
    const row = (header: boolean) =>
      schema.nodes.table_row!.create(
        null,
        [0, 1, 2].map(() =>
          schema.nodes[header ? 'table_header' : 'table_cell']!.create(null, paragraph()),
        ),
      );
    const table = schema.nodes.table!.create(null, [row(true), row(false), row(false)]);
    if (dispatch) dispatch(state.tr.replaceSelectionWith(table).scrollIntoView());
    return true;
  };
}

/** Applying another colour replaces the current colour. Applying the same colour clears it. */
export function setNoteColour(kind: 'colour' | 'highlight', colour: NoteColour): Command {
  return (state, dispatch) => {
    const type = schema.marks[kind]!;
    const { from, to, empty } = state.selection;
    const active = (state.storedMarks ?? state.selection.$from.marks()).find(
      (mark) => mark.type === type,
    );
    if (dispatch) {
      const tr = state.tr;
      if (empty) {
        if (active?.attrs.colour === colour) tr.removeStoredMark(type);
        else tr.addStoredMark(type.create({ colour }));
      } else {
        let same = true;
        state.doc.nodesBetween(from, to, (node) => {
          if (
            node.isText &&
            !node.marks.some((mark) => mark.type === type && mark.attrs.colour === colour)
          )
            same = false;
        });
        if (same) tr.removeMark(from, to, type);
        else tr.addMark(from, to, type.create({ colour }));
      }
      dispatch(tr);
    }
    return true;
  };
}

/** Clear inline marks in the selection, or stop inheriting marks for subsequent typing. */
export const clearNoteFormatting: Command = (state, dispatch) => {
  const { from, to, empty, $from } = state.selection;
  if (empty) {
    if (!(state.storedMarks ?? $from.marks()).length) return false;
    dispatch?.(state.tr.setStoredMarks([]));
    return true;
  }
  let formatted = false;
  state.doc.nodesBetween(from, to, (node) => {
    if (node.isText && node.marks.length) formatted = true;
    return !formatted;
  });
  if (!formatted) return false;
  dispatch?.(state.tr.removeMark(from, to).setStoredMarks([]));
  return true;
};
