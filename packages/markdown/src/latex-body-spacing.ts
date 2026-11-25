import type { Node } from 'prosemirror-model';
import { readLatexTitledEnvironments } from './latex-titled-environments';
import { latexBaseSize, readLatexClass } from './latex-class';
import { latexPresetStretch, latexSpacingRegion } from './latex-spacing';
import { readLatexSpacingCommand } from './latex-spacing-syntax';
import { latexLineSpacing } from './latex-format';
import { readLatexTextMacros } from './latex-macros';
import { latexEffectivePrefix } from './latex-project';
import { readLatexListSequence, readLatexStateMacro } from './latex-state-command';

type Region = { stretch: number; before: number; after: number };
type BodySpacing = {
  initial: number;
  spacing: ReadonlyMap<number, number>;
  regions: ReadonlyMap<number, Region>;
};
const cache = new WeakMap<Node, BodySpacing>();

/** The baseline stretch active at each source-backed block. Linked files share the caller's state. */
export function latexBodySpacing(document: Node) {
  const saved = cache.get(document);
  if (saved) return saved;
  const prefix = latexEffectivePrefix(document);
  const { name: className } = readLatexClass(prefix);
  const points = latexBaseSize(prefix);
  const initial = latexLineSpacing(prefix, points).stretch;
  const macros = readLatexTextMacros(prefix);
  const environments = readLatexTitledEnvironments(prefix, macros);
  const spacing = new Map<number, number>();
  const regions = new Map<number, Region>();
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
        const command = readLatexSpacingCommand(source, 0);
        const literal =
          stateMacro?.expansion ??
          listSequence?.afterLists ??
          (command ? source : '');
        state = apply(state, literal);
      } else if (!node.isTextblock && !node.isLeaf) {
        const name =
          node.type.name === 'blockquote' &&
          /^\\begin\s*\{([^}]+)\}/.exec(String(node.attrs.open))?.[1];
        const setup = name && environments.get(name)?.bodySetup;
        const region = node.type.name === 'latex_container' && latexSpacingRegion(String(node.attrs.open));
        let nested = setup ? apply(state, setup) : state;
        if (region) {
          const single = region.name === 'singlespace' || region.name === 'singlespace*';
          const stretch = region.name === 'spacing' ? region.stretch :
            single ? apply(state, '\\singlespacing').stretch :
            latexPresetStretch(region.name === 'onehalfspace' ? 'onehalf' : 'double', points, className);
          const before = region.name === 'singlespace' ? state.stretch - stretch :
            region.name === 'singlespace*' ? -stretch : 0;
          const after = region.name === 'singlespace' ? 0 :
            region.name === 'singlespace*' ? -stretch / 2 : stretch - state.stretch;
          regions.set(position, { stretch, before, after });
          nested = apply(state, '\\linespread{' + stretch + '}');
        }
        const end = visit(node, position + 1, nested);
        if (node.type.name === 'latex_include') state = end;
      }
    });
    return state;
  }
  visit(document, 0, { source: prefix, stretch: initial });
  const result = { initial, spacing, regions };
  cache.set(document, result);
  return result;
}
