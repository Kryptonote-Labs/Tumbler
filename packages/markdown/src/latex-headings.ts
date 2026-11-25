import type { Node } from 'prosemirror-model';
import type { Transform } from 'prosemirror-transform';

export const latexHeadings = ['section', 'subsection', 'subsubsection', 'paragraph', 'subparagraph'] as const;
type MajorHeading = 'part' | 'chapter';
export type LatexHeadingCommand = MajorHeading | (typeof latexHeadings)[number];

export function latexHeadingLevel(command: string) {
  return command === 'part' || command === 'chapter'
    ? 1
    : latexHeadings.findIndex(heading => heading === command) + 1;
}

function headingAttrs(level: number, command?: MajorHeading) {
  return { level, open: command ? '\\' + command + '{' : null };
}

/** Create an editable heading with a literal title for insertion into a LaTeX document. */
export function createLatexHeading(document: Node, command: LatexHeadingCommand, title: string) {
  const schema = document.type.schema;
  const attrs = headingAttrs(latexHeadingLevel(command), command === 'part' || command === 'chapter' ? command : undefined);
  return schema.nodes.latex_heading!.create(attrs, title ? schema.text(title) : null);
}

/** Change the paragraph or heading at a block position, preserving its inline content. */
export function setLatexHeadingLevel(tr: Transform, position: number, level: number, command?: MajorHeading) {
  const node = tr.doc.nodeAt(position);
  if (!node?.isTextblock) return;
  const type = tr.doc.type.schema.nodes[level ? 'latex_heading' : 'paragraph']!;
  const currentCommand = String(node.attrs.open ?? '').match(/^\\(part|chapter)\b/)?.[1];
  if (node.type === type && (!level || (node.attrs.level === level && currentCommand === command))) return;
  const at = tr.doc.resolve(position);
  if (at.parent.canReplaceWith(at.index(), at.index() + 1, type))
    tr.setNodeMarkup(position, type, {
      before: node.attrs.before,
      ...(level ? headingAttrs(level, command) : {}),
    });
}
