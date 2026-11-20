import {
  baseKeymap,
  chainCommands,
  createParagraphNear,
  splitBlockAs,
  toggleMark,
} from 'prosemirror-commands';
import { collab } from 'prosemirror-collab';
import { history, redo, undo } from 'prosemirror-history';
import { InputRule, inputRules, undoInputRule, wrappingInputRule } from 'prosemirror-inputrules';
import { keymap } from 'prosemirror-keymap';
import { Fragment, Slice, type Mark, type Node } from 'prosemirror-model';
import { liftListItem, sinkListItem, splitListItem } from 'prosemirror-schema-list';
import {
  EditorState,
  Plugin,
  PluginKey,
  TextSelection,
  type Command,
  type Transaction,
} from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView, type NodeViewConstructor } from 'prosemirror-view';
import { environmentAt, verbatimEnd } from './latex-syntax';
import { noteSchema as schema } from './index';
import { latexClipboard } from './latex-clipboard';
import { latexHeadings, parseLatex, serializeLatex } from './latex';
import { latexNumberingPlugin } from './latex-numbering-view';
export { latexNumberSpec, type LatexNumberSpec } from './latex-numbering-view';
import { notePresencePlugin } from './presence';
import { noteProofreadingPlugin } from './proofreading';

export type LatexNodeViews = Record<string, NodeViewConstructor>;
type Style = 'strong' | 'em';

function hasStyle(mark: Mark, style: Style) {
  return (
    mark.type.name === style || (mark.type.name === 'latex_style' && mark.attrs.style === style)
  );
}

export function latexStyleActive(state: EditorState, style: Style) {
  const { empty, from, to, $from } = state.selection;
  if (empty) return (state.storedMarks ?? $from.marks()).some((mark) => hasStyle(mark, style));
  let active = false;
  state.doc.nodesBetween(from, to, (node) => {
    if (node.isInline && node.marks.some((mark) => hasStyle(mark, style))) active = true;
    return !active;
  });
  return active;
}

export function toggleLatexStyle(style: Style): Command {
  return (state, dispatch) => {
    if (!latexStyleActive(state, style)) return toggleMark(schema.marks[style]!)(state, dispatch);
    const { empty, from, to, $from } = state.selection;
    if (!dispatch) return true;
    const tr = state.tr;
    if (empty) {
      tr.setStoredMarks(
        (state.storedMarks ?? $from.marks()).filter((mark) => !hasStyle(mark, style)),
      );
    } else {
      state.doc.nodesBetween(from, to, (node, position) => {
        if (!node.isInline) return;
        for (const mark of node.marks)
          if (hasStyle(mark, style))
            tr.removeMark(Math.max(from, position), Math.min(to, position + node.nodeSize), mark);
      });
    }
    dispatch(tr);
    return true;
  };
}

export function latexHeading(level: number, command?: 'part' | 'chapter'): Command {
  return (state, dispatch) => {
    const { from, to } = state.selection;
    const tr = state.tr;
    state.doc.nodesBetween(from, to, (node, position) => {
      if (!node.isTextblock) return;
      const type = schema.nodes[level ? 'heading' : 'paragraph']!;
      const open = command ? '\\' + command + '{' : null;
      const currentCommand = String(node.attrs.open ?? '').match(/^\\(part|chapter)\b/)?.[1];
      if (
        node.type === type &&
        (!level || (node.attrs.level === level && currentCommand === command))
      )
        return false;
      if (
        state.doc
          .resolve(position)
          .parent.canReplaceWith(
            state.doc.resolve(position).index(),
            state.doc.resolve(position).index() + 1,
            type,
          )
      )
        tr.setNodeMarkup(position, type, {
          before: node.attrs.before,
          ...(level ? { level, open } : {}),
        });
      return false;
    });
    if (!tr.docChanged) return false;
    dispatch?.(tr.scrollIntoView());
    return true;
  };
}

export function insertLatexMath(display: boolean): Command {
  return (state, dispatch) => {
    const type = schema.nodes[display ? 'latex_display_math' : 'latex_math']!;
    const source = state.doc.textBetween(state.selection.from, state.selection.to, ' ');
    dispatch?.(state.tr.replaceSelectionWith(type.create({ source }), false).scrollIntoView());
    return true;
  };
}

// Require a delimiter so a shorter command cannot capture the start of a longer one.
const mathSymbol =
  /(?<![\w\\$])(\\(?:infty|alpha|beta|gamma|delta|epsilon|theta|lambda|mu|pi|rho|sigma|phi|omega|Gamma|Delta|Theta|Lambda|Pi|Sigma|Phi|Omega|times|cdot|pm|leq|geq|neq|approx|to|rightarrow|leftarrow|sum|prod|int|partial|nabla)) $/;

// Like Pandoc, `$` opens math only before a non-space and closes it only after a non-space,
// so "costs $5 and $10" stays text. A digit-led span with no letters or operators is currency.
const inlineDollars = /(?<![\\$\w])\$(?=[^\s$])([^$\n]*[^\s$\\])\$$/;
const currency = /^\d[\d.,]*(?:\s|[-–/]|$)(?![\s\S]*[A-Za-z\\^_=+*<>])/;
const unfinishedDollar = /(?<![\\$])\$(?=[^\s$\d])[^$]*$/;

/**
 * Escape the dollars in pasted prose that typing would also keep as text. A pair is math only
 * when it opens before a non-space, closes after one, is not followed by a digit and does not
 * read as an amount. A whole document pastes as written.
 */
export function pastedLatexText(text: string) {
  if (/\\(?:documentclass|begin\s*\{document\})/.test(text)) return text;
  const literal: { from: number; to: number }[] = [];
  for (const match of text.matchAll(/(?<!\\)\\(?:begin\s*\{(?:verbatim\*?|Verbatim|lstlisting|minted)\}|verb\*?(?![A-Za-z]))/g)) {
    const from = match.index;
    if (from < (literal.at(-1)?.to ?? 0)) continue;
    const to = match[0].startsWith('\\begin')
      ? environmentAt(text, from)?.end ?? text.length
      : verbatimEnd(text, from + match[0].length);
    literal.push({ from, to });
  }
  let result = '';
  let position = 0;
  while (position < text.length) {
    const open = text.indexOf('$', position);
    if (open < 0) break;
    const protectedText = literal.find(({ from, to }) => from <= open && open < to);
    if (protectedText) {
      result += text.slice(position, protectedText.to);
      position = protectedText.to;
      continue;
    }
    if (text[open - 1] === '\\' || text[open + 1] === '$') {
      const skip = text[open + 1] === '$' ? text.indexOf('$$', open + 2) : open;
      const end = skip < 0 ? text.length : skip + (text[open + 1] === '$' ? 2 : 1);
      result += text.slice(position, end);
      position = end;
      continue;
    }
    let close = -1;
    for (let next = text.indexOf('$', open + 1); next >= 0; next = text.indexOf('$', next + 1)) {
      if (text[next - 1] === '\\' || literal.some(({ from }) => from > open && from < next)) continue;
      if (/\s/.test(text[next - 1]!) || /\d/.test(text[next + 1] ?? '')) continue;
      close = next;
      break;
    }
    const content = close < 0 ? '' : text.slice(open + 1, close);
    const math = close > open + 1 && !/^\s/.test(content) && !content.includes('\n') && (!currency.test(content) || /^\d+(?:[.,]\d+)?$/.test(content));
    if (math) {
      result += text.slice(position, close + 1);
      position = close + 1;
    } else {
      result += text.slice(position, open) + '\\$';
      position = open + 1;
    }
  }
  return result + text.slice(position);
}

function latexInputRules() {
  const formatting = (pattern: RegExp, style: Style) =>
    new InputRule(pattern, (state, match, start, end) => {
      const text = match[1];
      return text
        ? state.tr
            .replaceWith(start, end, schema.text(text, [schema.marks[style]!.create()]))
            .removeStoredMark(schema.marks[style]!)
        : null;
    });
  const math = (pattern: RegExp, display: boolean, open: string, close: string) =>
    new InputRule(pattern, (state, match, start, end) =>
      state.tr.replaceWith(
        start,
        end,
        schema.nodes[display ? 'latex_display_math' : 'latex_math']!.create({
          source: match[1],
          open,
          close,
        }),
      ),
    );
  return inputRules({
    rules: [
      new InputRule(
        /^\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\{([^{}]*)\}$/,
        (state, match, start, end) => {
          const block = state.doc.resolve(start);
          if (end !== block.end() || !block.parent.isTextblock) return null;
          const node = schema.nodes.heading!.create(
            {
              level: Math.max(1, latexHeadings.indexOf(match[1]!) + 1),
              before: block.parent.attrs.before,
              open: '\\' + match[1] + '{',
            },
            match[2] ? schema.text(match[2]) : undefined,
          );
          return state.tr.replaceWith(block.before(), block.after(), node);
        },
      ),
      new InputRule(/^(#{1,5}) $/, (state, match, start, end) =>
        state.tr
          .delete(start, end)
          .setNodeMarkup(state.doc.resolve(start).before(), schema.nodes.heading!, {
            level: match[1]!.length,
            before: state.selection.$from.parent.attrs.before,
          }),
      ),
      formatting(/\\textbf\{([^{}]+)\}$/, 'strong'),
      formatting(/\\(?:emph|textit)\{([^{}]+)\}$/, 'em'),
      formatting(/\*\*([^*]+)\*\*$/, 'strong'),
      formatting(/\*([^*]+)\*$/, 'em'),
      new InputRule(mathSymbol, (state, match, start, end) => {
        const position = state.doc.resolve(start);
        const before = position.parent.textBetween(0, position.parentOffset);
        // Leave unfinished explicit math alone until its closing delimiter arrives. A dollar
        // followed by a space or digit is currency, not an opening delimiter.
        if (unfinishedDollar.test(before) || before.lastIndexOf('\\(') > before.lastIndexOf('\\)'))
          return null;
        return spaceAfter(
          state.tr.replaceWith(start, end, schema.nodes.latex_math!.create({ source: match[1] })),
          start + 1,
        );
      }),
      math(/^\$\$([^$]+)\$\$$/, true, '$$', '$$'),
      math(/^\\\[([^\n]+)\\\]$/, true, '\\[', '\\]'),
      math(/\\\(([^\n]+)\\\)$/, false, '\\(', '\\)'),
      new InputRule(inlineDollars, (state, match, start, end) =>
        currency.test(match[1]!)
          ? null
          : state.tr.replaceWith(
              start,
              end,
              schema.nodes.latex_math!.create({
                source: match[1],
                open: '$',
                close: '$',
              }),
            ),
      ),
      wrappingInputRule(/^[-*] $/, schema.nodes.bullet_list!),
      wrappingInputRule(/^1\. $/, schema.nodes.ordered_list!),
    ],
  });
}

// A trailing space needs to be visible to the caret, but must stay an ordinary space in TeX.
const typedSpaceKey = new PluginKey<number | null>('latex-typed-space');

function typedSpaces() {
  let normalizing = false;
  return new Plugin<number | null>({
    key: typedSpaceKey,
    state: {
      init: () => null,
      apply(tr, position) {
        const typed = tr.getMeta(typedSpaceKey) as number | undefined;
        if (typed !== undefined) return typed;
        if (position === null) return null;
        const mapped = tr.mapping.mapResult(position, 1);
        return mapped.deleted || !tr.selection.empty || tr.selection.head !== mapped.pos + 1
          ? null : mapped.pos;
      },
    },
    props: {
      decorations(state) {
        const position = typedSpaceKey.getState(state);
        if (position === null || position === undefined) return;
        return DecorationSet.create(state.doc, [
          Decoration.inline(position, position + 1, { class: 'latex-typed-space' }),
        ]);
      },
      handleTextInput(view, from, to, text) {
        if (normalizing || !text.endsWith('\u00a0')) return false;
        const plain = text.slice(0, -1) + ' ';
        normalizing = true;
        try {
          const handled = view.someProp('handleTextInput', (handle) =>
            handle(view, from, to, plain, () => view.state.tr.insertText(plain, from, to)),
          );
          if (handled) return true;
        } finally {
          normalizing = false;
        }
        const tr = view.state.tr.insertText(plain, from, to);
        view.dispatch(tr.setMeta(typedSpaceKey, from + text.length - 1));
        return true;
      },
    },
  });
}

function spaceAfter(tr: Transaction, position: number) {
  return tr.insertText(' ', position).setMeta(typedSpaceKey, position);
}

function continueAfterLatexBlock(view: EditorView, event: MouseEvent) {
  const { state } = view;
  const last = state.doc.lastChild;
  if (
    !view.editable ||
    event.target !== view.dom ||
    event.button !== 0 ||
    event.shiftKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    !last?.isAtom ||
    !last.isBlock
  )
    return false;
  const end = state.doc.content.size;
  const block = view.nodeDOM(end - last.nodeSize);
  if (!(block instanceof HTMLElement) || event.clientY < block.getBoundingClientRect().bottom)
    return false;
  const tr = state.tr.insert(end, schema.nodes.paragraph!.create());
  view.dispatch(tr.setSelection(TextSelection.create(tr.doc, end + 1)).scrollIntoView());
  view.focus();
  event.preventDefault();
  return true;
}

export function latexState(
  document: Node,
  version: number,
  clientID: string | undefined,
  nodeViews?: LatexNodeViews,
) {
  const split = splitBlockAs((node, atEnd) => ({
    type: node.type.name === 'heading' && atEnd ? schema.nodes.paragraph! : node.type,
  }));
  return EditorState.create({
    schema,
    doc: document,
    plugins: [
      typedSpaces(),
      latexInputRules(),
      latexNumberingPlugin(),
      notePresencePlugin(),
      noteProofreadingPlugin(),
      keymap({
        'Mod-z': undo,
        'Mod-y': redo,
        'Shift-Mod-z': redo,
        'Mod-b': toggleLatexStyle('strong'),
        'Mod-i': toggleLatexStyle('em'),
        'Mod-m': insertLatexMath(false),
        'Shift-Mod-m': insertLatexMath(true),
        Backspace: undoInputRule,
        Enter: chainCommands(splitListItem(schema.nodes.list_item!), createParagraphNear, split),
        Tab: sinkListItem(schema.nodes.list_item!),
        'Shift-Tab': liftListItem(schema.nodes.list_item!),
        ...Object.fromEntries(
          [0, 1, 2, 3, 4, 5].map((level) => ['Mod-Alt-' + level, latexHeading(level)]),
        ),
      }),
      keymap(baseKeymap),
      history(),
      collab(clientID === undefined ? { version } : { version, clientID }),
      new Plugin({
        props: {
          ...(nodeViews ? { nodeViews } : {}),
          handleDOMEvents: { mousedown: continueAfterLatexBlock },
          ...latexClipboard(schema),
          clipboardTextSerializer: ({ content }) =>
            serializeLatex(
              schema.topNodeType.create(
                null,
                content.firstChild?.isInline
                  ? schema.nodes.paragraph!.create(null, content)
                  : content,
              ),
            ),
          clipboardTextParser: (text, _context, plain) =>
            plain
              ? Slice.maxOpen(
                  Fragment.fromArray(
                    text
                      .split(/\r?\n/)
                      .map((line) =>
                        schema.nodes.paragraph!.create(null, line ? schema.text(line) : undefined),
                      ),
                  ),
                )
              : Slice.maxOpen(parseLatex(pastedLatexText(text)).content),
        },
      }),
    ],
  });
}
