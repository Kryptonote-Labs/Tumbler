import type { Node } from 'prosemirror-model';
import { readLatexTitledEnvironments } from './latex-titled-environments';
import { readLatexClass } from './latex-flow';
import { latexLineSpacing } from './latex-format';
import { readLatexTextMacros } from './latex-macros';
import { latexEffectivePrefix } from './latex-project';
import { readLatexListSequence, readLatexStateMacro } from './latex-state-command';

const cache = new WeakMap<Node, { initial: number; spacing: ReadonlyMap<number, number> }>();

/** The baseline stretch active at each source-backed block. Linked files share the caller's state. */
export function latexBodySpacing(document: Node) {
  const saved = cache.get(document);
  if (saved) return saved;
  const prefix = latexEffectivePrefix(document);
  const { options } = readLatexClass(prefix);
  const points = options.includes('12pt') ? 12 : options.includes('11pt') ? 11 : 10;
  const initial = latexLineSpacing(prefix, points).stretch;
  const macros = readLatexTextMacros(prefix);
  const environments = readLatexTitledEnvironments(prefix, macros);
  const spacing = new Map<number, number>();
  type State = { source: string; stretch: number };
  function apply(state: State, declarations: string): State {
    if (!declarations) return state;
    const source = state.source + '\n' + declarations;
    return { source, stretch: latexLineSpacing(source, points).stretch };
  }
  function visit(parent: Node, start: number, state: State): State {
    parent.forEach((node, offset) => {
      const position = start + offset;
      if (state.stretch !== initial) spacing.set(position, state.stretch);
      if (node.type.name === 'latex_raw') {
        const source: string = node.attrs.source;
        const stateMacro = readLatexStateMacro(source, macros);
        const listSequence = readLatexListSequence(source, macros);
        const literal =
          stateMacro?.expansion ??
          listSequence?.afterLists ??
          (/^\\(?:singlespacing|onehalfspacing|doublespacing|linespread|setstretch)\b/.test(source)
            ? source
            : '');
        state = apply(state, literal);
      } else if (!node.isTextblock && !node.isLeaf) {
        const name =
          node.type.name === 'blockquote' &&
          /^\\begin\s*\{([^}]+)\}/.exec(String(node.attrs.open))?.[1];
        const setup = name && environments.get(name)?.bodySetup;
        const end = visit(node, position + 1, setup ? apply(state, setup) : state);
        if (node.type.name === 'latex_include') state = end;
      }
    });
    return state;
  }
  visit(document, 0, { source: prefix, stretch: initial });
  const result = { initial, spacing };
  cache.set(document, result);
  return result;
}
