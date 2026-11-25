export { latexBodySpacing } from './latex-body-spacing';
import { latexAlignedParagraph } from './latex-alignment';
import { authoredLatexStyleOrder, isLatexStyleMark, latexInlineFormat, latexInlineSize } from './latex-inline-format';
export { latexFontSizes, latexFontSizePointSizes, latexFontSizeProperties, latexLinkUrl, type LatexFontSize } from './latex-inline-format';
import { latexContentsLineAt } from './latex-contents-line';
export { latexContentsLineStyle } from './latex-contents-line';
export { readLatexHyperref } from './latex-links';
import { latexBlockDeclaration, latexMinipageWidth, latexTextEnvironments } from './latex-text-layout';
export { latexBlockDeclaration, latexMinipageArgument, latexMinipageWidth, isLatexTitlePage } from './latex-text-layout';
export { latexMathMacros, interpretLatexParagraphMacro, interpretLatexText, interpretLatexTextFragment, readLatexTextMacros, type LatexPrintedText } from './latex-macros';
import { latexDeclarations, latexTikzFragment, latexVerticalSpace } from './latex-presentation';
export { latexDeclarations, latexFontSize, latexVerticalSpace, latexSectionPresentation, latexPresentationColour, latexRunningFields, latexRunningStyles, latexTikzFragment, latexColumnAliasWidths } from './latex-presentation';
export { readLatexColours } from './latex-colour';
export { latexPageMarks } from './latex-running-marks';
import { plainLatexItemLabel, readLatexEnumitem } from './latex-list';
import { readLatexContentsEntry, readLatexListSequence, readLatexStateMacro } from './latex-state-command';
export { latexCustomTitlePage, readLatexContentsEntry, readLatexListSequence, readLatexStateMacro } from './latex-state-command';
export { interpretLatexTitlePage } from './latex-title-page';
export type { LatexTitleItem, LatexTitleRun, LatexTitleStyle } from './latex-title-page';
import { readLatexTitledEnvironments } from './latex-titled-environments';
export { readLatexTitledEnvironments } from './latex-titled-environments';
import { readLatexTitleSetter } from './latex-metadata';
import { readLatexBookMatter, readLatexClass, readLatexPageDirective } from './latex-flow';
import { latexColourDefinition, readLatexColours } from './latex-colour';
import { readLatexTheorems, latexBoxTitle, latexEnvironmentName } from './latex-environments';
import { latexLetterCommandAt } from './latex-letter';
export { latexColourDefinition } from './latex-colour';
export type { LatexLetterPart } from './latex-letter';
import { usesLatexPackage } from './latex-preamble';
export { withLatexPackage } from './latex-preamble';
import { latexFormattingAlias, readLatexParagraphMacro, readLatexTextMacros } from './latex-macros';
import { Fragment, type Mark, type Node } from 'prosemirror-model';
import { Transform } from 'prosemirror-transform';
import { updateLatexBoundary, updateLatexNodeSource } from './latex-boundary-step';
import { LatexProjectFileStep, updateLatexProjectFile } from './latex-project-step';
export { updateLatexBoundary, updateLatexNodeSource } from './latex-boundary-step';
import { noteSchema as schema } from './index';
import {
  latexEffectivePrefix, latexProjectFile, readLatexInclude, resolveLatexProjectPrefix, type LatexProject,
} from './latex-project';
export { updateLatexProjectFile } from './latex-project-step';
export { isLatexProjectPath, latexEffectivePrefix, latexProjectEntry, resolveLatexProjectPath } from './latex-project';
import {
  argumentAt,
  commandEnd,
  documentBody,
  environmentAt,
  groupAt,
  latexCommands,
  latexUrlArgument,
  lineEnd,
  mathEnd,
  verbatimEnd,
  whitespaceEnd,
} from './latex-syntax';

export { readLatexPackages } from './latex-preamble';
export { latexDocumentFont, latexDocumentFonts, setLatexDocumentFont, type LatexDocumentFont, type LatexDocumentFontId } from './latex-document-fonts';
export { withoutLatexPackage } from './latex-preamble';
export { latexDocumentClassName, setLatexDocumentClass, latexLineSpacing, setLatexLineSpacing, latexRomanFamily, setLatexRomanFamily } from './latex-format';
export { isLatexHeading } from './latex-spec';
export { latexEnvironmentName, latexEnvironmentOption } from './latex-environments';
export { latexItemLabel, latexListOptions, withLatexItemLabel } from './latex-list';
export { composeLatexParagraph, latexInterwordGlue, type LatexLine, type LatexTextMetrics } from './latex-lines';
export { latexInlineFlow, latexInlineRule, latexLineBreakSkip, latexParagraphText, type LatexParagraphSegment } from './latex-paragraph';
export { latexRomanGlue, measureLatexRoman, type LatexRomanFont } from './latex-font-metrics';
export { layoutLatexDrawing, readLatexDrawing } from './latex-drawings';
export { readLatexCodeBlock } from './latex-code';
export { readLatexAlgorithm } from './latex-algorithm';
export { latexLength } from './latex-lengths';
export { latexColumnLength, latexTableGrid } from './latex-table-grid';
export { latexHorizontalRule, latexNaturalColumns, latexNaturalTableWidths } from './latex-tables';
export { hyphenateLatexEnglish } from './latex-hyphenation';
export { latexBeamerLayout, readLatexBeamerFrame } from './latex-beamer';
export { layoutLatexTikzStateDiagram, readLatexTikzStateDiagram } from './latex-tikz';
export type { LatexTypography } from './latex-typography';
export { latexLandscapeLayout, latexMarginSettings, latexPageLayout, latexPaperSettings, latexSheetLayout, paginateLatex, setLatexGeometry } from './latex-layout';
export { paginateLatexRegions, type LatexRegionBlock } from './latex-page-regions';
export { latexMarginSides, type LatexMargins } from './latex-geometry';
export type { LatexPageLayout, PageBlock, PageBreak, PageLine } from './latex-layout';
export { latexBreakCommand, latexFlow, latexPageLabel, latexPageNumbers, readLatexPageDirective, readLatexBookMatter, readLatexClass } from './latex-flow';
export { decodeLatexRunningText, latexPageFurniture, readLatexPageStyle, setLatexPageStyle, type LatexPageStyle, type LatexPageNumberPosition } from './latex-page-style';
export { latexPageNumberFormats } from './latex-flow';
export { readLatexPageNumberSection, setLatexPageNumberSection, setLatexBookMatter, type LatexBookMatter, type LatexPageNumberSection } from './latex-page-authoring';
export { latexContentsEntries, readLatexHeadingMode, setLatexHeadingMode, readLatexBibliographyContents, setLatexBibliographyContents, type LatexHeadingMode } from './latex-contents';
export type { LatexBlockFlow, LatexBreak, LatexPageNumber, LatexPageNumberFormat } from './latex-flow';
export {
  latexAuthorGroups,
  latexFieldSource,
  latexFieldText,
  latexPreambleCommand,
  latexTitleArguments,
  readLatexTitleSetter,
  type LatexTitleField,
  setLatexPreambleCommand,
} from './latex-metadata';
export type { LatexCommandArgument } from './latex-metadata';
export { latexEquationRows, latexNumbering } from './latex-numbering';
export {
  bibEntryName,
  latexBibliographyDatabases,
  latexBibliographyFiles,
  readLatexBibliography,
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
  readLatexSubfigures,
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
  '\\documentclass{article}\n\\usepackage{amsmath}\n\\usepackage[a4paper,margin=1in]{geometry}\n\n\\setlength{\\parindent}{0pt}\n\\setlength{\\parskip}{0.5\\baselineskip plus 2pt}\n\n\\begin{document}\n\n\\end{document}\n';
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
const textEnvironments = new Set(['quote', 'quotation', 'abstract', 'landscape']);
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
  ['\\textquotedblleft{}', '“'],
  ['\\textquotedblright{}', '”'],
  ['~', '\u00a0'],
]);
const textLiterals = [
  // The browser's DOM parser normalizes carriage returns even when it preserves newlines.
  ['\r\n', ' '],
  ['\r', ' '],
  // Computer Modern interprets these spellings as single glyphs.
  ['---', '—'],
  ['--', '–'],
  ['``', '“'],
  ["''", '”'],
  ['`', '‘'],
  ["'", '’'],
] as const;

const escapeText = new Map([...escaped].map(([source, value]) => [value, source]));

export function isLatex(document: Node) {
  return document.attrs.format === 'latex';
}

function inline(
  source: string,
  context: SourceContext,
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
    const literal =
      character === '\r' || character === '-' || character === '`' || character === "'"
        ? textLiterals.find(([input]) => source.startsWith(input, position))
        : undefined;
    if (literal) {
      flush(position);
      nodes.push(schema.nodes.latex_inline!.create({ source: literal[0], label: literal[1] }, null, marks));
      plain = position + literal[0].length;
      position = plain - 1;
      continue;
    }
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
      const argument = latexInlineFormat(
        source, position, end, command, context.colours,
        latexFormattingAlias(command.slice(1), context.macros),
      );
      if (argument && argument.from < argument.to) {
        const { style, colour, href, size } = argument;
        const formatting = schema.marks[style === 'link' ? 'latex_link' : 'latex_style']!.create({
          style, colour, href, size,
          order: order.next++,
          open: source.slice(position, argument.from),
          close: '}',
        });
        const content = source.slice(argument.from, argument.to);
        if (argument.url) {
          nodes.push(schema.nodes.latex_inline!.create({ source: content, label: href, urlArgument: true }, null, [...marks, formatting]));
        } else {
          inline(content, context, depth + 1, [...marks, formatting], order)
            .forEach((child) => nodes.push(child));
        }
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
        if (command === '\\quad' || command === '\\qquad') end = whitespaceEnd(source, end);
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
  '\\frontmatter',
  '\\mainmatter',
  '\\backmatter',
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
    const argument = whitespaceEnd(source, start + name.length);
    const group = name === '\\printbibliography'
      ? groupAt(source, argument, '[', ']')
      : groupAt(source, argument);
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

function declarationScope(source: string, position: number) {
  if (source[position] !== '{' || source.slice(source.lastIndexOf('\n', position - 1) + 1, position).trim())
    return;
  if (latexInlineSize(source, position)) return;
  const bodyStart = latexDeclarations(source, position + 1).end;
  if (bodyStart === position + 1) return;
  const scope = groupAt(source, position);
  if (!scope || bodyStart >= scope.to) return;
  const afterGroup = source.slice(scope.end);
  const paragraphEnd = /^[^\S\r\n]*\\par(?![A-Za-z@])/.exec(afterGroup);
  const end = scope.end + (paragraphEnd?.[0].length ?? 0);
  const following = source.slice(end);
  if (!/^[^\S\r\n]*(?:\r?\n|$)/.test(following)) return;
  if (paragraphEnd || /^\s*$|^[^\S\r\n]*\r?\n[^\S\r\n]*\r?\n/.test(following) ||
      /\\par\s*$/.test(source.slice(bodyStart, scope.to)))
    return { scope, bodyStart, end };
}

function blockStart(source: string, position: number, context: SourceContext) {
  if (source.startsWith('$$', position) || source.startsWith('\\[', position)) return true;
  if (source[position] === '{') return !!(latexAlignedParagraph(source, position) ?? declarationScope(source, position));
  if (source[position] !== '\\') return false;
  const command = source.slice(position, commandEnd(source, position));
  const space = latexVerticalSpace(source, position);
  // At a paragraph's end the adjustment ships after its final line. Preserve it as a separate
  // vertical block without changing the authored whitespace or breaking mid-paragraph prose.
  if (space && /^(?:\s*$|[^\S\r\n]*\r?\n[^\S\r\n]*\r?\n)/.test(source.slice(space.end))) return true;
  return (
    command === '\\begin' ||
    !!readLatexTitleSetter(source, position) ||
    !!readLatexContentsEntry(source, position) ||
    !!readLatexStateMacro(source, context.macros, position) ||
    !!readLatexListSequence(source, context.macros, position) ||
    (!!context.include && !!readLatexInclude(source, position)) ||
    !!readLatexParagraphMacro(source, context.macros, position) ||
    !!latexContentsLineAt(source, context.macros, position) ||
    blockCommands.has(command) ||
    bibliographyCommands.has(command) ||
    headingLevel(command.slice(1)) > 0 ||
    (context.letter && !!latexLetterCommandAt(source, position)) ||
    (command === '\\definecolor' && !!latexColourDefinition(source, position))
  );
}

function paragraphEnd(source: string, position: number, context: SourceContext) {
  const blank = /\r?\n[^\S\r\n]*\r?\n/y;
  const unmatched = new Set<string>();
  for (let next = position; next < source.length; next++) {
    blank.lastIndex = next;
    if (blank.test(source)) return next;
    if (next > position && blockStart(source, next, context)) return next;
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
      const command = source.slice(next, end);
      const url = (command === '\\url' || command === '\\href') && latexUrlArgument(source, end);
      next = (command === '\\verb' ? verbatimEnd(source, end) : url ? url.end : end) - 1;
    } else if (character === '{') next = (groupAt(source, next)?.end ?? source.length) - 1;
  }
  return source.length;
}

type SourceContext = {
  macros: ReturnType<typeof readLatexTextMacros>;
  enumitem: boolean;
  letter: boolean;
  colours: ReturnType<typeof readLatexColours>;
  theorems: ReturnType<typeof readLatexTheorems>;
  titled: ReturnType<typeof readLatexTitledEnvironments>;
  proof: boolean;
  boxes: boolean;
  include?: (name: string, depth: number) => { path: string; nodes: Node[]; tail: string } | undefined;
};

function sourceContext(prefix: string): SourceContext {
  const macros = readLatexTextMacros(prefix);
  return { macros, titled: readLatexTitledEnvironments(prefix, macros), enumitem: usesLatexPackage(prefix, 'enumitem'), letter: readLatexClass(prefix).name === 'letter', colours: readLatexColours(prefix), theorems: readLatexTheorems(prefix),
    proof: usesLatexPackage(prefix, 'amsthm'), boxes: usesLatexPackage(prefix, 'tcolorbox') };
}

function listItems(source: string, context: SourceContext, depth: number, description = false): { items: Node[]; tail: string } | undefined {
  let position = whitespaceEnd(source, 0);
  let before = source.slice(0, position);
  const items: Node[] = [];
  let tail = '';
  while (position < source.length) {
    const command = commandEnd(source, position);
    if (source.slice(position, command) !== '\\item') return;
    const optionStart = whitespaceEnd(source, command);
    const option = groupAt(source, optionStart, '[', ']');
    if (option && !description && !plainLatexItemLabel(source.slice(option.from, option.to))) return;
    const start = whitespaceEnd(source, option?.end ?? command);
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
    const content = blocks(source.slice(start, next), context, depth + 1);
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

function environmentBlock(source: string, position: number, before: string, context: SourceContext, depth: number) {
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
  const description = name === 'description';
  if ((name === 'itemize' || name === 'enumerate' || description) && depth < 64) {
    const option = context.enumitem && groupAt(source, whitespaceEnd(source, from), '[', ']');
    const settings = option ? source.slice(option.from, option.to) : '';
    const spec = option && !description && readLatexEnumitem(settings);
    const valid = !option || (option.end <= to && (
      description ? /^style\s*=\s*nextline$/.test(settings.trim()) :
        spec && (name === 'enumerate' || (!spec.label && spec.start === undefined))
    ));
    const bodyStart = option ? option.end : from;
    const list = valid && listItems(source.slice(bodyStart, to), { ...context, colours: new Map(context.colours) }, depth, description);
    if (list) return {
      node: schema.nodes[name === 'enumerate' ? 'ordered_list' : 'bullet_list']!.create(
        { before, open: source.slice(position, bodyStart), close: list.tail + close, ...(spec && spec.start !== undefined ? {order: spec.start} : {}) },
        list.items,
      ),
      end,
    };
  }
  if (context.letter && name === 'letter' && depth < 64) {
    const recipient = groupAt(source, whitespaceEnd(source, from));
    if (recipient && recipient.end <= to) {
      const body = blocks(source.slice(recipient.end, to), { ...context, colours: new Map(context.colours) }, depth + 1);
      if (!body.nodes.length) body.nodes.push(schema.nodes.paragraph!.create({ before: '' }));
      return {
        node: schema.nodes.latex_container!.create({
          before, open: source.slice(position, recipient.end), close: body.tail + close,
        }, body.nodes),
        end,
      };
    }
  }
  const theorem = context.theorems.has(name) || (context.proof && name === 'proof');
  const box = context.boxes && name === 'tcolorbox';
  if ((theorem || box) && depth < 64) {
    const option = groupAt(source, whitespaceEnd(source, from), '[', ']');
    const bodyStart = option?.end ?? from;
    const opener = source.slice(position, bodyStart);
    if (bodyStart <= to && (!box || !option || latexBoxTitle(opener) !== undefined)) {
      const body = blocks(source.slice(bodyStart, to), { ...context, colours: new Map(context.colours) }, depth + 1);
      if (!body.nodes.length) body.nodes.push(schema.nodes.paragraph!.create({ before: '' }));
      return {
        node: schema.nodes.latex_container!.create({ before, open: opener, close: body.tail + close }, body.nodes),
        end,
      };
    }
  }
  if (latexTextEnvironments.has(name) && depth < 64 &&
      (name !== 'center' || !latexTikzFragment(source.slice(position, end)))) {
    const width = name === 'minipage' && groupAt(source, whitespaceEnd(source, from));
    const bodyStart = width ? latexDeclarations(source, width.end).end : from;
    if (name !== 'minipage' || (width && bodyStart <= to && latexMinipageWidth(source.slice(position, bodyStart), 1, 1) !== undefined)) {
      const body = blocks(source.slice(bodyStart, to), { ...context, colours: new Map(context.colours) }, depth + 1);
      if (!body.nodes.length) body.nodes.push(schema.nodes.paragraph!.create({ before: '' }));
      return {
        node: schema.nodes.latex_container!.create({
          before, open: source.slice(position, bodyStart), close: body.tail + close,
        }, body.nodes),
        end,
      };
    }
  }
  // Text environments edit as native blocks. The open and close source keep the environment, and
  // an empty one, such as a new abstract, gets an empty paragraph to type into.
  if ((textEnvironments.has(name) || context.titled.has(name)) && depth < 64) {
    const quote = blocks(content, { ...context, colours: new Map(context.colours) }, depth + 1);
    if (!quote.nodes.length) quote.nodes.push(schema.nodes.paragraph!.create({ before: '' }));
    return {
      node: schema.nodes[name === 'landscape' ? 'latex_landscape' : 'blockquote']!.create(
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

function blocks(source: string, context: SourceContext, depth = 0): { nodes: Node[]; tail: string } {
  const nodes: Node[] = [];
  let position = 0;
  while (position < source.length) {
    const start = whitespaceEnd(source, position);
    const before = source.slice(position, start);
    if (start === source.length) return { nodes, tail: before };
    const contents = source[start] === '\\' && latexContentsLineAt(source, context.macros, start);
    if (contents) {
      const { title, folio } = contents;
      nodes.push(schema.nodes.latex_contents_line!.create({
        before, open: source.slice(start, title.from), close: source.slice(folio.to, folio.end),
      }, [
        schema.nodes.paragraph!.create({ before: '' }, inline(source.slice(title.from, title.to), context)),
        schema.nodes.paragraph!.create({ before: source.slice(title.to, folio.from) }, inline(source.slice(folio.from, folio.to), context)),
      ]));
      position = folio.end;
      continue;
    }
    const directive = readLatexPageDirective(source, start);
    const titleSetter = readLatexTitleSetter(source, start);
    const state = readLatexContentsEntry(source, start) ?? readLatexStateMacro(source, context.macros, start) ?? readLatexListSequence(source, context.macros, start);
    if (directive || titleSetter || state || source[start] === '%') {
      const end = directive?.end ?? titleSetter?.argument.end ?? state?.end ?? lineEnd(source, start);
      nodes.push(schema.nodes.latex_raw!.create({ before, source: source.slice(start, end) }));
      position = end;
      continue;
    }
    const spacing = latexVerticalSpace(source, start);
    const declaration = latexBlockDeclaration(source, start);
    if (spacing || declaration) {
      const end = spacing?.end ?? declaration!.end;
      nodes.push(schema.nodes.latex_raw!.create({ before, source: source.slice(start, end) }));
      position = end;
      continue;
    }
    const aligned = latexAlignedParagraph(source, start);
    if (aligned) {
      nodes.push(schema.nodes.paragraph!.create({
        before,
        latexAlignment: aligned.alignment,
        open: source.slice(start, aligned.from),
        close: source.slice(aligned.to, aligned.end),
      }, inline(source.slice(aligned.from, aligned.to), context)));
      position = aligned.end;
      continue;
    }
    const group = depth < 64 && declarationScope(source, start);
    if (group) {
      const { scope, bodyStart, end } = group;
      const body = source.slice(bodyStart, scope.to);
      const paragraph = /\\par\s*$/.exec(body);
      const content = blocks(paragraph ? body.slice(0, paragraph.index) : body, {
        ...context, colours: new Map(context.colours),
      }, depth + 1);
      if (content.nodes.length) {
        nodes.push(schema.nodes.latex_container!.create({
          before, open: source.slice(start, bodyStart),
          close: content.tail + (paragraph?.[0] ?? '') + source.slice(scope.to, end),
        }, content.nodes));
        position = end;
        continue;
      }
    }
    const command = source.slice(start, commandEnd(source, start));
    if (blockCommands.has(command)) {
      nodes.push(schema.nodes.latex_raw!.create({ before, source: command }));
      position = start + command.length;
      continue;
    }
    if (context.include) {
      const call = readLatexInclude(source, start);
      if (call) {
        const fragment = context.include(call.name, depth);
        nodes.push(fragment
          ? schema.nodes.latex_include!.create({
              before, open: source.slice(start, call.end), close: fragment.tail, path: fragment.path,
            }, fragment.nodes)
          : schema.nodes.latex_raw!.create({ before, source: source.slice(start, call.end) }));
        position = call.end;
        continue;
      }
    }
    const macro = readLatexParagraphMacro(source, context.macros, start);
    if (macro) {
      nodes.push(schema.nodes.latex_raw!.create({ before, source: source.slice(start, macro.end) }));
      position = macro.end;
      continue;
    }
    const colour = command === '\\definecolor' && latexColourDefinition(source, start);
    if (colour) {
      context.colours.set(colour.name, colour.colour);
      nodes.push(schema.nodes.latex_raw!.create({ before, source: source.slice(start, colour.end) }));
      position = colour.end;
      continue;
    }
    const letterCommand = context.letter && latexLetterCommandAt(source, start);
    if (letterCommand) {
      nodes.push(schema.nodes.latex_raw!.create({ before, source: source.slice(start, letterCommand.end) }));
      position = letterCommand.end;
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
        schema.nodes.latex_heading!.create(
          {
            level: heading.level,
            before,
            open: source.slice(start, heading.from),
            close: '}',
          },
          inline(source.slice(heading.from, heading.to), context),
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
      source[start] === '\\' ? environmentBlock(source, start, before, context, depth) : undefined;
    if (environment) {
      nodes.push(environment.node);
      position = environment.end;
      continue;
    }
    const end = paragraphEnd(source, start, context);
    const content = source.slice(start, end).trimEnd();
    nodes.push(schema.nodes.paragraph!.create({ before }, inline(content, context)));
    position = start + content.length;
  }
  return { nodes, tail: '' };
}

/** Parse common constructs structurally and retain unsupported TeX as inert, verbatim nodes. */
export function parseLatex(source: string): Node {
  const body = documentBody(source);
  const prefix = body ? source.slice(0, body.from) : '';
  return parseDocument(source, body, prefix, sourceContext(prefix));
}

function parseDocument(
  source: string, body: ReturnType<typeof documentBody>, prefix: string, context: SourceContext,
) {
  const { nodes, tail } = blocks(body ? source.slice(body.from, body.to) : source, context);
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

/** Load literal included files as editable nodes in the same Notes document. */
export function parseLatexProject(entry: string, files: ReadonlyMap<string, string>) {
  const source = files.get(entry);
  if (source === undefined) throw new RangeError('The main LaTeX file is missing.');
  const body = documentBody(source);
  const prefix = body ? source.slice(0, body.from) : '';
  const used = new Set([entry]);
  const context = projectSourceContext(prefix, entry, files, entry, used);
  const parsed = parseDocument(source, body, prefix, context);
  const latexProject: LatexProject = {
    entry,
    files: Object.fromEntries([...files].filter(([path]) => !used.has(path))),
  };
  return parsed.type.create({ ...parsed.attrs, latexProject }, parsed.content);
}

function projectSourceContext(
  prefix: string, entry: string, files: ReadonlyMap<string, string>, initialFile: string,
  used = new Set<string>(), onCycle?: (path: string) => void,
) {
  const context = sourceContext(resolveLatexProjectPrefix(prefix, entry, files));
  const ancestors = new Set([entry, initialFile]);
  let from = initialFile;
  context.include = (name, depth) => {
    const path = latexProjectFile(files, entry, from, name, '.tex');
    if (!path || depth >= 64) return;
    if (ancestors.has(path)) {
      onCycle?.(path);
      return;
    }
    const text = files.get(path)!;
    if (documentBody(text)) return;
    used.add(path);
    ancestors.add(path);
    const parent = from;
    from = path;
    const parsed = blocks(text, context, depth + 1);
    from = parent;
    ancestors.delete(path);
    if (!parsed.nodes.length) parsed.nodes.push(schema.nodes.paragraph!.create({ before: '' }));
    return { path, ...parsed };
  };
  return context;
}

/** Read a literal include using the project's current files and the containing file. */
function projectInclude(
  document: Node, project: NonNullable<ReturnType<typeof serializeLatexProject>>,
  call: string, position: number, before: string | null,
) {
  const reference = readLatexInclude(call, 0);
  if (!reference || reference.end !== call.length) return;
  const { entry, files } = project;
  const $position = document.resolve(position);
  const ancestors = new Set<string>();
  let from = entry;
  for (let depth = 1; depth <= $position.depth; depth++) {
    const node = $position.node(depth);
    if (node.type.name === 'latex_include') {
      from = node.attrs.path;
      ancestors.add(from);
    }
  }
  let recursive = false;
  const context = projectSourceContext(
    document.attrs.prefix, entry, files, from, new Set(), path => {
      if (ancestors.has(path)) recursive = true;
    },
  );
  const fragment = context.include?.(reference.name, 0);
  if (!fragment || recursive || ancestors.has(fragment.path)) return;
  const include = schema.nodes.latex_include!.create({
    before, open: call, close: fragment.tail, path: fragment.path,
  }, fragment.nodes);
  include.descendants(node => {
    if (node.type.name === 'latex_include' && ancestors.has(node.attrs.path)) recursive = true;
    return !recursive && !node.isTextblock;
  });
  if (!recursive) return include;
}

/** Create an editable reference to a project file at a document position. */
export function createLatexInclude(document: Node, name: string, position: number) {
  const project = serializeLatexProject(document);
  if (project) return projectInclude(document, project, '\\input{' + name + '}', position, null);
}

export function escapedLatexText(text: string) {
  return text.replace(/[\\%${}#&_\^~\u00a0]/g, (value) => escapeText.get(value) ?? value);
}

function isLatexUrlMark(mark: Mark) {
  return /^\\url\b/.test(mark.attrs.open ?? '');
}

function isLatexUlemMark(mark: Mark) {
  return /^\\(?:uline|sout|bgroup\\markoverwith)\b/.test(mark.attrs.open ?? '');
}

function latexMarkOrder(mark: Mark) {
  const order: number = mark.attrs.order ?? 100;
  // Keep authored ulem wrappers inside font and colour scopes so their text can wrap.
  return order === authoredLatexStyleOrder && isLatexUlemMark(mark) ? order + 1 : order;
}

function inlineSource(node: Node, record?: (position: number, offset: number) => void) {
  let result = '';
  let active: readonly Mark[] = [];
  function write(content: string, next: readonly Mark[], position?: number, text = false) {
    let keep = 0;
    while (keep < active.length && keep < next.length && active[keep]!.eq(next[keep]!)) keep++;
    for (let index = active.length - 1; index >= keep; index--)
      result += active[index]!.attrs.close ?? '}';
    for (const mark of next.slice(keep))
      result += mark.attrs.open ?? (mark.type.name === 'strong' ? '\\textbf{' : '\\emph{');
    active = next;
    const inner = active.at(-1);
    // A size command that relied on the next token to delimit it may need an explicit
    // delimiter when an edit replaces that token with ordinary text.
    if (inner?.attrs.style === 'size' && result.endsWith(inner.attrs.open) &&
        ((/[A-Za-z]$/.test(inner.attrs.open) && /^[A-Za-z@]/.test(content)) ||
         (!inner.attrs.open.endsWith('{}') && /^\s/.test(content)))) result += '{}';
    if (position !== undefined) record?.(position, result.length);
    if (text && record && position !== undefined) {
      for (let index = 0; index < content.length; index++) {
        const char = content[index]!;
        result += escapeText.get(char) ?? char;
        record(position + index + 1, result.length);
      }
    } else {
      result += text ? escapedLatexText(content) : content;
    }
  }
  node.forEach((child, position) => {
    const next = child.marks.filter(mark =>
      mark.type.name === 'strong' || mark.type.name === 'em' || isLatexStyleMark(mark),
    );
    next.sort((a, b) => latexMarkOrder(a) - latexMarkOrder(b));
    if (child.isText) {
      const text = child.text!;
      const decorators = next.filter(isLatexUlemMark);
      if (decorators.length > 1 && decorators.some(mark => mark.attrs.order === authoredLatexStyleOrder)) {
        // ulem boxes a nested decoration. Keep interword glue outside those boxes.
        const outer = next.filter(mark => mark === decorators[0] || !isLatexUlemMark(mark));
        let at = position;
        for (const chunk of text.split(/( +)/).filter(Boolean)) {
          write(chunk, chunk.startsWith(' ') ? outer : next, at, true);
          at += chunk.length;
        }
      } else {
        write(text, next, position, true);
      }
      return;
    }
    if (child.attrs.urlArgument && !next.some(isLatexUrlMark)) write(escapedLatexText(child.attrs.label), next, position);
    else if (child.type.name === 'latex_math') write(mathSource(child), next, position);
    else if (child.type.name === 'hard_break') write('\\\\\n', next, position);
    else write(child.attrs.source ?? child.textContent, next, position);
    record?.(position + child.nodeSize, result.length);
  });
  write('', []);
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
    case 'latex_include':
      result = open;
      break;
    case 'latex_raw':
      result = node.attrs.source;
      break;
    case 'latex_display_math':
      result = mathSource(node);
      break;
    case 'heading':
    case 'latex_heading': {
      const command = latexHeadings[node.attrs.level - 1] ?? latexHeadings[0];
      result = (open ?? '\\' + command + '{') + inlineSource(node) + (close ?? '}');
      break;
    }
    case 'paragraph': {
      const last = node.lastChild;
      const comment = last?.type.name === 'latex_inline' && String(last.attrs.source).startsWith('%');
      const endComment = close && comment && !String(last.attrs.source).endsWith('\n') ? '\n' : '';
      result = (open ?? '') + inlineSource(node) + endComment + (close ?? '');
      break;
    }
    case 'latex_contents_line':
      result = (open ?? '') + childrenSource(node) + (close ?? '');
      break;
    case 'bullet_list':
    case 'ordered_list':
    case 'latex_landscape':
    case 'latex_container':
    case 'blockquote': {
      const environment =
        node.type.name === 'bullet_list'
          ? 'itemize'
          : node.type.name === 'ordered_list'
            ? 'enumerate'
            : node.type.name === 'latex_landscape' ? 'landscape' : 'quote';
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

function flattenSelectedIncludes(content: Fragment): Fragment {
  const nodes: Node[] = [];
  content.forEach((node) => {
    if (node.isLeaf || node.isTextblock) nodes.push(node);
    else {
      const children = flattenSelectedIncludes(node.content);
      if (node.type.name !== 'latex_include') nodes.push(node.copy(children));
      else children.forEach((child, _offset, index) => {
        nodes.push(index === 0
          ? child.type.create({ ...child.attrs, before: (node.attrs.before ?? '') + (child.attrs.before ?? '') }, child.content, child.marks)
          : child);
      });
    }
  });
  return Fragment.fromArray(nodes);
}

/** Replace an include instance with independent copies of its expanded blocks. */
export function detachLatexInclude(transform: Transform, position: number) {
  const node = transform.doc.nodeAt(position);
  if (node?.type.name !== 'latex_include') return;
  const $position = transform.doc.resolve(position);
  const index = $position.index();
  const before = node.attrs.before ?? (index ? '\n\n' : '');
  const copy = flattenSelectedIncludes(Fragment.from(node.type.create({
    ...node.attrs, before,
  }, node.content)));
  if (!$position.parent.canReplace(index, index + 1, copy)) return;
  transform.replaceWith(position, position + node.nodeSize, copy);
  const end = position + copy.size;
  const next = transform.doc.resolve(end).nodeAfter;
  if (next?.type.name === 'paragraph') {
    const separator = (node.attrs.close ?? '') + (next.attrs.before ?? '\n\n');
    transform.setNodeAttribute(end, 'before', /\n[^\S\n]*\n/.test(separator) ? separator : '\n\n');
  }
}

/** Serialize a selection using the same spelling and marks as the authored document. */
export function serializeLatexSelection(document: Node, from: number, to: number) {
  const { content } = document.slice(from, to);
  if (content.firstChild?.isInline)
    return inlineSource(schema.nodes.paragraph!.create(null, content));
  // A slice across list items needs its surrounding environment to compile on its own.
  const blocks = content.firstChild?.type.name === 'list_item'
    ? document.slice(from, to, true).content
    : content;
  const container = document.copy(flattenSelectedIncludes(blocks));
  const first = container.firstChild;
  const source = childrenSource(container);
  return first ? source.slice((first.attrs.before ?? '').length) : '';
}

/** Interpret a reusable body fragment in the destination document's preamble. */
export function parseLatexFragment(document: Node, source: string) {
  const { nodes } = blocks(source, sourceContext(latexEffectivePrefix(document)));
  return Fragment.fromArray(nodes.map((node, index) => {
    const terminalComment = index === nodes.length - 1 &&
      node.type.name === 'latex_raw' && String(node.attrs.source).startsWith('%');
    if (index > 0 && !terminalComment) return node;
    return node.type.create({
      ...node.attrs,
      ...(index === 0 ? { before: null } : {}),
      // A following document delimiter may start on the same line.
      ...(terminalComment ? { source: node.attrs.source + '\n' } : {}),
    }, node.content, node.marks);
  }));
}

/** Promote supported structures stored as opaque blocks by an older editor. */
export function materializeLatexStructures(document: Node): Transform {
  const transform = new Transform(document);
  const context = sourceContext(latexEffectivePrefix(document));
  let project: ReturnType<typeof serializeLatexProject>;
  document.descendants((node, position) => {
    if (node.type.name === 'latex_raw' && document.attrs.latexProject && readLatexInclude(node.attrs.source, 0)) {
      project ??= serializeLatexProject(document);
      const include = project && projectInclude(document, project, node.attrs.source, position, node.attrs.before);
      if (include) {
        const start = transform.mapping.map(position);
        transform.replaceWith(start, start + node.nodeSize, include);
        return false;
      }
    }
    const environment = node.type.name === 'latex_raw' ? latexEnvironmentName(node.attrs.source) : undefined;
    const raw = node.type.name === 'latex_raw' && (
      !!latexContentsLineAt(node.attrs.source, context.macros) || (!!environment && (
      ['landscape', 'itemize', 'enumerate', 'description'].includes(environment) ||
      (context.letter && environment === 'letter') || (context.boxes && environment === 'tcolorbox') ||
      (context.proof && environment === 'proof') || context.theorems.has(environment) || latexTextEnvironments.has(environment) || context.titled.has(environment)
    )));
    const minipage = node.type.name === 'latex_container' &&
      latexEnvironmentName(node.attrs.open) === 'minipage' &&
      node.firstChild?.firstChild?.type.name === 'latex_inline' &&
      latexDeclarations(String(node.firstChild.firstChild.attrs.source)).end > 0;
    const matter = node.type.name === 'paragraph' && node.children.some(child =>
      child.type.name === 'latex_inline' && readLatexBookMatter(child.attrs.source));
    const paragraphMacro = node.type.name === 'paragraph' && node.children.some(child =>
      child.type.name === 'latex_inline' && (
        readLatexParagraphMacro(child.attrs.source, context.macros) ||
        latexContentsLineAt(child.attrs.source, context.macros)
      ));
    const letter = context.letter && node.type.name === 'paragraph' && node.children.some(child =>
      child.type.name === 'latex_inline' && latexLetterCommandAt(child.attrs.source, 0));
    if (node.type.name === 'latex_raw' && typeof node.attrs.source === 'string') {
      const colour = latexColourDefinition(node.attrs.source);
      if (colour) context.colours.set(colour.name, colour.colour);
    }
    const styled = node.type.name === 'paragraph' && node.children.some(child =>
      child.type.name === 'latex_inline' && /^\\(?:definecolor|textcolor)\b/.test(child.attrs.source));
    const presentation = node.type.name === 'paragraph' && node.children.some(child =>
      child.type.name === 'latex_inline' && (
        !!latexVerticalSpace(child.attrs.source) || !!readLatexPageDirective(child.attrs.source) ||
        !!readLatexTitleSetter(child.attrs.source) || !!readLatexContentsEntry(child.attrs.source) ||
        !!readLatexStateMacro(child.attrs.source, context.macros) ||
        !!readLatexListSequence(child.attrs.source, context.macros) ||
        String(child.attrs.source).startsWith('%') || !!declarationScope(child.attrs.source, 0)
      ));
    if (!raw && !minipage && !matter && !letter && !styled && !paragraphMacro && !presentation) return;
    const source = blockSource(node);
    const parsed = blocks(source, context);
    if (!parsed.nodes.length || (raw && parsed.nodes.every(block => block.type.name === 'latex_raw'))) return;
    const reparsed = parsed.nodes.map(block => (block.attrs.before ?? '') + blockSource(block)).join('') + parsed.tail;
    if (reparsed !== source || parsed.tail) return;
    const first = parsed.nodes[0]!;
    if (parsed.nodes.length === 1 && first.type === node.type && first.content.eq(node.content)) return;
    parsed.nodes[0] = first.type.create({
      ...first.attrs,
      before: (node.attrs.before ?? '') + (first.attrs.before ?? ''),
    }, first.content);
    const start = transform.mapping.map(position);
    transform.replaceWith(start, start + node.nodeSize, parsed.nodes);
    return false;
  });
  return transform;
}

export function latexIncludeSource(node: Node) {
  return childrenSource(node) + (node.attrs.close ?? '');
}

/** The authored files in one Notes revision, each at its original relative path. */
export function serializeLatexProject(document: Node) {
  const project: LatexProject | null = document.attrs.latexProject ?? null;
  if (!project) return;
  const files = new Map(Object.entries(project.files));
  files.set(project.entry, serializeLatex(document));
  const written = new Set([project.entry]);
  document.descendants(node => {
    if (node.type.name === 'latex_include' && !written.has(node.attrs.path)) {
      written.add(node.attrs.path);
      files.set(node.attrs.path, latexIncludeSource(node));
    }
    return !node.isTextblock;
  });
  return { entry: project.entry, files };
}

/** Count literal references to a project file, including references outside the editable body. */
export function latexProjectFileUsage(document: Node) {
  const counts = new Map<string, number>();
  const project = serializeLatexProject(document);
  if (!project) return counts;
  const { entry, files } = project;

  // Count rendered instances first. A nested include can appear multiple times in Visual.
  document.descendants(node => {
    if (node.type.name === 'latex_include')
      counts.set(node.attrs.path, (counts.get(node.attrs.path) ?? 0) + 1);
    return !node.isTextblock;
  });

  // Also detect literal references in the preamble, unattached files and unsupported regions.
  const referenced = new Map<string, number>();
  for (const [from, source] of files) {
    if (!/\.(?:tex|sty|cls)$/i.test(from)) continue;
    for (const command of latexCommands(source, { nested: true })) {
      if (command.name !== 'input' && command.name !== 'include') continue;
      const include = readLatexInclude(source, command.start);
      const path = include && latexProjectFile(files, entry, from, include.name, '.tex');
      if (path) referenced.set(path, (referenced.get(path) ?? 0) + 1);
    }
  }
  for (const [path, count] of referenced)
    counts.set(path, Math.max(count, counts.get(path) ?? 0));
  return counts;
}

function removedLatexIncludes(before: Node, after: Node) {
  const from = before.content.findDiffStart(after.content);
  const to = before.content.findDiffEnd(after.content)?.a;
  if (from === null || to === undefined || from >= to) return [];
  const candidates: Node[] = [];
  before.nodesBetween(from, to, (node, position) => {
    if (node.type.name === 'latex_include' && position >= from && position + node.nodeSize <= to)
      candidates.push(node);
    return !node.isTextblock;
  });
  if (!candidates.length) return candidates;
  const active = new Set<string>();
  after.descendants(node => {
    if (node.type.name === 'latex_include') active.add(node.attrs.path);
    return !node.isTextblock;
  });
  return candidates.filter(node => !active.has(node.attrs.path));
}

/** Removing an include reference detaches its source file from the document body. */
export function retainDetachedLatexFiles(transform: Transform, before: Node) {
  const original: LatexProject | null = before.attrs.latexProject;
  const project: LatexProject | null = transform.doc.attrs.latexProject;
  if (!original || project?.entry !== original.entry) return;
  for (const node of removedLatexIncludes(before, transform.doc)) {
    const path: string = node.attrs.path;
    if (path !== project.entry && project.files[path] === original.files[path]) {
      const source = latexIncludeSource(node);
      updateLatexProjectFile(transform, path, source, true);
    }
  }
}

/** A replayed unlink must save the chapter as it was after receiving other editors' changes. */
export function refreshRebasedLatexFiles(transform: Transform, rebased: Transform) {
  const snapshots = new Map<string, LatexProjectFileStep>();
  for (const step of rebased.steps) {
    if (!(step instanceof LatexProjectFileStep)) continue;
    if (step.retaining) snapshots.set(step.path, step);
    else snapshots.delete(step.path);
  }
  if (!snapshots.size) return;
  const recovered = new Map<string, Node>();
  for (let index = 0; index < rebased.steps.length; index++) {
    const before = rebased.docs[index]!;
    const after = rebased.docs[index + 1] ?? rebased.doc;
    for (const node of removedLatexIncludes(before, after)) {
      const path: string = node.attrs.path;
      if (snapshots.has(path)) recovered.set(path, node);
    }
  }
  const project: LatexProject | null = transform.doc.attrs.latexProject;
  for (const [path, node] of recovered) {
    if (project?.files[path] === snapshots.get(path)?.after)
      updateLatexProjectFile(transform, path, latexIncludeSource(node), true);
  }
}

/** Source mode and the hosted CLI turn source changes into normal, mappable editor steps. */
export function replaceLatexSource(document: Node, source: string, file?: string): Transform {
  const project = serializeLatexProject(document);
  const transform = new Transform(document);
  if (project) {
    const path = file ?? project.entry;
    if (project.files.get(path) === source) return transform;
    project.files.set(path, source);
  } else if (serializeLatex(document) === source) {
    return transform;
  }
  const next = project ? parseLatexProject(project.entry, project.files) : parseLatex(source);
  updateLatexBoundary(transform, 'prefix', next.attrs.prefix);
  updateLatexBoundary(transform, 'suffix', next.attrs.suffix);
  const previousProject: LatexProject | null = document.attrs.latexProject;
  const nextProject: LatexProject | null = next.attrs.latexProject;
  if (previousProject && nextProject) {
    for (const path of new Set([...Object.keys(previousProject.files), ...Object.keys(nextProject.files)])) {
      const value = Object.hasOwn(nextProject.files, path) ? nextProject.files[path]! : null;
      const detaching = value !== null && !Object.hasOwn(previousProject.files, path) && path !== file;
      updateLatexProjectFile(transform, path, value, detaching);
    }
  }

  // Convert persisted headings without replacing their contents or remapping other edits.
  document.descendants((node, position) => {
    if (node.type === schema.nodes.heading)
      transform.setNodeMarkup(position, schema.nodes.latex_heading, node.attrs);
    return !node.isTextblock;
  });
  const previous = transform.doc;
  const from = previous.content.findDiffStart(next.content);
  if (from === null) return transform;
  const original = previous.nodeAt(from);
  const edited = next.nodeAt(from);
  if (original?.type === edited?.type && edited?.type.name.startsWith('latex_') &&
      typeof original?.attrs.source === 'string' && typeof edited.attrs.source === 'string') {
    const sourceEdit = updateLatexNodeSource(new Transform(previous), from, edited.attrs.source);
    if (sourceEdit.doc.eq(next)) {
      for (const step of sourceEdit.steps) transform.step(step);
      return transform;
    }
  }
  const end = previous.content.findDiffEnd(next.content)!;
  const overlap = from - Math.min(end.a, end.b);
  if (overlap > 0) {
    end.a += overlap;
    end.b += overlap;
  }
  const precise = new Transform(previous);
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
  let right = previous.childCount;
  let nextRight = next.childCount;
  let start = 0;
  while (left < right && left < nextRight && previous.child(left).eq(next.child(left)))
    start += previous.child(left++).nodeSize;
  let stop = previous.content.size;
  while (
    right > left &&
    nextRight > left &&
    previous.child(right - 1).eq(next.child(nextRight - 1))
  ) {
    stop -= previous.child(--right).nodeSize;
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
  latex_landscape: '\\begin{landscape}\n',
  list_item: '\\item ',
};

type SourceBlock = { position: number; node: Node; offset: number; end: number; depth: number };
export type LatexSourcePoint = { file?: string | undefined; offset: number };

/** Index serialized block boundaries per file, including the editable children of input files. */
export function latexSourceMap(document: Node) {
  const project: LatexProject | null = document.attrs.latexProject;
  const files = new Map<string | undefined, SourceBlock[]>();
  const entry = project?.entry;
  files.set(entry, []);
  function visit(parent: Node, position: number, start: number, depth: number, file?: string) {
    const blocks = files.get(file)!;
    let offset = start;
    parent.forEach((node, childOffset, index) => {
      const before = node.attrs.before ?? (index === 0 ? '' : node.type.name === 'list_item' ? '\n' : '\n\n');
      offset += before.length;
      const end = offset + blockSource(node).length;
      const at = position + childOffset;
      blocks.push({ position: at, node, offset, end, depth });
      if (node.type.name === 'latex_include') {
        const path: string = node.attrs.path;
        // Repeated inputs display the same file. Use the first occurrence for source navigation.
        if (!files.has(path)) {
          files.set(path, []);
          visit(node, at + 1, 0, depth + 1, path);
        }
      } else if (!node.isTextblock && !node.isAtom && node.childCount) {
        const open = node.attrs.open ?? containerDefaults[node.type.name] ?? '';
        visit(node, at + 1, offset + open.length, depth + 1, file);
      }
      offset = end;
    });
  }
  visit(document, 0, String(document.attrs.prefix).length, 0, entry);

  function blockAt({ file = entry, offset }: LatexSourcePoint) {
    return files.get(file)?.findLast(block => offset >= block.offset && offset < block.end);
  }

  function inlineOffsets(block: SourceBlock) {
    const { node } = block;
    const heading = node.type.name === 'heading' || node.type.name === 'latex_heading';
    const start = block.offset + (heading
      ? (node.attrs.open ?? '\\' + (latexHeadings[node.attrs.level - 1] ?? latexHeadings[0]) + '{').length
      : node.attrs.open?.length ?? 0);
    const offsets = [start];
    inlineSource(node, (position, relative) => { offsets[position] = start + relative; });
    return offsets;
  }

  return {
    blockAt,
    sourceAt(position: number): LatexSourcePoint | undefined {
      let match: SourceBlock | undefined;
      let file: string | undefined;
      for (const [path, blocks] of files) {
        const block = blocks.findLast(({ position: at, node }) => position >= at && position < at + node.nodeSize);
        if (block && (!match || block.depth > match.depth)) {
          match = block;
          file = path;
        }
      }
      if (!match) return;
      const offsets = match.node.isTextblock ? inlineOffsets(match) : [];
      return { file, offset: offsets[position - match.position - 1] ?? match.offset };
    },
    positionAt(point: LatexSourcePoint) {
      const blocks = files.get(point.file ?? entry);
      const block = blockAt(point) ??
        blocks?.find(({ offset }) => offset >= point.offset) ?? blocks?.at(-1);
      if (!block) return;
      if (!block.node.isTextblock) return block.position;
      const offsets = inlineOffsets(block);
      let left = 0;
      let right = offsets.length;
      while (left < right) {
        const middle = (left + right) >>> 1;
        if (offsets[middle]! <= point.offset) left = middle + 1;
        else right = middle;
      }
      return block.position + 1 + Math.max(0, left - 1);
    },
  };
}

/** The innermost block at a source offset in the main file. */
export function latexBlockAtOffset(document: Node, offset: number) {
  return latexSourceMap(document).blockAt({ offset });
}
