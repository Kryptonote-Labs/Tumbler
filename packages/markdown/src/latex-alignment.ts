import type { Node } from 'prosemirror-model';
import { latexEnvironmentName } from './latex-environments';
import type { Command, EditorState } from 'prosemirror-state';
import { groupAt } from './latex-syntax';

const declarations = {
  left: '\\raggedright',
  center: '\\centering',
  right: '\\raggedleft',
  justify: '\\leftskip=0pt\\rightskip=0pt\\parfillskip=0pt plus 1fil\\relax',
} as const;
export type LatexAlignment = keyof typeof declarations;

export function latexAlignment(value: unknown) {
  return Object.keys(declarations).find((key): key is LatexAlignment =>
    key === value && Object.hasOwn(declarations, key),
  );
}

export function latexAlignedParagraph(source: string, start: number) {
  if (source[start] !== '{') return;
  const declaration = Object.entries(declarations).find(([, command]) =>
    source.startsWith('{' + command, start) &&
    /\s/.test(source[start + command.length + 1] ?? ''),
  );
  if (!declaration) return;
  const scope = groupAt(source, start);
  const contentStart = start + declaration[1].length + 2;
  if (!scope || !source.slice(contentStart, scope.to).endsWith('\\par')) return;
  if (/(?:\\(?:begin|par)(?![A-Za-z@])|\r?\n[ \t]*\r?\n)/.test(source.slice(contentStart, scope.to - 4))) return;
  return { alignment: declaration[0], from: contentStart, to: scope.to - 4, end: scope.end };
}

function visitParagraphs(state: EditorState, visit: (position: number, attrs: Record<string, unknown>) => void) {
  const { from, to, $from } = state.selection;
  if (state.selection.empty) {
    if ($from.parent.type.name === 'paragraph') visit($from.before(), $from.parent.attrs);
    return;
  }
  state.doc.nodesBetween(from, to, (node, position) => {
    if (node.type.name === 'paragraph') visit(position, node.attrs);
    return !node.isTextblock;
  });
}

const environmentAlignments = new Map<string, LatexAlignment>([
  ['flushleft', 'left'], ['center', 'center'], ['flushright', 'right'],
]);

function effectiveAlignment(document: Node, position: number, explicit: unknown): LatexAlignment {
  const alignment = latexAlignment(explicit);
  if (alignment) return alignment;
  const at = document.resolve(position);
  for (let depth = at.depth; depth >= 0; depth--) {
    const parent = at.node(depth);
    for (let index = at.index(depth) - 1; index >= 0; index--) {
      const sibling = parent.child(index);
      if (sibling.type.name !== 'latex_raw') continue;
      const command = String(sibling.attrs.source).trim();
      if (command === declarations.left) return 'left';
      if (command === declarations.center) return 'center';
      if (command === declarations.right) return 'right';
    }
    const environment = latexEnvironmentName(String(parent.attrs.open ?? ''));
    const inherited = environment && environmentAlignments.get(environment);
    if (inherited) return inherited;
  }
  return 'justify';
}

export function latexSelectionAlignment(state: EditorState) {
  const values = new Set<LatexAlignment>();
  visitParagraphs(state, (position, attrs) =>
    values.add(effectiveAlignment(state.doc, position, attrs.latexAlignment)));
  return values.size === 1 ? values.values().next().value : undefined;
}

export function setLatexAlignment(alignment: LatexAlignment): Command {
  return (state, dispatch) => {
    const tr = state.tr;
    visitParagraphs(state, (position, attrs) => {
      if (effectiveAlignment(state.doc, position, attrs.latexAlignment) === alignment) return;
      tr.setNodeMarkup(position, undefined, {
        ...attrs,
        latexAlignment: alignment,
        open: '{' + declarations[alignment] + ' ',
        close: '\\par}',
      });
    });
    if (!tr.docChanged) return false;
    dispatch?.(tr.scrollIntoView());
    return true;
  };
}
