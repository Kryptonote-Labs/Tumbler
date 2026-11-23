import { latexEffectivePrefix } from './latex-project';
import type { Node } from 'prosemirror-model';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { readLatexClass } from './latex-flow';
import { readLatexLetterParts, type LatexLetterPart } from './latex-letter';
import { latexNumbering } from './latex-numbering';

/**
 * Decoration specs that tell LaTeX node views what to print. Equations carry one number per row
 * (null for an unnumbered row), figures and tables carry their caption name, and references carry
 * the text `\ref` prints, or `undefined` when the label cannot be resolved.
 */
export type LatexNumberSpec =
  | { latexEquation: (string | null)[] }
  | { latexFloat: string }
  | { latexReference: string | undefined }
  | { latexFootnote: string }
  | { latexListing: string };

const key = new PluginKey<DecorationSet>('latex-numbering');
const reference = /^\\(eq)?ref\s*\{([^{}]+)\}$/;
const label = /^\\label\s*\{[^{}]+\}$/;

function isLabelParagraph(node: Node) {
  if (node.type.name !== 'paragraph') return false;
  let hasLabel = false;
  for (let index = 0; index < node.childCount; index++) {
    const child = node.child(index);
    if (child.isText && !child.text?.trim()) continue;
    if (child.type.name !== 'latex_inline' || !label.test(String(child.attrs.source).trim()))
      return false;
    hasLabel = true;
  }
  return hasLabel;
}

function headingNumber(number: string, command: string, appendix?: boolean) {
  return (view: { dom: HTMLElement }) => {
    const element = view.dom.ownerDocument.createElement('span');
    element.className = 'latex-heading-number';
    element.dataset.command = command;
    element.textContent =
      command === 'part' ? 'Part ' + number : command === 'chapter' ? (appendix ? 'Appendix ' : 'Chapter ') + number : number;
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
  if (readLatexClass(latexEffectivePrefix(document)).name === 'letter')
    for (const [position, part] of readLatexLetterParts(document)) {
      const node = document.nodeAt(position);
      if (node) decorations.push(Decoration.node(position, position + node.nodeSize, {}, { latexLetterPart: part }));
    }
  if (numbers) {
    for (const [position, { title, kind, style }] of numbers.containers) {
      const node = document.nodeAt(position);
      if (node) decorations.push(Decoration.node(position, position + node.nodeSize, {
        'data-latex-container-title': title,
        'data-latex-container-kind': kind,
        ...(style && { 'data-latex-theorem-style': style }),
      }));
    }
    for (const [position, { number, command, appendix }] of numbers.headings)
      if (number) decorations.push(
        Decoration.widget(position + 1, headingNumber(number, command, appendix), {
          side: -1,
          key: command + ':' + (appendix ? 'appendix:' : '') + number,
          ignoreSelection: true,
        }),
      );
    for (const [position, rows] of numbers.equations) around(position, { latexEquation: rows });
    for (const [position, { kind, number }] of numbers.floats)
      around(position, { latexFloat: (kind === 'figure' ? 'Figure ' : 'Table ') + number });
    for (const [position, number] of numbers.listings) around(position, { latexListing: number });
    for (const [position, number] of numbers.footnotes) around(position, { latexFootnote: number });
  }
  const latexPreviewPrefix = latexEffectivePrefix(document);
  document.descendants((node, position) => {
    if (
      node.type.name === 'latex_math' ||
      node.type.name === 'latex_display_math' ||
      node.type.name === 'latex_raw' ||
      node.type.name === 'latex_inline'
    )
      decorations.push(Decoration.node(position, position + node.nodeSize, {}, { latexPreviewPrefix }));
    if (isLabelParagraph(node))
      decorations.push(
        Decoration.node(position, position + node.nodeSize, { 'data-latex-label-only': '' }),
      );
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
    if (
      'latexEquation' in spec ||
      'latexFloat' in spec ||
      'latexReference' in spec ||
      'latexFootnote' in spec || 'latexListing' in spec
    )
      return spec as LatexNumberSpec;
  }
}

export function latexLetterPartSpec(decorations: readonly Decoration[]): LatexLetterPart | undefined {
  for (const decoration of decorations) {
    const part: unknown = decoration.spec.latexLetterPart;
    if (part && typeof part === 'object' && 'kind' in part)
      return decoration.spec.latexLetterPart;
  }
}
