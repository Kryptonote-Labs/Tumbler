import type { Node } from 'prosemirror-model';
import { latexLength } from './latex-lengths';
import { latexFontSizes } from './latex-size-table';
import { commandEnd, environmentAt, groupAt, latexCommands, whitespaceEnd } from './latex-syntax';

const sizeCommands = new Set<string>(latexFontSizes);

export type LatexComposedPageKind = 'title' | 'page';
export type LatexVerticalAlignment = 'top' | 'center' | 'bottom' | 'distribute';
const alignments = { left: '\\raggedright', center: '\\centering', right: '\\raggedleft' };
type LineStyle = { alignment: keyof typeof alignments; size: string; bold: boolean; italic: boolean };
const open = /^\\clearpage\s*\\begingroup(?![A-Za-z@])/;
const topFill = '\\vspace*{\\fill}';
const bottomFill = '\\vspace{\\fill}';
const betweenFill = '\\vspace{\\stretch{1}}';

export function latexComposedPageKind(source: string): LatexComposedPageKind | undefined {
  if (/^\\begin\s*\{titlepage\}/.test(source)) return 'title';
  if (open.test(source)) return 'page';
}

export function latexComposedPageAt(source: string, start = 0) {
  const rest = source.slice(start);
  const kind = latexComposedPageKind(rest);
  if (kind === 'title') {
    const environment = environmentAt(source, start);
    if (environment) return { kind, ...environment };
  } else if (kind === 'page') {
    const from = start + open.exec(rest)![0].length;
    let depth = 1;
    let previous: { name: string; start: number; end: number } | undefined;
    for (const command of latexCommands(source.slice(from))) {
      if (command.name === 'begingroup') depth++;
      if (command.name === 'endgroup' && --depth === 0) {
        if (previous?.name !== 'clearpage' ||
            source.slice(from + previous.end, from + command.start).trim()) return;
        return { kind, from, to: from + previous.start, end: from + command.end };
      }
      previous = command;
    }
  }
}

const defaultStyle = (kind: LatexComposedPageKind): LineStyle => ({
  alignment: kind === 'title' ? 'center' : 'left', size: 'normalsize', bold: false, italic: false,
});

function lineSource(style: LineStyle, text = '\\mbox{}') {
  const size = sizeCommands.has(style.size) ? style.size : 'normalsize';
  return '{' + alignments[style.alignment] + '\\' + size +
    (style.bold ? '\\bfseries' : '') + (style.italic ? '\\itshape' : '') + ' ' + text + '\\par}';
}

/** Start a standard title page or an ordinary page with separate page boundaries. */
export function latexComposedPageSource(kind: LatexComposedPageKind) {
  const line = lineSource(defaultStyle(kind));
  return kind === 'title'
    ? '\\begin{titlepage}\n' + line + '\n\\end{titlepage}'
    : '\\clearpage\n\\begingroup\n' + line + '\n\\clearpage\n\\endgroup';
}

/** Create the source-backed page block used by the visual editor. */
export function createLatexComposedPage(document: Node, kind: LatexComposedPageKind) {
  return document.type.schema.nodes.latex_raw!.create({ source: latexComposedPageSource(kind) });
}

function editableLine(source: string, start: number) {
  const group = groupAt(source, start);
  if (!group) return;
  const commands = /^(\\raggedright|\\centering|\\raggedleft)\\([A-Za-z]+)(\\bfseries)?(\\itshape)? /.exec(source.slice(group.from, group.to));
  if (!commands || !sizeCommands.has(commands[2]!)) return;
  const alignment = commands[1] === alignments.left ? 'left' :
    commands[1] === alignments.center ? 'center' : 'right';
  const from = group.from + commands[0].length;
  const to = group.to - '\\par'.length;
  if (to < from || source.slice(to, group.to) !== '\\par') return;
  const style: LineStyle = { alignment, size: commands[2]!, bold: !!commands[3], italic: !!commands[4] };
  return { start, end: group.end, from, to, style };
}

/** Read the ribbon-editable lines and alignment of an explicit page. */
export function readLatexPageComposition(source: string) {
  const page = latexComposedPageAt(source);
  if (!page) return;
  const lines: NonNullable<ReturnType<typeof editableLine>>[] = [];
  const fills: { from: number; to: number; source: string }[] = [];
  const start = whitespaceEnd(source, page.from);
  for (let at = start; at < page.to;) {
    const line = editableLine(source, at);
    if (line) {
      lines.push(line);
      at = whitespaceEnd(source, line.end);
      continue;
    }
    if (source[at] === '%') {
      const end = source.indexOf('\n', at);
      at = end < 0 ? page.to : whitespaceEnd(source, end);
      continue;
    }
    const fill = [topFill, bottomFill, betweenFill].find((value) => source.startsWith(value, at));
    if (fill) fills.push({ from: at, to: at + fill.length, source: fill });
    else if (page.kind === 'title') {
      // A title page environment alone does not identify a ribbon composition.
      const gap = latexComposedLineGap(source, at);
      if (!gap || !lines.length) return;
      at = whitespaceEnd(source, gap.to);
      continue;
    }
    const next = fill ? at + fill.length : source[at] === '{'
      ? groupAt(source, at)?.end
      : source[at] === '\\' ? commandEnd(source, at) : undefined;
    at = whitespaceEnd(source, next ?? at + 1);
  }
  if (page.kind === 'title' && !lines.length) return;
  const top = fills.some((fill) => fill.source === topFill && fill.from === start);
  const bottom = fills.some((fill) => fill.source === bottomFill && whitespaceEnd(source, fill.to) === page.to);
  const distributed = fills.some((fill) => fill.source === betweenFill);
  const alignment: LatexVerticalAlignment = top ? bottom ? 'center' : 'bottom'
    : distributed ? 'distribute' : 'top';
  return { ...page, lines, fills, alignment };
}

/** The manually inserted gap associated with this line. */
export function latexComposedLineGap(source: string, lineEnd: number) {
  const from = whitespaceEnd(source, lineEnd);
  const gap = /^(\\vfill(?![A-Za-z@])|\\vspace\*\{([^{}]*)\})/.exec(source.slice(from));
  if (gap && gap[0] !== topFill) return { from, to: from + gap[0].length, length: gap[2] ?? '' };
}

export type LatexCompositionEdit =
  | { kind: 'page-alignment'; alignment: LatexVerticalAlignment }
  | { kind: 'line-text'; text: string }
  | { kind: 'line-style'; style: Partial<LineStyle> }
  | { kind: 'add-line' }
  | { kind: 'remove-line' }
  | { kind: 'space'; length: string | null };

function replace(source: string, from: number, to: number, value: string) {
  return source.slice(0, from) + value + source.slice(to);
}

function alignPage(source: string, alignment: LatexVerticalAlignment) {
  let page = readLatexPageComposition(source);
  if (!page) return source;
  for (const fill of page.fills.reverse()) {
    if (fill.source === betweenFill || (fill.source === topFill && fill.from === whitespaceEnd(source, page.from))
        || (fill.source === bottomFill && whitespaceEnd(source, fill.to) === page.to))
      source = replace(source, fill.from, fill.to + Number(source[fill.to] === '\n'), '');
  }
  page = readLatexPageComposition(source);
  if (!page) return source;
  if (alignment === 'center') source = replace(source, page.to, page.to, bottomFill + '\n');
  if (alignment === 'center' || alignment === 'bottom') {
    const at = whitespaceEnd(source, page.from);
    source = replace(source, at, at, topFill + '\n');
  }
  if (alignment === 'distribute') {
    for (const line of page.lines.slice(1).reverse())
      source = replace(source, line.start, line.start, betweenFill + '\n');
  }
  return source;
}

/** Apply a ribbon edit without reserializing the rest of the page. */
export function editLatexPageComposition(source: string, index: number, edit: LatexCompositionEdit) {
  const page = readLatexPageComposition(source);
  if (!page) return source;
  if (edit.kind === 'page-alignment') return alignPage(source, edit.alignment);
  const line = page.lines[index];
  if (edit.kind === 'line-text' && line) return replaceLatexComposedText(source, line, edit.text);
  if (edit.kind === 'line-style' && line)
    return replace(source, line.start, line.end,
      lineSource({ ...line.style, ...edit.style }, source.slice(line.from, line.to)));
  if (edit.kind === 'add-line') {
    const at = line ? latexComposedLineGap(source, line.end)?.to ?? line.end : page.from;
    const added = replace(source, at, at, '\n' + lineSource(line?.style ?? defaultStyle(page.kind)) + (line ? '' : '\n'));
    return page.alignment === 'distribute' ? alignPage(added, 'distribute') : added;
  }
  if (edit.kind === 'remove-line' && line) {
    if (page.lines.length === 1) return replace(source, line.from, line.to, '\\mbox{}');
    const end = latexComposedLineGap(source, line.end)?.to ?? line.end;
    const removed = replace(source, line.start, end + Number(source[end] === '\n'), '');
    return page.alignment === 'distribute' ? alignPage(removed, 'distribute') : removed;
  }
  if (edit.kind === 'space') {
    if (!line) return source;
    const length = edit.length?.trim();
    if (length && latexLength(length) === undefined) throw new Error('Enter a measurement such as 6mm or 12pt.');
    const gap = latexComposedLineGap(source, line.end);
    if (length === undefined) return gap ? replace(source, line.end, gap.to, '') : source;
    const space = length ? '\\vspace*{' + length + '}' : '\\vfill';
    return gap ? replace(source, gap.from, gap.to, space) : replace(source, line.end, line.end, '\n' + space);
  }
  return source;
}

/** Encode literal text typed into a composed page. */
export function latexComposedTextSource(text: string) {
  const literal = new Map([
    ['\\', '\\textbackslash{}'], ['^', '\\textasciicircum{}'], ['~', '\\textasciitilde{}'],
  ]);
  return text.replace(/[\\^~{}&%$#_]/g, (character) => literal.get(character) ?? '\\' + character) || '\\mbox{}';
}

/** Replace an editable text range in a composed page with literal text. */
export function replaceLatexComposedText(source: string, range: { from: number; to: number }, text: string) {
  return replace(source, range.from, range.to, latexComposedTextSource(text));
}
