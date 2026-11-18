import type { NodeSpec } from 'prosemirror-model';

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

export const latexNodes = {
  latex_inline: {
    inline: true,
    group: 'inline',
    atom: true,
    attrs: {
      source: { validate: 'string' },
      label: { default: null, validate: 'string|null' },
    },
    toDOM: (node) => [
      'span',
      { class: node.attrs.label === null ? 'latex-raw' : 'latex-literal', spellcheck: 'false' },
      node.attrs.label ?? node.attrs.source,
    ],
    leafText: (node) => node.attrs.label ?? node.attrs.source,
  },
  latex_raw: {
    group: 'block',
    atom: true,
    attrs: { ...latexBlockAttrs, source: { validate: 'string' } },
    toDOM: (node) => ['div', { class: 'latex-raw', spellcheck: 'false' }, node.attrs.source],
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
    toDOM: (node) => [
      display ? 'div' : 'span',
      { class: 'latex-equation', spellcheck: 'false' },
      node.attrs.source,
    ],
    leafText: (node) => node.attrs.source,
  };
}
