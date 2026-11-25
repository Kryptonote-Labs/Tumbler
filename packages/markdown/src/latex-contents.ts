import { serializeLatexSelection } from './latex';
import { latexHeadings } from './latex-headings';
import { isLatexBibliographyBlock } from './latex-bibliography';
import { updateLatexBoundary, updateLatexNodeSource } from './latex-boundary-step';
import { readLatexClass } from './latex-flow';
import { latexNumbering } from './latex-numbering';
import { latexEffectivePrefix } from './latex-project';
import { isLatexHeading } from './latex-spec';
import { readLatexContentsEntry } from './latex-state-command';
import { commandEnd, groupAt, latexCommands, whitespaceEnd } from './latex-syntax';
import type { Node } from 'prosemirror-model';
import type { Transform } from 'prosemirror-transform';

export type LatexHeadingMode = 'numbered' | 'unnumbered' | 'contents';

function headingCommand(node: Node) {
  return /^\\([a-z]+)\*?/.exec(String(node.attrs.open ?? ''))?.[1]
    ?? latexHeadings[node.attrs.level - 1] ?? 'section';
}

function headingTitle(document: Node, position: number, node: Node) {
  return serializeLatexSelection(document, position + 1, position + node.nodeSize - 1)
    .replace(/\\label\s*\{[^{}]*\}/g, '');
}

function contentsSource(command: string, title: string) {
  return '\\addcontentsline{toc}{' + command + '}{' + title + '}';
}

function isStarred(node: Node) {
  return /^\\[a-z]+\*/.test(String(node.attrs.open));
}

function rawSource(node: Node | null) {
  return node?.type.name === 'latex_raw' ? String(node.attrs.source).trim() : '';
}

function headingEntry(document: Node, position: number, heading: Node) {
  const source = rawSource(document.nodeAt(position + heading.nodeSize));
  const entry = readLatexContentsEntry(source);
  return entry?.list === 'toc' && entry.level === headingCommand(heading) && entry.end === source.length ? entry : undefined;
}

export function readLatexHeadingMode(document: Node, position: number): LatexHeadingMode | undefined {
  const node = document.nodeAt(position);
  if (!node || !isLatexHeading(node)) return;
  if (!isStarred(node)) return 'numbered';
  return headingEntry(document, position, node) ? 'contents' : 'unnumbered';
}

/** Toggle a heading's star and adjacent contents entry while retaining its editable text. */
export function setLatexHeadingMode(tr: Transform, position: number, mode: LatexHeadingMode) {
  const node = tr.doc.nodeAt(position);
  if (!node || !isLatexHeading(node) || readLatexHeadingMode(tr.doc, position) === mode) return;
  const command = headingCommand(node);
  const open = String(node.attrs.open ?? '\\' + command + '{');
  const end = commandEnd(open, 0);
  const option = !isStarred(node) && groupAt(open, whitespaceEnd(open, end), '[', ']');
  const entry = headingEntry(tr.doc, position, node);
  const title = option ? open.slice(option.from, option.to) : headingTitle(tr.doc, position, node);
  const after = position + node.nodeSize;
  if (entry && mode !== 'contents') {
    const raw = tr.doc.nodeAt(after);
    if (raw) tr.delete(after, after + raw.nodeSize);
  } else if (!entry && mode === 'contents') {
    tr.insert(after, tr.doc.type.schema.nodes.latex_raw!.create({
      before: '\n',
      source: contentsSource(command, title),
    }));
  }
  const rest = open.slice(option ? option.end : end + Number(isStarred(node)));
  const starred = mode !== 'numbered';
  tr.setNodeAttribute(position, 'open', '\\' + command + (starred ? '*' : '') +
    (option && !starred ? open.slice(end, option.end) : '') + rest);
}

/** Keep a matching adjacent contents title in step with visual heading edits. */
export function refreshLatexHeadingContents(
  tr: Transform, before: Node, position: number, mappedHeading: number, mappedEntry: number,
) {
  const old = before.nodeAt(position);
  if (!old || !isLatexHeading(old) || !isStarred(old)) return;
  const entry = tr.doc.nodeAt(mappedEntry);
  const previous = contentsSource(headingCommand(old), headingTitle(before, position, old));
  if (rawSource(before.nodeAt(position + old.nodeSize)) !== previous || rawSource(entry) !== previous)
    return;
  const heading = tr.doc.nodeAt(mappedHeading);
  if (!heading || !entry || mappedHeading + heading.nodeSize !== mappedEntry) return;
  if (isLatexHeading(heading) && isStarred(heading)) {
    const next = contentsSource(headingCommand(heading), headingTitle(tr.doc, mappedHeading, heading));
    if (next !== previous) updateLatexNodeSource(tr, mappedEntry, next);
  } else {
    tr.delete(mappedEntry, mappedEntry + entry.nodeSize);
  }
}

function bibContentsCommand(prefix: string) {
  const { name } = readLatexClass(prefix);
  return name === 'report' || name === 'book'
    ? '\\addcontentsline{toc}{chapter}{\\bibname}'
    : '\\addcontentsline{toc}{section}{\\refname}';
}

function bibliographyHook(prefix: string) {
  for (const { name, start, end } of latexCommands(prefix)) {
    if (name !== 'AddToHook') continue;
    const hook = groupAt(prefix, whitespaceEnd(prefix, end));
    if (!hook || prefix.slice(hook.from, hook.to).trim() !== 'cmd/thebibliography/after') continue;
    const option = groupAt(prefix, whitespaceEnd(prefix, hook.end), '[', ']');
    const body = groupAt(prefix, whitespaceEnd(prefix, option?.end ?? hook.end));
    if (body && prefix.slice(body.from, body.to).trim() === bibContentsCommand(prefix))
      return { start, end: body.end };
  }
}

function bibliographyOption(source: string) {
  const command = /^\\printbibliography\b/.exec(source);
  if (!command) return;
  return { end: command[0].length, option: groupAt(source, whitespaceEnd(source, command[0].length), '[', ']') };
}

function biblatexInContents(source: string) {
  const printed = bibliographyOption(source);
  return !!printed?.option && /(?:^|,)\s*heading\s*=\s*(?:bibintoc|bibnumbered)\s*(?:,|$)/.test(
    source.slice(printed.option.from, printed.option.to));
}

/** Whether there is a bibliography and it is configured to appear in the contents. */
export function readLatexBibliographyContents(document: Node) {
  const prefix = latexEffectivePrefix(document);
  const bibtexInContents = !!bibliographyHook(prefix);
  let present = false;
  let included = false;
  document.descendants(node => {
    const source = rawSource(node);
    if (!isLatexBibliographyBlock(source)) return true;
    present = true;
    included ||= bibliographyOption(source) ? biblatexInContents(source) : bibtexInContents;
    return false;
  });
  return { present, included };
}

/** Include a standard bibliography on its opening page, including one generated by BibTeX. */
export function setLatexBibliographyContents(tr: Transform, include: boolean) {
  const prefix = String(tr.doc.attrs.prefix);
  const effective = latexEffectivePrefix(tr.doc);
  let bibtex = false;
  tr.doc.descendants((node, position) => {
    const source = rawSource(node);
    if (!isLatexBibliographyBlock(source)) return true;
    const printed = bibliographyOption(source);
    if (!printed) {
      bibtex = true;
      return false;
    }
    if (include === biblatexInContents(source)) return false;
    const { option, end } = printed;
    const settings = option ? source.slice(option.from, option.to)
      .split(/,(?![^{}]*\})/).filter(setting => !/^\s*heading\s*=/.test(setting)) : [];
    if (include) settings.push('heading=bibintoc');
    updateLatexNodeSource(tr, position, source.slice(0, end) +
      (settings.length ? '[' + settings.join(',') + ']' : ''));
    return false;
  });
  if (!bibtex) return;
  const hook = bibliographyHook(prefix);
  if (!include && hook) {
    const after = /^[ \t]*(?:\r?\n|$)/.exec(prefix.slice(hook.end))?.[0].length ?? 0;
    updateLatexBoundary(tr, 'prefix', prefix.slice(0, hook.start) + prefix.slice(hook.end + after));
  } else if (include && !bibliographyHook(effective)) {
    const begin = /\\begin\s*\{document\}\s*$/.exec(prefix);
    if (begin) {
      const newline = prefix.includes('\r\n') ? '\r\n' : '\n';
      updateLatexBoundary(tr, 'prefix', prefix.slice(0, begin.index) +
        '\\AddToHook{cmd/thebibliography/after}{' + bibContentsCommand(effective) + '}' + newline +
        prefix.slice(begin.index));
    }
  }
}

export type LatexContentsEntry = {
  position: number;
  number: string;
  title: string;
  titleSource?: string;
  depth: number;
  chapter: boolean;
  section: boolean;
};

/** Resolve automatic and explicitly added entries in the order LaTeX writes them. */
export function latexContentsEntries(document: Node): LatexContentsEntry[] {
  const prefix = latexEffectivePrefix(document);
  const { name } = readLatexClass(prefix);
  const chaptered = name === 'book' || name === 'report';
  const numbering = latexNumbering(document)?.headings;
  const bibtexInContents = !!bibliographyHook(prefix);
  let tocDepth = chaptered ? 2 : 3;
  for (const { name, end } of latexCommands(prefix)) {
    if (name !== 'setcounter') continue;
    const counter = groupAt(prefix, whitespaceEnd(prefix, end));
    if (!counter || prefix.slice(counter.from, counter.to).trim() !== 'tocdepth') continue;
    const value = groupAt(prefix, whitespaceEnd(prefix, counter.end));
    const literal = value && prefix.slice(value.from, value.to).trim();
    if (literal && /^[+-]?\d+$/.test(literal)) tocDepth = Number(literal);
  }
  const levels = ['part', 'chapter', ...latexHeadings];
  const entries: LatexContentsEntry[] = [];
  function add(position: number, command: string, title: string, number = '', titleSource?: string) {
    const index = levels.indexOf(command);
    if (index < 0) return;
    const level = index === 0 ? chaptered ? -1 : 0 : index - 1;
    if (level > tocDepth) return;
    entries.push({
      position, number, title, ...(titleSource !== undefined && { titleSource }),
      depth: Math.max(0, level - (chaptered ? 0 : 1)),
      chapter: chaptered && (command === 'chapter' || command === 'part'),
      section: name === 'article' && command === 'section',
    });
  }
  document.descendants((node, position) => {
    if (isLatexHeading(node)) {
      if (isStarred(node)) return false;
      const open = String(node.attrs.open ?? '');
      const short = groupAt(open, whitespaceEnd(open, commandEnd(open, 0)), '[', ']');
      const titleSource = short ? open.slice(short.from, short.to) : headingTitle(document, position, node);
      add(position, headingCommand(node), titleSource, numbering?.get(position)?.number, titleSource);
      return false;
    }
    const source = rawSource(node);
    const entry = readLatexContentsEntry(source);
    if (entry?.list === 'toc') add(position, entry.level, entry.title, '', entry.title);
    if (isLatexBibliographyBlock(source) &&
      (bibliographyOption(source) ? biblatexInContents(source) : bibtexInContents))
      add(position, chaptered ? 'chapter' : 'section', chaptered ? 'Bibliography' : 'References');
    return !node.isTextblock;
  });
  return entries;
}
