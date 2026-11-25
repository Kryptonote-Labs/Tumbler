import type { Node } from 'prosemirror-model';
import { latexLength } from './latex-lengths';
import { latexPageOpening, latexRightPageBreak, latexRightPagePrefix } from './latex-page-start';
import { latexEffectivePrefix } from './latex-project';
import { latexFontSizes } from './latex-size-table';
import { readLatexContentsEntry } from './latex-state-command';
import { commandEnd, environmentAt, groupAt, latexCommands, whitespaceEnd } from './latex-syntax';

const sizeCommands = new Set<string>(latexFontSizes);

export type LatexComposedPageKind = 'title' | 'page';
export type LatexVerticalAlignment = 'top' | 'center' | 'bottom' | 'distribute';
const alignments = { left: '\\raggedright', center: '\\centering', right: '\\raggedleft' };
type LineStyle = { alignment: keyof typeof alignments; size: string; bold: boolean; italic: boolean };
const open = /^\\clear(?:double)?page\s*\\begingroup(?![A-Za-z@])/;
const topFill = '\\vspace*{\\fill}';
const bottomFill = '\\vspace{\\fill}';
const spacingCommands = /^(?:\\linespread\{([\d.]+)\}\\selectfont\s*)?(?:\\setlength\{\\parskip\}\{([^{}]+)\}\s*)?/;
const betweenFill = '\\vspace{\\stretch{1}}';

export function latexComposedPageKind(source: string): LatexComposedPageKind | undefined {
  if (/^\\begin\s*\{titlepage\}/.test(source.slice(latexRightPagePrefix(source).length))) return 'title';
  if (open.test(source)) return 'page';
}

export function latexComposedPageAt(source: string, start = 0) {
  const rest = source.slice(start);
  const kind = latexComposedPageKind(rest);
  if (kind === 'title') {
    const environment = environmentAt(source, start + latexRightPagePrefix(rest).length);
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
export function latexComposedPageSource(kind: LatexComposedPageKind, right = false) {
  const line = '\\linespread{1}\\selectfont\n\\setlength{\\parskip}{0pt}\n' + lineSource(defaultStyle(kind));
  return kind === 'title'
    ? (right ? latexRightPageBreak + '\n' : '') + '\\begin{titlepage}\n' + line + '\n\\end{titlepage}'
    : (right ? latexRightPageBreak : '\\clearpage') + '\n\\begingroup\n' + line + '\n\\clearpage\n\\endgroup';
}

/** Read a contents entry placed at the start of the page's grouped material. */
export function latexComposedContents(source: string) {
  const page = latexComposedPageAt(source);
  if (!page) return;
  const start = whitespaceEnd(source, page.from);
  const entry = readLatexContentsEntry(source, start);
  if (entry?.list === 'toc' && entry.end <= page.to) return { ...entry, start };
}

/** Create the source-backed page block used by the visual editor. */
export function createLatexComposedPage(document: Node, kind: LatexComposedPageKind) {
  const { chapterOnRight } = latexPageOpening(latexEffectivePrefix(document));
  return document.type.schema.nodes.latex_raw!.create({ source: latexComposedPageSource(kind, chapterOnRight) });
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

type ComposedLine = NonNullable<ReturnType<typeof editableLine>>;
export type LatexComposedBlockKind = 'paragraph' | 'itemize' | 'enumerate';
type ComposedBlock = { kind: LatexComposedBlockKind | 'line'; start: number; end: number };

/** Find the end of a paragraph without treating commands inside groups as separators. */
function paragraphEnd(source: string, start: number, limit: number) {
  for (let at = start; at < limit;) {
    if (source[at] === '\n') {
      let next = at + 1;
      while (source[next] === ' ' || source[next] === '\t' || source[next] === '\r') next++;
      if (source[next] === '\n') return at;
    }
    if (source[at] === '{') at = groupAt(source, at)?.end ?? at + 1;
    else if (source[at] === '%') {
      const end = source.indexOf('\n', at);
      at = end < 0 ? limit : end + 1;
    } else if (source[at] === '\\') {
      const end = commandEnd(source, at);
      const name = source.slice(at, end);
      if (name === '\\par') return end;
      if (at > start && (name === '\\begin' || name === '\\vspace' || name === '\\vfill')) return at;
      at = end;
    } else at++;
  }
  return limit;
}

/** Read the blocks, page spacing, and alignment of a ribbon-editable page. */
export function readLatexPageComposition(source: string) {
  const page = latexComposedPageAt(source);
  if (!page) return;
  // A contents entry precedes the page's spacing settings and content.
  const bodyStart = whitespaceEnd(source, latexComposedContents(source)?.end ?? page.from);
  const settings = spacingCommands.exec(source.slice(bodyStart));
  const settingsEnd = bodyStart + (settings?.[0].length ?? 0);
  const spacing = { stretch: settings?.[1], paragraphGap: settings?.[2] };
  const lines: ComposedLine[] = [];
  const blocks: ComposedBlock[] = [];
  const fills: { from: number; to: number; source: string }[] = [];
  const start = whitespaceEnd(source, settingsEnd);
  // A titlepage alone also occurs in imported documents with their own layout.
  const authored = page.kind === 'page' || settingsEnd > bodyStart;
  for (let at = start; at < page.to;) {
    const line = editableLine(source, at);
    const fill = [topFill, bottomFill, betweenFill].find((value) => source.startsWith(value, at));
    const gap = latexComposedLineGap(source, at);
    const environment = source.startsWith('\\begin', at) ? environmentAt(source, at) : undefined;
    let next: number;
    if (line) {
      lines.push(line);
      blocks.push({ kind: 'line', start: line.start, end: line.end });
      next = line.end;
    } else if (source[at] === '%') {
      const end = source.indexOf('\n', at);
      next = end < 0 ? page.to : end;
    } else if (fill) {
      next = at + fill.length;
      fills.push({ from: at, to: next, source: fill });
    } else if (gap) {
      next = gap.to;
    } else if (environment?.name === 'itemize' || environment?.name === 'enumerate') {
      next = environment.end;
      blocks.push({ kind: environment.name, start: at, end: next });
    } else {
      if (!authored && /^\\(?:thispagestyle|pagestyle|centering|raggedright|raggedleft)\b/.test(source.slice(at))) return;
      next = paragraphEnd(source, at, page.to);
      blocks.push({ kind: 'paragraph', start: at, end: next });
    }
    at = whitespaceEnd(source, next);
  }
  if (!authored && !lines.length) return;
  const top = fills.some((fill) => fill.source === topFill && fill.from === start);
  const bottom = fills.some((fill) => fill.source === bottomFill && whitespaceEnd(source, fill.to) === page.to);
  const distributed = fills.some((fill) => fill.source === betweenFill);
  const alignment: LatexVerticalAlignment = top ? bottom ? 'center' : 'bottom'
    : distributed ? 'distribute' : 'top';
  return { ...page, start, bodyStart, settingsEnd, spacing, lines, blocks, fills, alignment };
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
  | { kind: 'page-start'; right: boolean }
  | { kind: 'line-style'; style: Partial<LineStyle> }
  | { kind: 'page-spacing'; stretch?: string; paragraphGap?: string }
  | { kind: 'add-block'; block: LatexComposedBlockKind; after?: number }
  | { kind: 'add-line'; after?: number }
  | { kind: 'remove-line' }
  | { kind: 'remove-block'; start: number }
  | { kind: 'space'; length: string | null };

function replace(source: string, from: number, to: number, value: string) {
  return source.slice(0, from) + value + source.slice(to);
}

function alignPage(source: string, alignment: LatexVerticalAlignment) {
  let page = readLatexPageComposition(source);
  if (!page) return source;
  for (const fill of page.fills.reverse()) {
    if (fill.source === betweenFill || (fill.source === topFill && fill.from === page.start)
        || (fill.source === bottomFill && whitespaceEnd(source, fill.to) === page.to))
      source = replace(source, fill.from, fill.to + Number(source[fill.to] === '\n'), '');
  }
  page = readLatexPageComposition(source);
  if (!page) return source;
  if (alignment === 'center') source = replace(source, page.to, page.to, bottomFill + '\n');
  if (alignment === 'center' || alignment === 'bottom') {
    const at = page.start;
    source = replace(source, at, at, topFill + '\n');
  }
  if (alignment === 'distribute') {
    for (const block of page.blocks.slice(1).reverse())
      source = replace(source, block.start, block.start, betweenFill + '\n');
  }
  return source;
}

/** Apply a ribbon edit without reserializing the rest of the page. */
export function editLatexPageComposition(source: string, index: number, edit: LatexCompositionEdit) {
  const page = readLatexPageComposition(source);
  if (!page) return source;
  if (edit.kind === 'page-alignment') return alignPage(source, edit.alignment);
  if (edit.kind === 'page-start') {
    const right = latexRightPagePrefix(source);
    if (edit.right === !!right) return source;
    if (page.kind === 'title') return edit.right ? latexRightPageBreak + '\n' + source : source.slice(right.length);
    return source.replace(/^\\clear(?:double)?page/, () => edit.right ? latexRightPageBreak : '\\clearpage');
  }
  if (edit.kind === 'page-spacing') {
    const stretch = edit.stretch ?? page.spacing.stretch;
    const paragraphGap = edit.paragraphGap ?? page.spacing.paragraphGap;
    if (stretch && (!/^\d+(?:\.\d+)?$/.test(stretch) || Number(stretch) <= 0))
      throw new Error('Enter a positive line spacing multiplier.');
    if (paragraphGap && latexLength(paragraphGap) === undefined)
      throw new Error('Enter a measurement such as 6mm or 12pt.');
    const settings = [
      stretch && '\\linespread{' + stretch + '}\\selectfont',
      paragraphGap && '\\setlength{\\parskip}{' + paragraphGap + '}',
    ].filter(Boolean).join('\n');
    return replace(source, page.bodyStart, page.settingsEnd, settings ? settings + '\n' : '');
  }
  const line = page.lines[index];
  if (edit.kind === 'line-text' && line) return replaceLatexComposedText(source, line, edit.text);
  if (edit.kind === 'line-style' && line)
    return replace(source, line.start, line.end,
      lineSource({ ...line.style, ...edit.style }, source.slice(line.from, line.to)));
  if (edit.kind === 'add-line' || edit.kind === 'add-block') {
    const active = edit.after === undefined
      ? line ?? page.blocks.at(-1)
      : page.blocks.find((block) => block.end === edit.after);
    const at = active ? latexComposedLineGap(source, active.end)?.to ?? active.end : page.start;
    const block = edit.kind === 'add-line' ? lineSource(line?.style ?? defaultStyle(page.kind))
      : edit.block === 'paragraph' ? '\\mbox{}\\par'
      : '\\begin{' + edit.block + '}\n\\item \\mbox{}\n\\end{' + edit.block + '}';
    const added = replace(source, at, at, (active ? '\n' : '') + block + (!active || source[at] !== '\n' ? '\n' : ''));
    return page.alignment === 'distribute' ? alignPage(added, 'distribute') : added;
  }
  if (edit.kind === 'remove-block') {
    const block = page.blocks.find((entry) => entry.start === edit.start);
    if (!block || block.kind === 'line') return source;
    const fallback = page.blocks.length === 1 ? lineSource(defaultStyle(page.kind)) + '\n' : '';
    const removed = replace(source, block.start, block.end + Number(source[block.end] === '\n'), fallback);
    return page.alignment === 'distribute' ? alignPage(removed, 'distribute') : removed;
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

/** Split a plain-text run, keeping the following text in a real paragraph or list item. */
export function splitLatexComposedText(
  source: string,
  range: { from: number; to: number },
  left: string,
  right: string,
) {
  const page = readLatexPageComposition(source);
  const block = page?.blocks.find((entry) => range.from >= entry.start && range.to <= entry.end);
  if (!block || block.kind === 'line') return;
  // A break inside an inline group would carry the formatting across a structural boundary.
  for (let at = block.start; at < range.from;) {
    if (source[at] === '\\') at = commandEnd(source, at);
    else if (source[at] === '%') {
      const end = source.indexOf('\n', at);
      if (end < 0) return;
      at = end + 1;
    } else if (source[at] === '{') {
      const group = groupAt(source, at);
      if (!group || group.end > range.from) return;
      at = group.end;
    } else at++;
  }
  const join = block.kind === 'paragraph' ? '\\par\n' : '\n\\item ';
  const before = latexComposedTextSource(left.trimEnd()) + join;
  return {
    source: replace(source, range.from, range.to, before + latexComposedTextSource(right.trimStart())),
    target: range.from + before.length,
  };
}
