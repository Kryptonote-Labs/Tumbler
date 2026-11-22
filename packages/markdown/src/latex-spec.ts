import type { Node, NodeSpec, TagParseRule } from 'prosemirror-model';

export const latexStructureNodes = [
  'paragraph',
  'heading',
  'bullet_list',
  'ordered_list',
  'list_item',
  'blockquote',
  'latex_landscape',
] as const;

export const latexBlockAttrs = {
  before: { default: null, validate: 'string|null' },
  open: { default: null, validate: 'string|null' },
  close: { default: null, validate: 'string|null' },
};

export const latexDocumentAttrs = {
  format: {
    default: 'markdown',
    validate(value: unknown) {
      if (value !== 'markdown' && value !== 'latex') throw new RangeError('Invalid text format.');
    },
  },
  prefix: { default: '', validate: 'string' },
  suffix: { default: '', validate: 'string' },
};

// Store source separately from the visible label. Only the LaTeX clipboard parser
// recognizes these attributes; other applications receive ordinary text and HTML.
function atomDOM(node: Node, className: string) {
  const attrs: Record<string, string> = {
    class: className,
    'data-latex-node': node.type.name,
    spellcheck: 'false',
  };
  for (const key of ['source', 'label', 'before', 'open', 'close']) {
    if (typeof node.attrs[key] === 'string') attrs['data-latex-' + key] = node.attrs[key];
  }
  return [node.isInline ? 'span' : 'div', attrs, node.attrs.label ?? node.attrs.source] as const;
}

export const latexNodes = {
  latex_landscape: {
    group: 'block',
    content: 'block+',
    defining: true,
    attrs: latexBlockAttrs,
    toDOM: () => ['div', { class: 'latex-landscape', 'data-latex-landscape': '' }, 0],
    parseDOM: [{ tag: 'div[data-latex-landscape]' }],
  },
  latex_inline: {
    inline: true,
    group: 'inline',
    atom: true,
    attrs: {
      source: { validate: 'string' },
      label: { default: null, validate: 'string|null' },
    },
    toDOM: (node) => atomDOM(node, node.attrs.label === null ? 'latex-raw' : 'latex-literal'),
    leafText: (node) => node.attrs.label ?? node.attrs.source,
  },
  latex_raw: {
    group: 'block',
    atom: true,
    attrs: { ...latexBlockAttrs, source: { validate: 'string' } },
    toDOM: (node) => atomDOM(node, 'latex-raw'),
    leafText: (node) => node.attrs.source,
  },
  latex_math: mathNode(false),
  latex_display_math: mathNode(true),
} satisfies Record<string, NodeSpec>;

function mathNode(display: boolean): NodeSpec {
  return {
    inline: !display,
    group: display ? 'block' : 'inline',
    atom: true,
    attrs: { ...latexBlockAttrs, source: { default: '', validate: 'string' } },
    toDOM: (node) => atomDOM(node, 'latex-equation'),
    leafText: (node) => node.attrs.source,
  };
}

export const latexAtomPasteRules: TagParseRule[] = ['latex_inline', 'latex_raw', 'latex_math', 'latex_display_math'].map((node) => ({
  node,
  tag: `[data-latex-node="${node}"][data-latex-source]`,
  getAttrs: (dom) => ({
    source: dom.getAttribute('data-latex-source'),
    label: dom.getAttribute('data-latex-label'),
    before: dom.getAttribute('data-latex-before'),
    open: dom.getAttribute('data-latex-open'),
    close: dom.getAttribute('data-latex-close'),
  }),
}));
