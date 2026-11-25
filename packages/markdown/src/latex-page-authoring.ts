import { latexBreakCommand, readLatexBookMatter, readLatexClass, readLatexPageDirective, type LatexPageNumberFormat } from './latex-flow';
import { updateLatexBoundary } from './latex-boundary-step';
import { latexEffectivePrefix } from './latex-project';
import { enableLatexEmptyVersos, latexRightPageBreak } from './latex-page-start';
import { latexDocumentStartCommands } from './latex-syntax';
import type { Node } from 'prosemirror-model';
import type { Transform } from 'prosemirror-transform';

export type LatexBookMatter = NonNullable<ReturnType<typeof readLatexBookMatter>>;
export type LatexPageNumberSection = { format: LatexPageNumberFormat; startAt: number };

/** Create the appendix switch or a manual page break. */
export function createLatexStructure(document: Node, command: 'appendix' | 'newpage' | 'cleardoublepage') {
  return document.type.schema.nodes.latex_raw!.create({
    source: '\\' + command + (command === 'appendix' ? '' : '\n'),
  });
}

function rawSource(node: Node | null) {
  return node?.type.name === 'latex_raw' ? String(node.attrs.source).trim() : '';
}

function previous(document: Node, position: number) {
  const node = document.resolve(position).nodeBefore;
  return { source: rawSource(node), position: position - (node?.nodeSize ?? 0) };
}

function sectionStart(document: Node, position: number) {
  for (;;) {
    const prior = previous(document, position);
    const directive = readLatexPageDirective(prior.source);
    if (directive?.kind !== 'numbering' && directive?.kind !== 'counter' && directive?.kind !== 'extended-letters') return position;
    position = prior.position;
  }
}

/** The numbering format leading up to a block, and its restart value when one is set there. */
export function readLatexPageNumberSection(document: Node, position: number): LatexPageNumberSection {
  const start = sectionStart(document, position);
  const prefix = latexEffectivePrefix(document);
  let format: LatexPageNumberFormat = 'arabic';
  let startAt = 1;
  function read(source: string, at = 0, local = false) {
    const directive = readLatexPageDirective(source, at);
    if (directive?.kind === 'numbering') {
      format = directive.value;
      startAt = 1;
    }
    if (local && directive?.kind === 'counter') startAt = directive.value;
  }
  for (const command of latexDocumentStartCommands(prefix)) read(prefix, command.start);
  document.descendants((node, at) => {
    if (at >= position) return false;
    const source = rawSource(node);
    const matter = readLatexBookMatter(source);
    if (matter === 'front' || matter === 'main') format = matter === 'front' ? 'roman' : 'arabic';
    if (source) read(source, 0, at >= start);
    return true;
  });
  return { format, startAt };
}

function insertCommands(tr: Transform, from: number, to: number, commands: string[]) {
  const before = tr.doc.nodeAt(from)?.attrs.before ?? '\n';
  const newline = /\r\n/.test(String(tr.doc.attrs.prefix)) ? '\r\n' : '\n';
  const raw = tr.doc.type.schema.nodes.latex_raw!;
  const nodes = commands.map((source, index) =>
    raw.create({ source, before: index === 0 ? before || newline : newline }));
  tr.replaceWith(from, to, nodes);
  const after = from + nodes.reduce((size, node) => size + node.nodeSize, 0);
  if (tr.doc.nodeAt(after)?.attrs.before === '') tr.setNodeAttribute(after, 'before', newline);
}

/** Start a numbered section at a block boundary. Editing the same boundary replaces its reset. */
export function setLatexPageNumberSection(tr: Transform, position: number, section: LatexPageNumberSection) {
  const { format, startAt } = section;
  if (!Number.isInteger(startAt) || startAt < -2147483647 || startAt > 2147483647)
    throw new RangeError('Enter a whole page number between −2147483647 and 2147483647.');
  const letters = format === 'alph' || format === 'Alph';
  if (letters && startAt < 1) throw new RangeError('Start letter numbering at 1 or higher.');
  const start = sectionStart(tr.doc, position);
  const prior = previous(tr.doc, start).source;
  const commands: string[] = [];
  if (start && !latexBreakCommand(prior) && !readLatexBookMatter(prior)) {
    const { name, options } = readLatexClass(latexEffectivePrefix(tr.doc));
    const openRight = options.findLast(option => option === 'openright' || option === 'openany');
    const chapter = /^\\(?:chapter|part)\b/.test(String(tr.doc.nodeAt(position)?.attrs.open ?? ''));
    commands.push(chapter && (openRight ? openRight === 'openright' : name === 'book')
      ? latexRightPageBreak : '\\clearpage');
  }
  if (commands.includes(latexRightPageBreak)) enableLatexEmptyVersos(tr);
  commands.push('\\pagenumbering{' + format + '}');
  if (letters) {
    const prefix = String(tr.doc.attrs.prefix);
    const begin = /\\begin\s*\{document\}\s*$/.exec(prefix);
    if (!begin) throw new Error('Set up a document preamble before using letter numbering.');
    if (!prefix.includes('\\cs_new_eq:NN \\tumblerPagealph')) {
      const newline = prefix.includes('\r\n') ? '\r\n' : '\n';
      const alphabet = [
        '\\ExplSyntaxOn',
        '\\cs_new_eq:NN \\tumblerPagealph \\int_to_alph:n',
        '\\cs_new_eq:NN \\tumblerPageAlph \\int_to_Alph:n',
        '\\ExplSyntaxOff',
      ].join(newline);
      updateLatexBoundary(tr, 'prefix', prefix.slice(0, begin.index) + alphabet + newline + prefix.slice(begin.index));
    }
    commands.push('\\renewcommand{\\thepage}{\\tumblerPage' + format + '{\\value{page}}}');
  }
  if (startAt !== 1) commands.push('\\setcounter{page}{' + startAt + '}');
  insertCommands(tr, start, position, commands);
}

/** Insert or change a standard book matter boundary before a block. */
export function setLatexBookMatter(tr: Transform, position: number, matter: LatexBookMatter) {
  if (readLatexClass(latexEffectivePrefix(tr.doc)).name !== 'book') return;
  const prior = previous(tr.doc, position);
  const existing = readLatexBookMatter(prior.source);
  if (existing === matter) return;
  enableLatexEmptyVersos(tr);
  insertCommands(tr, existing ? prior.position : position, position, ['\\' + matter + 'matter']);
}
