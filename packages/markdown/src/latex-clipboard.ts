import {
  DOMParser,
  DOMSerializer,
  type DOMOutputSpec,
  type Schema,
  type TagParseRule,
} from 'prosemirror-model';
import { latexAtomPasteRules, latexStructureNodes } from './latex-spec';

// HTML carries its ordinary heading/list/emphasis semantics to other editors.
// Preserve the original TeX spelling as well when both sides understand it.
function withDelimiters(spec: DOMOutputSpec, before: unknown, open: unknown, close: unknown) {
  const rendered = DOMSerializer.renderSpec(document, spec);
  rendered.dom.setAttribute('data-latex-delimiters', JSON.stringify([before, open, close]));
  return rendered;
}

function readDelimiters(element: HTMLElement) {
  try {
    const values: unknown = JSON.parse(element.getAttribute('data-latex-delimiters') ?? 'null');
    if (
      Array.isArray(values) &&
      values.length === 3 &&
      values.every((value) => value === null || typeof value === 'string')
    ) {
      const [before, open, close] = values;
      return { before, open, close };
    }
  } catch {
    /* Other applications can modify clipboard HTML. */
  }
  return null;
}

export function latexClipboard(schema: Schema) {
  const base = DOMSerializer.fromSchema(schema);
  const nodes = { ...base.nodes };
  for (const name of latexStructureNodes) {
    nodes[name] = (node) => {
      const spec = base.nodes[name]!(node);
      const { before, open, close } = node.attrs;
      return before === null && open === null && close === null
        ? spec
        : withDelimiters(spec, before, open, close);
    };
  }
  const marks = {
    ...base.marks,
    latex_style(mark, inline) {
      const { open, close, order } = mark.attrs;
      const rendered = withDelimiters(base.marks.latex_style!(mark, inline), null, open, close);
      rendered.dom.setAttribute('data-latex-order', String(order));
      return rendered;
    },
  } satisfies DOMSerializer['marks'];
  const baseRules = DOMParser.fromSchema(schema).rules;
  const structureRules = baseRules.flatMap((rule): TagParseRule[] => {
    if (!rule.tag || !latexStructureNodes.some((name) => name === rule.node)) return [];
    return [
      {
        ...rule,
        tag: rule.tag + '[data-latex-delimiters]',
        getAttrs: (element) => {
          const delimiters = readDelimiters(element);
          const attrs = rule.getAttrs ? rule.getAttrs(element) : rule.attrs;
          return delimiters && attrs !== false ? { ...attrs, ...delimiters } : false;
        },
      },
    ];
  });
  const style: TagParseRule = {
    tag: 'strong[data-latex-order], em[data-latex-order]',
    mark: 'latex_style',
    getAttrs: (element) => {
      const delimiters = readDelimiters(element);
      const order = Number(element.getAttribute('data-latex-order'));
      if (
        typeof delimiters?.open !== 'string' ||
        typeof delimiters.close !== 'string' ||
        !Number.isSafeInteger(order)
      )
        return false;
      return {
        open: delimiters.open,
        close: delimiters.close,
        style: element.tagName === 'STRONG' ? 'strong' : 'em',
        order,
      };
    },
  };
  return {
    clipboardSerializer: new DOMSerializer(nodes, marks),
    clipboardParser: new DOMParser(schema, [
      ...latexAtomPasteRules,
      ...structureRules,
      style,
      ...baseRules,
    ]),
  };
}
