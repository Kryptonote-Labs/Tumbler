import type { Node } from 'prosemirror-model';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { latexNumbering } from './latex-numbering';

/**
 * Decoration specs that tell LaTeX node views what to print. Equations carry one number per row
 * (null for an unnumbered row), figures and tables carry their caption name, and references carry
 * the text `\ref` prints, or `undefined` when the label cannot be resolved.
 */
export type LatexNumberSpec =
  | { latexEquation: (string | null)[] }
  | { latexFloat: string }
  | { latexReference: string | undefined };

const key = new PluginKey<DecorationSet>('latex-numbering');
const reference = /^\\(eq)?ref\s*\{([^{}]+)\}$/;

function headingNumber(number: string, command: string) {
  return (view: { dom: HTMLElement }) => {
    const element = view.dom.ownerDocument.createElement('span');
    element.className = 'latex-heading-number';
    element.dataset.command = command;
    element.textContent =
      command === 'part' ? 'Part ' + number : command === 'chapter' ? 'Chapter ' + number : number;
    element.contentEditable = 'false';
    return element;
  };
}

function decorate(document: Node) {
  const numbers = latexNumbering(document);
  const decorations: Decoration[] = [];
  const around = (position: number, spec: LatexNumberSpec) =>
    decorations.push(
      Decoration.node(position, position + document.nodeAt(position)!.nodeSize, {}, spec),
    );
  if (numbers) {
    for (const [position, { number, command }] of numbers.headings)
      decorations.push(
        Decoration.widget(position + 1, headingNumber(number, command), {
          side: -1,
          key: command + ':' + number,
          ignoreSelection: true,
        }),
      );
    for (const [position, rows] of numbers.equations) around(position, { latexEquation: rows });
    for (const [position, { kind, number }] of numbers.floats)
      around(position, { latexFloat: (kind === 'figure' ? 'Figure ' : 'Table ') + number });
  }
  document.descendants((node, position) => {
    if (node.type.name !== 'latex_inline') return true;
    const match = reference.exec(String(node.attrs.source).trim());
    if (match) {
      const number = numbers?.labels.get(match[2]!.trim());
      around(position, { latexReference: number && (match[1] ? '(' + number + ')' : number) });
    }
    return false;
  });
  return DecorationSet.create(document, decorations);
}

/** Show the numbers LaTeX prints for headings, equations, floats and references. */
export function latexNumberingPlugin() {
  return new Plugin<DecorationSet>({
    key,
    state: {
      init: (_config, state) => decorate(state.doc),
      apply: (tr, value, _old, state) => (tr.docChanged ? decorate(state.doc) : value),
    },
    props: { decorations: (state) => key.getState(state) },
  });
}

/** Read the number a LaTeX node view should print from its decorations. */
export function latexNumberSpec(decorations: readonly Decoration[]) {
  for (const decoration of decorations) {
    const spec = decoration.spec as Partial<Record<string, unknown>>;
    if ('latexEquation' in spec || 'latexFloat' in spec || 'latexReference' in spec)
      return spec as LatexNumberSpec;
  }
}
