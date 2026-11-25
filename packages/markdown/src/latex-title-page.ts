import { latexBaseSize } from './latex-class';
import { latexLineSpacing } from './latex-format';
import type { LatexPageLayout } from './latex-layout';
import { readLatexTextMacros } from './latex-macros';
import type { LatexTitleField } from './latex-metadata';
import { latexFontSize } from './latex-presentation';
import { latexCustomTitlePage } from './latex-state-command';
import { commandEnd, groupAt, lineEnd } from './latex-syntax';
import {
  controlWordEnd,
  dimension,
  printable,
  readGlue,
  skipSpaces,
  spaceEnd,
} from './latex-title-page-syntax';
import {
  latexTitleBox,
  type LatexTitleAlign,
  type LatexTitleMaterial,
  type LatexTitleRun,
  type LatexTitleStyle,
} from './latex-title-page-list';
import { texPoint } from './latex-typography';

export type { LatexTitleItem, LatexTitleRun, LatexTitleStyle } from './latex-title-page-list';

type State = {
  style: LatexTitleStyle;
  baseline: number;
  stretch: number;
  pendingStretch: number;
  align: LatexTitleAlign;
};
type Frame = { state: State; material?: LatexTitleMaterial[]; height?: number; environment?: string };
type Piece = LatexTitleRun & { space?: true };

const titleFields: readonly LatexTitleField[] = ['title', 'author', 'date', 'submitdate'];
const ignored = new Set([
  'relax', 'newpage', 'clearpage', 'cleardoublepage', 'noindent', 'indent', 'null', 'nobreak',
  'makeatletter', 'makeatother', 'protect', 'leavevmode',
]);
const ignoredWithArgument = new Map([['thispagestyle', 1], ['pagestyle', 1], ['setcounter', 2]]);
const families = new Map<string, LatexTitleStyle['family']>([
  ['rmfamily', 'roman'], ['sffamily', 'sans'], ['ttfamily', 'mono'],
]);
const oldStyles = new Map<string, Partial<LatexTitleStyle>>([
  ['rm', { family: 'roman' }], ['sf', { family: 'sans' }], ['tt', { family: 'mono' }],
  ['bf', { bold: true }], ['it', { italic: true }], ['sl', { italic: true }], ['sc', { smallCaps: true }],
]);
const series = new Map<string, Partial<LatexTitleStyle>>([
  ['bfseries', { bold: true }], ['mdseries', { bold: false }], ['itshape', { italic: true }],
  ['slshape', { italic: true }], ['upshape', { italic: false, smallCaps: false }],
  ['scshape', { smallCaps: true }],
]);
const textCommands = new Map([
  ['textbf', '\\bfseries'], ['textmd', '\\mdseries'], ['textit', '\\itshape'], ['textsl', '\\slshape'],
  ['textup', '\\upshape'], ['textsc', '\\scshape'], ['textrm', '\\rmfamily'], ['textsf', '\\sffamily'],
  ['texttt', '\\ttfamily'], ['textnormal', '\\normalfont'], ['emph', '\\em'],
]);
const alignments = new Map<string, LatexTitleAlign>([
  ['centering', 'center'], ['raggedright', 'left'], ['raggedleft', 'right'],
]);
const environments = new Map<string, LatexTitleAlign>([
  ['center', 'center'], ['flushleft', 'left'], ['flushright', 'right'],
]);
const symbols = new Map([
  ['&', '&'], ['%', '%'], ['$', '$'], ['#', '#'], ['_', '_'], ['{', '{'], ['}', '}'], [' ', ' '],
  [',', ' '], ['textbackslash', '\\'], ['quad', ' '], ['qquad', '  '],
  ['TeX', 'TeX'], ['LaTeX', 'LaTeX'], ['ldots', '…'], ['dots', '…'],
]);
const namedSkips = new Map([['smallskip', 3], ['medskip', 6], ['bigskip', 12]]);
const fills = new Map<string, 1 | 2>([['vfil', 1], ['vss', 1], ['vfill', 2]]);

const today = new Intl.DateTimeFormat('en-US', { dateStyle: 'long' });

/**
 * Interpret a class-defined `\maketitle` that sets its own title page, so the page can be shown
 * and edited as text. `fields` holds the source of `\title`, `\author` and the date setters; text
 * they print keeps its range in that source. Returns undefined when the definition uses TeX this
 * interpreter does not model; the caller then typesets the page.
 */
export function interpretLatexTitlePage(
  prefix: string,
  layout: LatexPageLayout,
  fields: ReadonlyMap<LatexTitleField, string>,
) {
  const macros = readLatexTextMacros(prefix);
  if (!latexCustomTitlePage(prefix, macros)) return;
  const points = latexBaseSize(prefix);
  const normalSize = layout.fontSize;
  const parskip = layout.paragraphSpacing;
  const parskipShrink = layout.paragraphShrink;
  const textHeight = layout.height - layout.top - layout.bottom;
  const normal: LatexTitleStyle = { size: normalSize, family: 'roman', bold: false, italic: false, smallCaps: false };
  const initialStretch = latexLineSpacing(prefix, points).stretch;
  let state: State = {
    style: normal,
    baseline: layout.leading,
    stretch: initialStretch,
    pendingStretch: initialStretch,
    align: 'justify',
  };
  const page: LatexTitleMaterial[] = [];
  const frames: Frame[] = [];
  let list = page;
  let lines: Piece[][] | undefined;
  let source = '\\maketitle';
  // Where each character came from: offset * 4 + field index, or -1 for class and macro code.
  let origin: number[] = Array.from(source, () => -1);
  let budget = 4096;

  const quad = () => state.style.size;
  const leading = () => state.baseline * state.stretch;
  /** The field behind printed source, and its source range when the text maps to it exactly. */
  const traced = (from: number, to: number): Pick<LatexTitleRun, 'field' | 'source'> => {
    const first = origin[from] ?? -1;
    if (first < 0) return {};
    const field = titleFields[first % 4]!;
    for (let index = from + 1; index < to; index++)
      if (origin[index] !== first + 4 * (index - from)) return { field };
    return { field, source: { from: first >> 2, to: (first >> 2) + to - from } };
  };
  /** TeX ends a paragraph by breaking it into lines with the parameters in force at its end. */
  const endParagraph = () => {
    if (!lines) return;
    const paragraph = lines;
    lines = undefined;
    for (const line of paragraph)
      list.push({ kind: 'line', align: state.align, leading: leading(), runs: mergeLine(line) });
  };
  const append = (piece: Piece) => {
    if (!lines) {
      // TeX adds \parskip before a paragraph unless it starts an internal vertical list.
      if (list.length) list.push({ kind: 'glue', size: parskip, order: 0, shrink: parskipShrink });
      lines = [[]];
    }
    lines.at(-1)!.push(piece);
  };
  const glue = (entry: Omit<Extract<LatexTitleMaterial, { kind: 'glue' }>, 'kind'>) => {
    endParagraph();
    list.push({ kind: 'glue', ...entry });
  };
  const open = (frame: Omit<Frame, 'state'> = {}) => frames.push({ state, ...frame });
  const close = (environment?: string) => {
    const frame = frames.pop();
    if (!frame || frame.environment !== environment) return false;
    if (frame.material) endParagraph();
    state = frame.state;
    if (frame.material) {
      list = frames.findLast((entry) => entry.material)?.material ?? page;
      list.push({
        kind: 'box',
        leading: leading(),
        ...(frame.height !== undefined && { height: frame.height }),
        material: frame.material,
      });
    }
    return true;
  };
  const splice = (from: number, to: number, replacement: string, origins = Array.from(replacement, () => -1)) => {
    source = source.slice(0, from) + replacement + source.slice(to);
    origin = [...origin.slice(0, from), ...origins, ...origin.slice(to)];
    return source.length <= 65536;
  };

  for (let position = 0; position < source.length;) {
    if (--budget < 0) return;
    const character = source[position]!;
    if (character === '%') {
      position = lineEnd(source, position) + 1;
      continue;
    }
    if (/\s/.test(character)) {
      const end = spaceEnd(source, position);
      // A blank line ends the paragraph. Other spaces print once, and only within a paragraph.
      if (/\n[ \t]*\n/.test(source.slice(position, end))) endParagraph();
      else if (lines) append({ text: ' ', style: state.style, space: true, ...traced(position, end) });
      position = end;
      continue;
    }
    if (character === '{') {
      open();
      position++;
      continue;
    }
    if (character === '}') {
      if (!close()) return;
      position++;
      continue;
    }
    if (character !== '\\') {
      const end = /[\\{}%$&#^_\s]/g;
      end.lastIndex = position;
      const next = end.exec(source)?.index ?? source.length;
      if (next === position) return;
      append({ text: printable(source.slice(position, next)), style: state.style, ...traced(position, next) });
      position = next;
      continue;
    }

    const end = commandEnd(source, position);
    const command = source.slice(position + 1, end);
    const after = /^[A-Za-z@]/.test(command) ? controlWordEnd(source, end) : end;
    const argument = (at = after) => groupAt(source, at);
    const field = titleFields.find((name) => command === '@' + name);
    const macro = macros.get(command);
    const selected = latexFontSize(command, normalSize);
    if (field) {
      const value = fields.get(field) ?? (field === 'date' ? '\\today' : '');
      const index = titleFields.indexOf(field);
      const printed = value.trim() ? value : '';
      // An empty field still prints a place to type its value.
      if (!printed) append({ text: '', style: state.style, field, source: { from: 0, to: value.length } });
      if (!splice(position, after, printed, Array.from(printed, (_, offset) => offset * 4 + index))) return;
    } else if (command === 'begin' || command === 'end') {
      const group = argument();
      if (!group) return;
      const name = source.slice(group.from, group.to).trim();
      const definition = macros.get(command === 'begin' ? name : 'end' + name);
      if (definition && (definition.count || definition.optional !== undefined)) return;
      const align = command === 'begin' && environments.get(name);
      if (align) endParagraph();
      if (command === 'begin') open({ environment: name });
      if (align) state = { ...state, align };
      // The environment's end code runs inside its group, before the group closes.
      const code = (definition?.replacement ?? '') + (command === 'end' ? '\\@close{' + name + '}' : '');
      if (!splice(position, group.end, code)) return;
    } else if (command === '@close') {
      const group = argument()!;
      const name = source.slice(group.from, group.to);
      if (environments.has(name)) endParagraph();
      if (!close(name)) return;
      position = group.end;
    } else if (macro) {
      if (macro.count || macro.optional !== undefined) return;
      if (!splice(position, after, macro.replacement)) return;
    } else if (selected) {
      state = {
        ...state,
        style: { ...state.style, size: selected.size },
        baseline: selected.leading,
        stretch: state.pendingStretch,
      };
      position = after;
    } else if (command === 'normalfont') {
      state = { ...state, style: { ...normal, size: state.style.size } };
      position = after;
    } else if (oldStyles.has(command)) {
      state = { ...state, style: { ...normal, size: state.style.size, ...oldStyles.get(command) } };
      position = after;
    } else if (series.has(command) || families.has(command)) {
      const family = families.get(command);
      state = { ...state, style: { ...state.style, ...series.get(command), ...(family && { family }) } };
      position = after;
    } else if (command === 'em') {
      state = { ...state, style: { ...state.style, italic: !state.style.italic } };
      position = after;
    } else if (textCommands.has(command)) {
      const group = argument();
      if (!group) return;
      const declaration = `{${textCommands.get(command)} `;
      const origins = [...Array.from(declaration, () => -1), ...origin.slice(group.from, group.to), -1];
      if (!splice(position, group.end, declaration + source.slice(group.from, group.to) + '}', origins)) return;
    } else if (alignments.has(command)) {
      state = { ...state, align: alignments.get(command)! };
      position = after;
    } else if (command === 'linespread') {
      const group = argument();
      const factor = group && Number(source.slice(group.from, group.to));
      if (!group || !factor || factor <= 0) return;
      state = { ...state, pendingStretch: factor };
      position = group.end;
    } else if (command === 'selectfont') {
      state = { ...state, stretch: state.pendingStretch };
      position = after;
    } else if (command === 'par') {
      endParagraph();
      position = after;
    } else if (command === '\\') {
      let next = source[after] === '*' ? after + 1 : after;
      const option = groupAt(source, skipSpaces(source, next), '[', ']');
      const extra = option ? dimension(source.slice(option.from, option.to), quad(), textHeight) : 0;
      if (extra === undefined) return;
      if (option) next = option.end;
      if (state.align === 'justify') {
        // Space below a forced line break is not modelled yet; the compiler sets those pages.
        if (option) return;
        lines?.push([]);
      } else if (lines) {
        // Under \centering and the ragged declarations, \\ ends the paragraph and cancels the
        // \parskip before the next one.
        glue({ size: extra - parskip, order: 0, shrink: -parskipShrink });
      }
      position = next;
    } else if (command === 'linebreak' || command === 'newline') {
      lines?.push([]);
      position = after;
    } else if (command === 'vskip' || command === 'kern') {
      const read = readGlue(source, after, quad(), textHeight);
      if (!read) return;
      // A horizontal kern has no vertical extent.
      if (command === 'vskip' || !lines) glue({ size: read.height, order: read.stretch, shrink: read.shrink });
      position = read.end;
    } else if (command === 'vspace') {
      // In a paragraph, \vspace adds space below the current line. That is not modelled yet.
      if (lines) return;
      const starred = source[after] === '*';
      const group = argument(skipSpaces(source, after + Number(starred)));
      if (!group) return;
      const value = source.slice(group.from, group.to).trim();
      const fill = value === '\\fill' || /^\\stretch\s*\{[^{}]*\}$/.test(value);
      const height = fill ? 0 : dimension(value, quad(), textHeight);
      if (height === undefined) return;
      glue({ size: height, order: fill ? 2 : 0 });
      position = group.end;
    } else if (namedSkips.has(command)) {
      glue({ size: namedSkips.get(command)! * texPoint, order: 0 });
      position = after;
    } else if (fills.has(command)) {
      glue({ size: 0, order: fills.get(command)!, ...(command === 'vss' && { vss: true }) });
      position = after;
    } else if (command === 'vbox') {
      if (lines) return;
      let next = skipSpaces(source, after);
      let height: number | undefined;
      if (source.startsWith('to', next)) {
        const read = readGlue(source, skipSpaces(source, next + 2), quad(), textHeight);
        if (!read || read.stretch) return;
        height = read.height;
        next = skipSpaces(source, read.end);
      }
      if (source[next] === '{') next++;
      else if (source.startsWith('\\bgroup', next)) next = controlWordEnd(source, next + 7);
      else return;
      list = [];
      open({ material: list, ...(height !== undefined && { height }) });
      position = next;
    } else if (command === 'bgroup' || command === 'begingroup') {
      open();
      position = after;
    } else if (command === 'egroup' || command === 'endgroup') {
      if (!close()) return;
      position = after;
    } else if (command === 'today') {
      append({ text: today.format(new Date()), style: state.style, ...traced(position, end) });
      position = after;
    } else if (ignored.has(command)) {
      position = after;
    } else if (ignoredWithArgument.has(command)) {
      let next = after;
      for (let index = 0; index < ignoredWithArgument.get(command)!; index++) {
        const group = argument(skipSpaces(source, next));
        if (!group) return;
        next = group.end;
      }
      position = next;
    } else if (symbols.has(command)) {
      const { field } = traced(position, end);
      append({ text: symbols.get(command)!, style: state.style, ...(field && { field }) });
      position = command === ' ' ? end : after;
    } else return;
  }
  endParagraph();
  if (frames.length) return;
  return latexTitleBox(page);
}

/** Drop the spaces TeX discards at line ends, then join text that edits as one piece. */
function mergeLine(pieces: readonly Piece[]) {
  let from = 0;
  let to = pieces.length;
  while (from < to && pieces[from]!.space) from++;
  while (to > from && pieces[to - 1]!.space) to--;
  const runs: LatexTitleRun[] = [];
  for (const { space: _, ...piece } of pieces.slice(from, to)) {
    const last = runs.at(-1);
    const contiguous = last?.source && piece.source ? last.source.to === piece.source.from : !last?.source && !piece.source && !piece.field;
    if (!last || !contiguous || last.field !== piece.field || !sameStyle(last.style, piece.style)) {
      runs.push(piece);
      continue;
    }
    runs[runs.length - 1] = {
      ...last,
      text: last.text + piece.text,
      ...(last.source && piece.source && { source: { from: last.source.from, to: piece.source.to } }),
    };
  }
  return runs;
}

function sameStyle(left: LatexTitleStyle, right: LatexTitleStyle) {
  return (
    left.size === right.size &&
    left.family === right.family &&
    left.bold === right.bold &&
    left.italic === right.italic &&
    left.smallCaps === right.smallCaps
  );
}
