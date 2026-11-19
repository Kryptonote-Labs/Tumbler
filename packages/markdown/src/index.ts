import { latexBlockAttrs, latexDocumentAttrs, latexNodes, latexStructureNodes } from './latex-spec';
import MarkdownIt from 'markdown-it';
import { Schema, type MarkSpec, type Node as MarkdownNode } from 'prosemirror-model';
import {
  schema as baseSchema,
  defaultMarkdownParser,
  defaultMarkdownSerializer,
  MarkdownParser,
  MarkdownSerializer,
} from 'prosemirror-markdown';
import { tableNodes } from 'prosemirror-tables';
export { noteHeadings } from './headings';

export const noteColours = [
  { name: 'red', emoji: '🔴', text: '#e05252', highlight: '#e0525238' },
  { name: 'orange', emoji: '🟠', text: '#d77d25', highlight: '#e38b3038' },
  { name: 'yellow', emoji: '🟡', text: '#b59617', highlight: '#e5c33238' },
  { name: 'green', emoji: '🟢', text: '#399b63', highlight: '#48b57b38' },
  { name: 'blue', emoji: '🔵', text: '#438fd4', highlight: '#579ee638' },
  { name: 'purple', emoji: '🟣', text: '#a46aca', highlight: '#b478d838' },
] as const;
export type NoteColour = (typeof noteColours)[number]['name'];
export function noteColour(value: unknown) {
  return noteColours.find((colour) => colour.name === value);
}
// Only these schemes become clickable. Imported Markdown remains text for other schemes.
export function safeNoteLink(href: string) {
  return /^(https?:|mailto:|#)/i.test(href) ? href : '#';
}
function colourMark(highlight: boolean): MarkSpec {
  return {
    attrs: {
      colour: {
        default: highlight ? 'yellow' : 'green',
        validate: (value: unknown) => {
          if (!noteColour(value)) throw new RangeError('Unknown note colour.');
        },
      },
    },
    inclusive: true,
    parseDOM: [
      {
        tag: highlight ? 'mark[data-colour]' : 'span[data-colour]',
        getAttrs: (dom: HTMLElement) => ({ colour: dom.getAttribute('data-colour') }),
      },
    ],
    toDOM: (mark) => {
      const colour = noteColour(mark.attrs.colour) ?? noteColours[3];
      return [
        highlight ? 'mark' : 'span',
        {
          'data-colour': colour.name,
          style: highlight
            ? `background-color:${colour.highlight};color:inherit`
            : `color:${colour.text}`,
        },
        0,
      ];
    },
  };
}
let nodes = baseSchema.spec.nodes
  .update('code_block', {
    ...baseSchema.spec.nodes.get('code_block'),
    toDOM: (node) => [
      'pre',
      {
        'data-params': node.attrs.params,
        spellcheck: 'false',
        autocorrect: 'off',
        autocapitalize: 'off',
      },
      ['code', { spellcheck: 'false' }, 0],
    ],
  })
  .update('list_item', {
    ...baseSchema.spec.nodes.get('list_item'),
    attrs: { checked: { default: null } },
    parseDOM: [
      {
        tag: 'li',
        getAttrs: (dom: HTMLElement) => ({
          checked: dom.hasAttribute('data-checked')
            ? dom.getAttribute('data-checked') === 'true'
            : null,
        }),
      },
    ],
    toDOM: (node) => [
      'li',
      node.attrs.checked === null ? {} : { 'data-checked': String(node.attrs.checked) },
      0,
    ],
  })
  .append(tableNodes({ tableGroup: 'block', cellContent: 'paragraph+', cellAttributes: {} }));
nodes = nodes.addToEnd('callout', {
  content: 'block+',
  group: 'block',
  defining: true,
  attrs: { kind: { default: 'note' } },
  parseDOM: [
    {
      tag: 'aside[data-callout]',
      getAttrs: (dom: HTMLElement) => ({ kind: dom.getAttribute('data-callout') }),
    },
  ],
  toDOM: (node) => ['aside', { 'data-callout': node.attrs.kind }, 0],
});
nodes = nodes
  .update('doc', { ...nodes.get('doc'), attrs: latexDocumentAttrs })
  .append(latexNodes);
for (const name of latexStructureNodes) {
  const node = nodes.get(name)!;
  nodes = nodes.update(name, { ...node, attrs: { ...node.attrs, ...latexBlockAttrs } });
}
export const noteSchema = new Schema({
  nodes,
  marks: baseSchema.spec.marks
    .addToEnd('latex_style', {
      attrs: {
        open: { validate: 'string' },
        close: { validate: 'string' },
        style: { validate: 'string' },
        order: { validate: 'number' },
      },
      excludes: '',
      toDOM: (mark) => [mark.attrs.style === 'strong' ? 'strong' : 'em', 0],
    })
    .update('code', {
      ...baseSchema.spec.marks.get('code'),
      toDOM: () => ['code', { spellcheck: 'false', autocorrect: 'off', autocapitalize: 'off' }, 0],
    })
    .update('link', {
      ...baseSchema.spec.marks.get('link'),
      toDOM: (mark) => [
        'a',
        {
          href: safeNoteLink(mark.attrs.href),
          title: mark.attrs.title,
          rel: 'noopener noreferrer',
          target: /^(https?:|mailto:)/i.test(mark.attrs.href) ? '_blank' : null,
        },
        0,
      ],
    })
    .addToEnd('strike', { parseDOM: [{ tag: 's' }, { tag: 'del' }], toDOM: () => ['s', 0] })
    .addToEnd('colour', colourMark(false))
    .addToEnd('highlight', colourMark(true))
    .addToEnd('wikilink', {
      attrs: { target: { validate: 'string' } },
      inclusive: false,
      parseDOM: [
        {
          tag: 'a[data-wikilink]',
          priority: 60,
          getAttrs: (dom: HTMLElement) => ({ target: dom.getAttribute('data-wikilink') }),
        },
      ],
      toDOM: (mark) => [
        'a',
        {
          href: '#',
          'data-wikilink': mark.attrs.target,
          class: 'note-wikilink',
        },
        0,
      ],
    }),
});

const tokenizer = new MarkdownIt('default', { html: false, breaks: false });
// Recognise only the safe break tag; arbitrary HTML stays authored text.
tokenizer.inline.ruler.before('html_inline', 'note_break', (state, silent) => {
  const match = /^<br\s*\/?>/i.exec(state.src.slice(state.pos));
  if (!match) return false;
  if (!silent) state.push('hardbreak', 'br', 0).markup = match[0].toLowerCase();
  state.pos += match[0].length;
  return true;
});
// Table cells split before inline parsing. Normalize has already removed literal NULs,
// so this placeholder protects reference pipes without changing code or authored text.
tokenizer.core.ruler.after('normalize', 'note_reference_pipes', (state) => {
  state.src = state.src.replace(/\[\[[^\]\n]+\]\]/g, (link) => link.replace(/(?<!\\)\|/g, '\0'));
});
tokenizer.core.ruler.before('inline', 'note_reference_restore', (state) => {
  for (const token of state.tokens) token.content = token.content.replaceAll('\0', '|');
});
// Recognise extensions as inline tokens, so code spans and escaped delimiters stay literal.
tokenizer.inline.ruler.before('emphasis', 'note_colour', (state, silent) => {
  const source = state.src.slice(state.pos);
  const match = /^(==|=)(🔴|🟠|🟡|🟢|🔵|🟣)?/.exec(source);
  if (!match || (match[1] === '=' && !match[2])) return false;
  const delimiter = match[1]!;
  const prefix = match[0].length;
  let end = prefix;
  for (; end < source.length; end++) {
    if (source[end] === '\\') {
      end++;
      continue;
    }
    if (source.startsWith(delimiter, end)) break;
    if (source[end] === '\n') return false;
  }
  if (end === prefix || end >= source.length) return false;
  if (!silent) {
    const type = delimiter === '==' ? 'highlight' : 'colour';
    const open = state.push(type + '_open', '', 1);
    open.attrSet(
      'colour',
      noteColours.find((colour) => colour.emoji === match[2])?.name ?? 'yellow',
    );
    const nested: typeof state.tokens = [];
    state.md.inline.parse(source.slice(prefix, end), state.md, state.env, nested);
    for (const token of nested) {
      const pushed = state.push(token.type, token.tag, token.nesting);
      const level = pushed.level;
      Object.assign(pushed, token, { level });
    }
    state.push(type + '_close', '', -1);
  }
  state.pos += end + delimiter.length;
  return true;
});
tokenizer.inline.ruler.before('link', 'note_wikilink', (state, silent) => {
  const match = /^\[\[([^\]\n|]+)(?:\|([^\]\n]+))?\]\]/.exec(state.src.slice(state.pos));
  if (!match) return false;
  if (!silent) {
    state.push('wikilink_open', '', 1).attrSet('target', match[1]!);
    state.push('text', '', 0).content = match[2] ?? match[1]!.replace(/^\/+/, '');
    state.push('wikilink_close', '', -1);
  }
  state.pos += match[0].length;
  return true;
});
tokenizer.core.ruler.after('inline', 'note_blocks', (state) => {
  for (let i = 0; i < state.tokens.length; i++) {
    const token = state.tokens[i]!;
    if (token.type === 'th_open' || token.type === 'td_open') {
      const paragraph = new state.Token('paragraph_open', 'p', 1);
      state.tokens.splice(i + 1, 0, paragraph);
      const inline = state.tokens[i + 2];
      if (inline?.type === 'inline' && inline.children) {
        const children = inline.children;
        const parts: (typeof children)[] = [[]];
        const marks: typeof children = [];
        for (let j = 0; j < children.length; j++) {
          if (
            children[j]!.type === 'hardbreak' &&
            children[j]!.markup === '<br>' &&
            children[j + 1]?.type === 'hardbreak' &&
            children[j + 1]!.markup === '<br>'
          ) {
            for (const mark of marks.toReversed())
              parts[parts.length - 1]!.push(
                new state.Token(mark.type.replace(/_open$/, '_close'), mark.tag, -1),
              );
            parts.push([...marks]);
            j++;
          } else {
            const child = children[j]!;
            parts[parts.length - 1]!.push(child);
            if (child.nesting === 1) marks.push(child);
            else if (child.nesting === -1) marks.pop();
          }
        }
        inline.children = parts[0]!;
        const extra: typeof state.tokens = [];
        for (const part of parts.slice(1)) {
          extra.push(
            new state.Token('paragraph_close', 'p', -1),
            new state.Token('paragraph_open', 'p', 1),
          );
          const next = new state.Token('inline', '', 0);
          next.children = part;
          extra.push(next);
        }
        state.tokens.splice(i + 3, 0, ...extra);
      }
    }
    if (token.type === 'th_close' || token.type === 'td_close') {
      const paragraph = new state.Token('paragraph_close', 'p', -1);
      state.tokens.splice(i, 0, paragraph);
      i++;
    }
    if (token.type === 'list_item_open') {
      const inline = state.tokens[i + 2];
      if (inline?.type === 'inline' && /^\[[ xX]\] /.test(inline.content)) {
        token.attrSet('checked', String(inline.content[1] !== ' '));
        inline.content = inline.content.slice(4);
        const first = inline.children?.[0];
        if (first?.type === 'text') first.content = first.content.slice(4);
      }
    }
    if (token.type === 'blockquote_open') {
      const inline = state.tokens[i + 2];
      const match = inline?.type === 'inline' && /^\[!([\w-]+)\]\s*(?:\n|$)/.exec(inline.content);
      if (!match) continue;
      token.type = 'callout_open';
      token.attrSet('kind', match[1]!.toLowerCase());
      let depth = 1;
      for (let j = i + 1; j < state.tokens.length; j++) {
        const child = state.tokens[j]!;
        if (child.type === 'blockquote_open') depth++;
        if (child.type === 'blockquote_close' && --depth === 0) {
          child.type = 'callout_close';
          break;
        }
      }
      inline.content = inline.content.slice(match[0].length);
      inline.children = [];
      state.md.inline.parse(inline.content, state.md, state.env, inline.children);
    }
  }
});
export const noteParser = new MarkdownParser(noteSchema, tokenizer, {
  ...defaultMarkdownParser.tokens,
  list_item: {
    block: 'list_item',
    getAttrs: (token) => ({
      checked: token.attrGet('checked') === null ? null : token.attrGet('checked') === 'true',
    }),
  },
  s: { mark: 'strike' },
  colour: { mark: 'colour', getAttrs: (token) => ({ colour: token.attrGet('colour') }) },
  highlight: { mark: 'highlight', getAttrs: (token) => ({ colour: token.attrGet('colour') }) },
  wikilink: { mark: 'wikilink', getAttrs: (token) => ({ target: token.attrGet('target') }) },
  callout: { block: 'callout', getAttrs: (token) => ({ kind: token.attrGet('kind') }) },
  table: { block: 'table' },
  thead: { ignore: true },
  tbody: { ignore: true },
  tr: { block: 'table_row' },
  th: { block: 'table_header' },
  td: { block: 'table_cell' },
});
function colourDelimiter(mark: import('prosemirror-model').Mark, highlight: boolean) {
  return (highlight ? '==' : '=') + (noteColour(mark.attrs.colour)?.emoji ?? '🟢');
}
export const noteSerializer = new MarkdownSerializer(
  {
    ...defaultMarkdownSerializer.nodes,
    list_item(state, node) {
      if (node.attrs.checked !== null) state.write(node.attrs.checked ? '[x] ' : '[ ] ');
      state.renderContent(node);
    },
    callout(state, node) {
      state.wrapBlock('> ', null, node, () => {
        state.write(`[!${node.attrs.kind}]\n`);
        state.renderContent(node);
      });
    },
    table(state, node) {
      const rows: string[][] = [];
      node.forEach((row) => {
        const cells: string[] = [];
        row.forEach((cell) =>
          cells.push(tableCellSerializer.serialize(cell).replaceAll('|', '\\|')),
        );
        rows.push(cells);
      });
      rows.forEach((row, index) => {
        state.write(`| ${row.join(' | ')} |\n`);
        if (!index) state.write(`| ${row.map(() => '---').join(' | ')} |\n`);
      });
      state.closeBlock(node);
    },
  },
  {
    ...defaultMarkdownSerializer.marks,
    strike: { open: '~~', close: '~~', mixable: true, expelEnclosingWhitespace: true },
    colour: {
      open: (_state, mark) => colourDelimiter(mark, false),
      close: '=',
      mixable: false,
      expelEnclosingWhitespace: true,
    },
    highlight: {
      open: (_state, mark) => colourDelimiter(mark, true),
      close: '==',
      mixable: false,
      expelEnclosingWhitespace: true,
    },
    wikilink: {
      open: (_state, mark) => `[[${mark.attrs.target}|`,
      close: ']]',
      mixable: false,
      escape: false,
    },
  },
  { escapeExtraCharacters: /[=<]/g },
);
// Self-closing tags distinguish line breaks from the paired tags between paragraphs,
// including consecutive and trailing line breaks that CommonMark would discard.
const tableCellSerializer = new MarkdownSerializer(
  {
    ...noteSerializer.nodes,
    hard_break: (state) => state.write('<br />'),
    paragraph(state, node, parent, index) {
      state.renderInline(node);
      if (index < parent.childCount - 1) state.write('<br><br>');
    },
  },
  noteSerializer.marks,
  noteSerializer.options,
);
export function parseNote(markdown: string) {
  return noteParser.parse(markdown);
}
export function serializeNote(document: MarkdownNode) {
  return noteSerializer.serialize(document);
}
