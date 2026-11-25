import type { Node } from 'prosemirror-model';
import { readLatexClass } from './latex-flow';
import { latexNumbering } from './latex-numbering';
import { latexEffectivePrefix } from './latex-project';
import { isLatexHeading } from './latex-spec';
import { commandEnd, groupAt, whitespaceEnd } from './latex-syntax';

type Mark = { text: string; uppercase: boolean };
type Marks = { left: Mark; right: Mark };
const empty = { text: '', uppercase: false };

/** Resolve TeX's last left mark and first right mark on each physical page. */
export function latexPageMarks(document: Node, starts: readonly number[]) {
  const documentClass = readLatexClass(latexEffectivePrefix(document)).name;
  const chaptered = documentClass === 'report' || documentClass === 'book';
  const numbering = latexNumbering(document)?.headings;
  const changes: { position: number; left?: Mark; right: Mark }[] = [];
  document.descendants((node, position) => {
    if (isLatexHeading(node)) {
      const open = String(node.attrs.open);
      const end = commandEnd(open, 0);
      if (open[end] === '*') return false;
      const command = open.slice(1, end);
      const left = command === (chaptered ? 'chapter' : 'section');
      if (!left && command !== (chaptered ? 'section' : 'subsection')) return false;
      const short = groupAt(open, whitespaceEnd(open, end), '[', ']');
      const title = short
        ? open.slice(short.from, short.to)
        : node.textBetween(0, node.content.size, '', (child) =>
            typeof child.attrs.label === 'string' ? child.attrs.label : '',
          ).trim();
      const number = numbering?.get(position)?.number;
      const label = number && chaptered && left ? 'Chapter ' + number : number;
      const mark = { text: label ? label + '  ' + title : title, uppercase: left || chaptered };
      changes.push(left ? { position, left: mark, right: empty } : { position, right: mark });
      return false;
    }
    if (node.type.name === 'latex_raw') {
      const source = String(node.attrs.source).trim();
      const title = source === '\\tableofcontents' ? 'Contents'
        : source === '\\listoffigures' ? 'List of Figures'
        : source === '\\listoftables' ? 'List of Tables'
        : /^\\(?:begin\{thebibliography\}|(?:bibliography|printbibliography)\b)/.test(source)
          ? chaptered ? 'Bibliography' : 'References'
          : undefined;
      if (title) {
        const mark = { text: title, uppercase: true };
        changes.push({ position, left: mark, right: mark });
      }
    }
    return true;
  });
  let next = 0;
  let left = empty;
  let right = empty;
  return Array.from({ length: starts.length + 1 }, (_, page): Marks => {
    let first: Mark | undefined;
    const end = starts[page] ?? Infinity;
    let mark = changes[next];
    while (mark && mark.position < end) {
      left = mark.left ?? left;
      first ??= mark.right;
      right = mark.right;
      mark = changes[++next];
    }
    return { left, right: first ?? right };
  });
}
