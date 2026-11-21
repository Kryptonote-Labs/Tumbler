import { Fragment, type Mark, type Node } from 'prosemirror-model';
import { Transform } from 'prosemirror-transform';
import { updateLatexBoundary, updateLatexNodeSource } from './latex-boundary-step';
export { updateLatexBoundary, updateLatexNodeSource } from './latex-boundary-step';
import { noteSchema as schema } from './index';
import {
  argumentAt,
  commandEnd,
  documentBody,
  environmentAt,
  groupAt,
  lineEnd,
  mathEnd,
  verbatimEnd,
  whitespaceEnd,
} from './latex-syntax';

export { latexPageLayout, latexPaperSettings, paginateLatex } from './latex-layout';
export type { LatexPageLayout, PageBlock, PageBreak, PageLine } from './latex-layout';
export { latexBreakCommand, latexFlow, latexPageNumbers, readLatexClass } from './latex-flow';
export type { LatexBlockFlow, LatexBreak, LatexPageNumber } from './latex-flow';
export {
  latexFieldSource,
  latexFieldText,
  latexPreambleCommand,
  setLatexPreambleCommand,
} from './latex-metadata';
export type { LatexCommandArgument } from './latex-metadata';
export { latexEquationRows, latexNumbering } from './latex-numbering';
export {
  bibEntryName,
  latexBibliographyDatabases,
  latexBibliographyFiles,
  latexCitationKeys,
  latexCitationNumbers,
  parseBibtex,
  setLatexBibliographyEntries,
  writeBibEntry,
} from './latex-bibliography';
export type { BibEntry, LatexBibliographyDatabase } from './latex-bibliography';
export type { LatexNumbering } from './latex-numbering';
export { findLatexCommand } from './latex-scan';
export {
  latexFigureSource,
  readLatexCaption,
  readLatexFigure,
  setLatexCaption,
  setLatexFigureImage,
  setLatexFigureWidth,
} from './latex-figures';
export {
  deleteLatexTableColumn,
  deleteLatexTableRow,
  insertLatexTableColumn,
  insertLatexTableRow,
  latexTableCellText,
  latexTableSource,
  readLatexMulticolumn,
  readLatexTableBlock,
  readLatexTabular,
  setLatexTableCell,
  writeLatexTabular,
} from './latex-tables';
export type { LatexTabular } from './latex-tables';

export const blankLatex =
  '\\documentclass{article}\n\\usepackage{amsmath}\n\\setlength{\\parindent}{0pt}\n\\setlength{\\parskip}{0.5\\baselineskip plus 2pt}\n\n\\begin{document}\n\n\\end{document}\n';
export const latexHeadings = [
  'section',
  'subsection',
  'subsubsection',
  'paragraph',
  'subparagraph',
];
const displayEnvironments = new Set([
  'equation',
  'equation*',
  'align',
  'align*',
  'gather',
  'gather*',
]);
const textEnvironments = new Set(['quote', 'quotation', 'abstract']);
const escaped = new Map([
  ['\\%', '%'],
  ['\\$', '$'],
  ['\\#', '#'],
  ['\\&', '&'],
  ['\\_', '_'],
  ['\\{', '{'],
  ['\\}', '}'],
  ['\\textbackslash{}', '\\'],
  ['\\textasciicircum{}', '^'],
  ['\\textasciitilde{}', '~'],
  ['~', '\u00a0'],
]);
const escapeText = new Map([...escaped].map(([source, value]) => [value, source]));

export function isLatex(document: Node) {
  return document.attrs.format === 'latex';
}

function inline(
  source: string,
  depth = 0,
  marks: readonly Mark[] = [],
  order = { next: 0 },
): Fragment {
  const nodes: Node[] = [];
  if (depth > 64) return Fragment.from(schema.nodes.latex_inline!.create({ source }));
  let plain = 0;
  const unmatched = new Set<string>();
  const flush = (end: number) => {
    if (end > plain) nodes.push(schema.text(source.slice(plain, end), marks));
  };
  for (let position = 0; position < source.length; position++) {
    const character = source[position]!;
    if (!'\\%${}#&_^~'.includes(character)) continue;
    flush(position);
    const commandLength = commandEnd(source, position);
    let end = Math.max(commandLength, position + 1);
    const command = source.slice(position, end);
    const close = command === '$' ? '$' : command === '\\(' ? '\\)' : undefined;
    const formulaEnd = close && !unmatched.has(close) ? mathEnd(source, end, close) : -1;
    if (close && formulaEnd < 0) unmatched.add(close);
    if (close && formulaEnd >= 0) {
      nodes.push(
        schema.nodes.latex_math!.create(
          {
            source: source.slice(end, formulaEnd),
            open: command,
            close,
          },
          null,
          marks,
        ),
      );
      end = formulaEnd + close.length;
    } else {
      const style =
        command === '\\textbf'
          ? 'strong'
          : ['\\emph', '\\textit'].includes(command)
            ? 'em'
            : undefined;
      const argument = style && argumentAt(source, end);
      if (argument && argument.from < argument.to) {
        const formatting = schema.marks.latex_style!.create({
          style,
          order: order.next++,
          open: source.slice(position, argument.from),
          close: '}',
        });
        inline(
          source.slice(argument.from, argument.to),
          depth + 1,
          [...marks, formatting],
          order,
        ).forEach((child) => nodes.push(child));
        end = argument.end;
      } else {
        if (character === '%') end = Math.min(source.length, lineEnd(source, end) + 1);
        else if (command === '\\verb') end = verbatimEnd(source, end);
        else if (character === '{') end = groupAt(source, position)?.end ?? source.length;
        else if (character === '\\' && !escaped.has(command)) {
          if (source[end] === '*') end++;
          for (;;) {
            const start = whitespaceEnd(source, end);
            const group = groupAt(source, start) ?? groupAt(source, start, '[', ']');
            if (!group) break;
            end = group.end;
          }
        }
        const raw = source.slice(position, end);
        nodes.push(
          schema.nodes.latex_inline!.create(
            {
              source: raw,
              label: escaped.get(raw) ?? null,
            },
            null,
            marks,
          ),
        );
      }
    }
    plain = end;
    position = end - 1;
  }
  flush(source.length);
  return Fragment.fromArray(nodes);
}

const blockCommands = new Set([
  '\\maketitle',
  '\\tableofcontents',
  '\\listoffigures',
  '\\listoftables',
  '\\appendix',
  '\\newpage',
  '\\clearpage',
  '\\cleardoublepage',
]);

// Bibliography commands set the reference list where they stand, so they are blocks. A style
// and the database list written together form one block.
const bibliographyCommands = new Set(['\\bibliographystyle', '\\bibliography', '\\printbibliography']);

function bibliographyAt(source: string, position: number) {
  let end = position;
  for (let count = 0; count < 2; count++) {
    const start = count ? whitespaceEnd(source, end) : end;
    if (count && /\n[^\S\n]*\n/.test(source.slice(end, start))) break;
    const name = source.slice(start, commandEnd(source, start));
    if (!bibliographyCommands.has(name)) break;
    const group = name === '\\printbibliography' ? undefined : groupAt(source, whitespaceEnd(source, start + name.length));
    if (!group && name !== '\\printbibliography') break;
    end = group?.end ?? start + name.length;
  }
  return end > position ? end : undefined;
}

function headingLevel(command: string) {
  return command === 'part' || command === 'chapter' ? 1 : latexHeadings.indexOf(command) + 1;
}

function headingAt(source: string, position: number) {
  const end = commandEnd(source, position);
  const level = headingLevel(source.slice(position + 1, end));
  if (!level) return;
  const group = argumentAt(source, end + Number(source[end] === '*'));
  if (group) return { ...group, level };
}

function blockStart(source: string, position: number) {
  if (source.startsWith('$$', position) || source.startsWith('\\[', position)) return true;
  if (source[position] !== '\\') return false;
  const command = source.slice(position, commandEnd(source, position));
  return (
    command === '\\begin' ||
    blockCommands.has(command) ||
    bibliographyCommands.has(command) ||
    headingLevel(command.slice(1)) > 0
  );
}

function paragraphEnd(source: string, position: number) {
  const blank = /\r?\n[^\S\r\n]*\r?\n/y;
  const unmatched = new Set<string>();
  for (let next = position; next < source.length; next++) {
    blank.lastIndex = next;
    if (blank.test(source)) return next;
    if (next > position && blockStart(source, next)) return next;
    const character = source[next];
    if (character === '%') next = lineEnd(source, next);
    else if (character === '$' || source.startsWith('\\(', next)) {
      const dollar = character === '$';
      const close = dollar ? '$' : '\\)';
      const end = unmatched.has(close) ? -1 : mathEnd(source, next + (dollar ? 1 : 2), close);
      if (end >= 0) next = end + (dollar ? 0 : 1);
      else unmatched.add(close);
    } else if (character === '\\') {
      const end = commandEnd(source, next);
      next = (source.slice(next, end) === '\\verb' ? verbatimEnd(source, end) : end) - 1;
    } else if (character === '{') next = (groupAt(source, next)?.end ?? source.length) - 1;
  }
  return source.length;
}

function listItems(source: string, depth: number): { items: Node[]; tail: string } | undefined {
  let position = whitespaceEnd(source, 0);
  let before = source.slice(0, position);
  const items: Node[] = [];
  let tail = '';
  while (position < source.length) {
    const command = commandEnd(source, position);
    if (source.slice(position, command) !== '\\item') return;
    const optionStart = whitespaceEnd(source, command);
    const option = groupAt(source, optionStart, '[', ']');
    if (option) return; // Custom item labels need the original list layout.
    const start = whitespaceEnd(source, command);
    let next = start;
    while (next < source.length) {
      if (source[next] === '%') next = lineEnd(source, next);
      if (source[next] === '\\') {
        const end = commandEnd(source, next);
        const name = source.slice(next, end);
        if (name === '\\item') break;
        if (name === '\\begin') {
          const environment = environmentAt(source, next);
          if (!environment) return;
          next = environment.end;
          continue;
        }
        next = name === '\\verb' ? verbatimEnd(source, end) : end;
      } else if (source[next] === '{') next = groupAt(source, next)?.end ?? next + 1;
      else next++;
    }
    const content = blocks(source.slice(start, next), depth + 1);
    if (!content.nodes.length) content.nodes.push(schema.nodes.paragraph!.create({ before: '' }));
    if (content.nodes[0]!.type !== schema.nodes.paragraph)
      content.nodes.unshift(schema.nodes.paragraph!.create({ before: '' }));
    items.push(
      schema.nodes.list_item!.create(
        {
          before,
          open: source.slice(position, start),
        },
        content.nodes,
      ),
    );
    position = next;
    before = content.tail;
    tail = content.tail;
  }
  if (items.length) return { items, tail };
}

function environmentBlock(source: string, position: number, before: string, depth: number) {
  if (source.slice(position, commandEnd(source, position)) !== '\\begin') return;
  const environment = environmentAt(source, position);
  if (!environment)
    return {
      node: schema.nodes.latex_raw!.create({
        before,
        source: source.slice(position),
      }),
      end: source.length,
    };
  const { name, from, to, end } = environment;
  const content = source.slice(from, to);
  const open = source.slice(position, from);
  const close = source.slice(to, end);
  if (displayEnvironments.has(name))
    return {
      node: schema.nodes.latex_display_math!.create({ before, open, close, source: content }),
      end,
    };
  if ((name === 'itemize' || name === 'enumerate') && depth < 64) {
    const list = listItems(content, depth);
    if (list)
      return {
        node: schema.nodes[name === 'itemize' ? 'bullet_list' : 'ordered_list']!.create(
          { before, open, close: list.tail + close },
          list.items,
        ),
        end,
      };
  }
  // Text environments edit as native blocks. The open and close source keep the environment, and
  // an empty one, such as a new abstract, gets an empty paragraph to type into.
  if (textEnvironments.has(name) && depth < 64) {
    const quote = blocks(content, depth + 1);
    if (!quote.nodes.length) quote.nodes.push(schema.nodes.paragraph!.create({ before: '' }));
    return {
      node: schema.nodes.blockquote!.create(
        {
          before,
          open,
          close: quote.tail + close,
        },
        quote.nodes,
      ),
      end,
    };
  }
  return {
    node: schema.nodes.latex_raw!.create({ before, source: source.slice(position, end) }),
    end,
  };
}

function blocks(source: string, depth = 0): { nodes: Node[]; tail: string } {
  const nodes: Node[] = [];
  let position = 0;
  while (position < source.length) {
    const start = whitespaceEnd(source, position);
    const before = source.slice(position, start);
    if (start === source.length) return { nodes, tail: before };
    const command = source.slice(start, commandEnd(source, start));
    if (blockCommands.has(command)) {
      nodes.push(schema.nodes.latex_raw!.create({ before, source: command }));
      position = start + command.length;
      continue;
    }
    const bibliography = bibliographyCommands.has(command) ? bibliographyAt(source, start) : undefined;
    if (bibliography) {
      nodes.push(schema.nodes.latex_raw!.create({ before, source: source.slice(start, bibliography) }));
      position = bibliography;
      continue;
    }
    const heading = source[start] === '\\' ? headingAt(source, start) : undefined;
    if (heading) {
      nodes.push(
        schema.nodes.heading!.create(
          {
            level: heading.level,
            before,
            open: source.slice(start, heading.from),
            close: '}',
          },
          inline(source.slice(heading.from, heading.to)),
        ),
      );
      position = heading.end;
      continue;
    }
    const delimiter = source.startsWith('$$', start)
      ? '$$'
      : source.startsWith('\\[', start)
        ? '\\['
        : undefined;
    if (delimiter) {
      const close = delimiter === '$$' ? '$$' : '\\]';
      const end = mathEnd(source, start + 2, close);
      if (end >= 0) {
        nodes.push(
          schema.nodes.latex_display_math!.create({
            before,
            open: delimiter,
            close,
            source: source.slice(start + 2, end),
          }),
        );
        position = end + 2;
        continue;
      }
    }
    const environment =
      source[start] === '\\' ? environmentBlock(source, start, before, depth) : undefined;
    if (environment) {
      nodes.push(environment.node);
      position = environment.end;
      continue;
    }
    const end = paragraphEnd(source, start);
    const content = source.slice(start, end).trimEnd();
    nodes.push(schema.nodes.paragraph!.create({ before }, inline(content)));
    position = start + content.length;
  }
  return { nodes, tail: '' };
}

/** Parse common constructs structurally and retain unsupported TeX as inert, verbatim nodes. */
export function parseLatex(source: string): Node {
  const body = documentBody(source);
  const { nodes, tail } = blocks(body ? source.slice(body.from, body.to) : source);
  const prefix = body ? source.slice(0, body.from) : '';
  const suffix = tail + (body ? source.slice(body.to) : '');
  if (!nodes.length) {
    // In a blank document, typing starts after the whitespace already following the opener.
    const split = body ? Math.max(0, tail.indexOf('\n') + 1) : tail.length;
    nodes.push(schema.nodes.paragraph!.create({ before: tail.slice(0, split) }));
    return schema.topNodeType.create(
      { format: 'latex', prefix, suffix: suffix.slice(split) },
      nodes,
    );
  }
  return schema.topNodeType.create({ format: 'latex', prefix, suffix }, nodes);
}

function inlineSource(node: Node) {
  let result = '';
  let active: Mark[] = [];
  node.forEach((child) => {
    const next = child.marks.filter((mark) =>
      ['strong', 'em', 'latex_style'].includes(mark.type.name),
    );
    next.sort((a, b) => (a.attrs.order ?? 100) - (b.attrs.order ?? 100));
    let keep = 0;
    while (keep < active.length && keep < next.length && active[keep]!.eq(next[keep]!)) keep++;
    for (let index = active.length - 1; index >= keep; index--)
      result += active[index]!.attrs.close ?? '}';
    for (const mark of next.slice(keep))
      result += mark.attrs.open ?? (mark.type.name === 'strong' ? '\\textbf{' : '\\emph{');
    active = next;
    if (child.isText)
      result += child.text!.replace(
        /[\\%${}#&_\^~\u00a0]/g,
        (value) => escapeText.get(value) ?? value,
      );
    else if (child.type.name === 'latex_math') result += mathSource(child);
    else if (child.type.name === 'hard_break') result += '\\\\\n';
    else result += child.attrs.source ?? child.textContent;
  });
  for (const mark of active.reverse()) result += mark.attrs.close ?? '}';
  return result;
}

function mathSource(node: Node) {
  const display = !node.isInline;
  return (
    (node.attrs.open ?? (display ? '\\[' : '\\(')) +
    node.attrs.source +
    (node.attrs.close ?? (display ? '\\]' : '\\)'))
  );
}

const serialized = new WeakMap<Node, string>();

function blockSource(node: Node): string {
  const cached = serialized.get(node);
  if (cached !== undefined) return cached;
  const { open, close } = node.attrs;
  let result: string;
  switch (node.type.name) {
    case 'latex_raw':
      result = node.attrs.source;
      break;
    case 'latex_display_math':
      result = mathSource(node);
      break;
    case 'heading': {
      const command = latexHeadings[node.attrs.level - 1] ?? latexHeadings[0];
      result = (open ?? '\\' + command + '{') + inlineSource(node) + (close ?? '}');
      break;
    }
    case 'bullet_list':
    case 'ordered_list':
    case 'blockquote': {
      const environment =
        node.type.name === 'bullet_list'
          ? 'itemize'
          : node.type.name === 'ordered_list'
            ? 'enumerate'
            : 'quote';
      result =
        (open ?? '\\begin{' + environment + '}\n') +
        childrenSource(node) +
        (close ?? '\n\\end{' + environment + '}');
      break;
    }
    case 'list_item':
      result = (open ?? '\\item ') + childrenSource(node);
      break;
    default:
      result = node.isTextblock ? inlineSource(node) : childrenSource(node);
  }
  serialized.set(node, result);
  return result;
}

function childrenSource(parent: Node) {
  let result = '';
  parent.forEach((child, _offset, index) => {
    result +=
      (child.attrs.before ?? (index === 0 ? '' : child.type.name === 'list_item' ? '\n' : '\n\n')) +
      blockSource(child);
  });
  return result;
}

export function serializeLatex(document: Node) {
  return document.attrs.prefix + childrenSource(document) + document.attrs.suffix;
}

/** Source mode and the hosted CLI turn source changes into normal, mappable editor steps. */
export function replaceLatexSource(document: Node, source: string): Transform {
  const next = parseLatex(source);
  const transform = new Transform(document);
  updateLatexBoundary(transform, 'prefix', next.attrs.prefix);
  updateLatexBoundary(transform, 'suffix', next.attrs.suffix);

  const from = document.content.findDiffStart(next.content);
  if (from === null) return transform;
  const original = document.nodeAt(from);
  const edited = next.nodeAt(from);
  if (original?.type === edited?.type && edited?.type.name.startsWith('latex_') &&
      typeof original?.attrs.source === 'string' && typeof edited.attrs.source === 'string') {
    const sourceEdit = updateLatexNodeSource(new Transform(transform.doc), from, edited.attrs.source);
    if (sourceEdit.doc.eq(next)) {
      for (const step of sourceEdit.steps) transform.step(step);
      return transform;
    }
  }
  const end = document.content.findDiffEnd(next.content)!;
  const overlap = from - Math.min(end.a, end.b);
  if (overlap > 0) {
    end.a += overlap;
    end.b += overlap;
  }
  const precise = new Transform(transform.doc);
  try {
    precise.replace(from, end.a, next.slice(from, end.b));
    if (precise.doc.eq(next)) {
      for (const step of precise.steps) transform.step(step);
      return transform;
    }
  } catch (error) {
    if (!(error instanceof Error) || !['TransformError', 'RangeError'].includes(error.name))
      throw error;
  }
  let left = 0;
  let right = document.childCount;
  let nextRight = next.childCount;
  let start = 0;
  while (left < right && left < nextRight && document.child(left).eq(next.child(left)))
    start += document.child(left++).nodeSize;
  let stop = document.content.size;
  while (
    right > left &&
    nextRight > left &&
    document.child(right - 1).eq(next.child(nextRight - 1))
  ) {
    stop -= document.child(--right).nodeSize;
    nextRight--;
  }
  const replacement: Node[] = [];
  for (let index = left; index < nextRight; index++) replacement.push(next.child(index));
  return transform.replaceWith(start, stop, Fragment.fromArray(replacement));
}

const containerDefaults: Record<string, string> = {
  bullet_list: '\\begin{itemize}\n',
  ordered_list: '\\begin{enumerate}\n',
  blockquote: '\\begin{quote}\n',
  list_item: '\\item ',
};

/**
 * The innermost block whose source contains `offset` in `serializeLatex(document)`, with its
 * document position. Undefined for the preamble and the text after `\end{document}`. Error
 * reports from TeX use this to select the block a line belongs to.
 */
export function latexBlockAtOffset(
  document: Node,
  offset: number,
): { position: number; node: Node } | undefined {
  const locate = (
    parent: Node,
    contentStart: number,
    at: number,
  ): { position: number; node: Node } | undefined => {
    let cursor = 0;
    let found: { position: number; node: Node } | undefined;
    parent.forEach((child, childOffset, index) => {
      if (found) return;
      const before =
        child.attrs.before ??
        (index === 0 ? '' : child.type.name === 'list_item' ? '\n' : '\n\n');
      const start = cursor + before.length;
      const end = start + blockSource(child).length;
      cursor = end;
      if (at < start || at >= end) return;
      const position = contentStart + childOffset;
      const open = child.attrs.open ?? containerDefaults[child.type.name];
      if (!child.isTextblock && !child.isAtom && open !== undefined && child.childCount) {
        const inner = locate(child, position + 1, at - start - open.length);
        if (inner) {
          found = inner;
          return;
        }
      }
      found = { position, node: child };
    });
    return found;
  };
  return locate(document, 0, offset - String(document.attrs.prefix).length);
}
