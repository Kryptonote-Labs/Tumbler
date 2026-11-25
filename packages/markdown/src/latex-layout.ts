import { latexLineSpacing } from './latex-format';
import { readLatexClass, type LatexBlockFlow, type LatexBreak } from './latex-flow';
import { latexTypography, texPoint, type LatexTypography } from './latex-typography';
import { latexLength } from './latex-lengths';
import { latexDriverUsesClassPaper } from './latex-preamble';
import { commandEnd, groupAt } from './latex-syntax';
import { geometryOption, geometrySides, hasExplicitMargins, latexPaperSizes as paperSizes, readGeometry, writeLatexGeometry, type GeometryChange } from './latex-geometry';
import { geometryValues, marginValue, physicalGeometry } from './latex-geometry-layout';

const inch = 96;
const millimeter = inch / 25.4;
export type LatexPageLayout = {
  width: number;
  height: number;
  left: number;
  evenLeft?: number;
  right: number;
  top: number;
  bottom: number;
  gap: number;
  fontSize: number;
  leading: number;
  typography?: LatexTypography;
  firstBaseline: number;
  footerBaseline: number;
  paragraphIndent: number;
  paragraphSpacing: number;
  paragraphShrink: number;
  numbered: boolean;
  columns: 1 | 2;
  columnGap: number;
  rotated?: true;
};

/** Resolve the horizontal margins for a zero-based TeX page number, preserving text width. */
export function latexSheetLayout(layout: LatexPageLayout, index: number): LatexPageLayout {
  if (index % 2 === 0 || layout.evenLeft === undefined) return layout;
  return { ...layout, left: layout.evenLeft, right: layout.left + layout.right - layout.evenLeft };
}

/** pdflscape exchanges the body axes, with the portrait footer on the left of the sheet. */
export function latexLandscapeLayout(portrait: LatexPageLayout): LatexPageLayout {
  const { evenLeft: _bindingMargin, ...paper } = portrait;
  return {
    ...paper,
    width: portrait.height,
    height: portrait.width,
    left: portrait.bottom,
    right: portrait.top,
    top: portrait.left,
    bottom: portrait.right,
    footerBaseline: portrait.height - portrait.footerBaseline,
    rotated: true,
  };
}

function readOptions(prefix: string) {
  const source = prefix.replace(/(?<!\\)%[^\n]*/g, '');
  const { name: documentClass, options: classOptions } = readLatexClass(prefix);
  const { loaded: geometry, options: geometryOptions } = readGeometry(prefix);
  let paperSize: string | undefined;
  let orientation: 'landscape' | 'portrait' | undefined;
  let fontSize = 10;
  for (const value of [...classOptions, ...geometryOptions]) {
    const [key, setting] = geometryOption(value);
    const named = key === 'paper' ? setting : key;
    if (paperSizes.has(named) && (key === 'paper' || setting === 'true')) paperSize = named;
    if (key === 'landscape' || key === 'portrait')
      orientation = (key === 'landscape') === (setting === 'true') ? 'landscape' : 'portrait';
  }
  for (const value of classOptions) {
    if (/^(10|11|12)pt$/.test(value)) fontSize = Number.parseFloat(value);
  }
  return {
    source,
    geometry,
    geometryOptions,
    paperSize,
    orientation,
    fontSize,
    classOptions,
    documentClass,
  };
}

export function latexPaperSettings(prefix: string, output?: { defaultPaper: 'a4paper' | 'letterpaper' }) {
  let { paperSize, orientation, geometryOptions } = readOptions(prefix);
  let margin: string | undefined;
  for (const option of geometryOptions) {
    const [key, value] = option.split('=');
    if (key?.trim() === 'margin') margin = value?.trim();
  }
  if (output) {
    const { width, height } = latexPageLayout(prefix, output);
    paperSize = [...paperSizes].find(([, [short, long]]) =>
      (Math.abs(width - short) < 0.01 && Math.abs(height - long) < 0.01) ||
      (Math.abs(width - long) < 0.01 && Math.abs(height - short) < 0.01),
    )?.[0];
  }
  return { paperSize, orientation, margin };
}

/** A literal TeX length, also accepting multiples of `\\baselineskip`. */
function length(value: string | undefined, quad: number, leading: number, xHeight?: number) {
  const measure = value
    ?.trim()
    .split(/\s+(?:plus|minus)\s+/)[0]
    ?.trim();
  const skip = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)?)\s*\\baselineskip$/.exec(measure ?? '');
  if (skip) return (skip[1] === '' || skip[1] === undefined ? 1 : Number(skip[1])) * leading;
  return latexLength(measure, quad, xHeight);
}

function packageOptions(source: string, position: number, name: string) {
  const match = /\\usepackage\s*(?:\[([^\]]*)\])?\s*\{([^{}]*)\}/y;
  match.lastIndex = position;
  const found = match.exec(source);
  if (!found || !found[2]!.split(',').some((entry) => entry.trim() === name)) return;
  return { options: found[1] ?? '', end: match.lastIndex };
}

function paragraphLengths(source: string, quad: number, xHeight: number, defaultIndent: number, leading: number, defaultSkip = 0) {
  const lengths = { parindent: defaultIndent, parskip: defaultSkip, shrink: 0 };
  const shrinkOf = (value: string | undefined) =>
    length(/\bminus\s+(.+)$/.exec(value?.trim() ?? '')?.[1], quad, leading, xHeight) ?? 0;
  // Apply literal TeX registers, LaTeX length commands and the parskip package in source order.
  const assignments =
    /\\(?:(setlength|addtolength)\s*(?:\{\s*\\(parindent|parskip)\s*\}|\\(parindent|parskip)\b)\s*\{([^{}]*)\}|(parindent|parskip)\s*(?:=\s*)?([+-]?(?:\d+(?:\.\d*)?|\.\d+)\s*(?:in|cm|mm|pt|bp|pc|sp|dd|cc|em|ex))\b)/y;
  for (let position = 0; position < source.length;) {
    if (source[position] === '{') {
      position = groupAt(source, position)?.end ?? source.length;
      continue;
    }
    if (source[position] !== '\\') {
      position++;
      continue;
    }
    const parskip = packageOptions(source, position, 'parskip');
    if (parskip) {
      // parskip 2: no indent and half a line between paragraphs, unless options say otherwise.
      const options = new Map(
        parskip.options.split(',').map((option) => {
          const [key = '', value] = option.split('=');
          return [key.trim(), value?.trim()] as const;
        }),
      );
      lengths.parskip = length(options.get('skip'), quad, leading, xHeight) ?? leading / 2;
      lengths.shrink = shrinkOf(options.get('skip'));
      lengths.parindent = options.has('indent')
        ? (length(options.get('indent'), quad, leading, xHeight) ?? quad)
        : 0;
      position = parskip.end;
      continue;
    }
    assignments.lastIndex = position;
    const assignment = assignments.exec(source);
    position = assignment ? assignments.lastIndex : commandEnd(source, position);
    if (!assignment) continue;
    const [, operation, grouped, bare, argument, register, literal] = assignment;
    const name = grouped ?? bare ?? register;
    if (name !== 'parindent' && name !== 'parskip') continue;
    const value = length(argument ?? literal, quad, leading, xHeight);
    if (value === undefined) continue;
    lengths[name] = operation === 'addtolength' ? lengths[name] + value : value;
    if (name === 'parskip') {
      const shrink = shrinkOf(argument ?? literal);
      lengths.shrink = operation === 'addtolength' ? lengths.shrink + shrink : shrink;
    }
  }
  return lengths;
}

type LatexOutputPaper = { defaultPaper?: 'a4paper' | 'letterpaper' };

const hasRoom = (length: number) => Number.isFinite(length) && length > 0;

/** Update the preamble and check the text area after applying all page settings together. */
export function setLatexGeometry(prefix: string, change: GeometryChange, currentPaperSize?: string) {
  const next = writeLatexGeometry(prefix, change, currentPaperSize);
  if ((change.margin !== undefined || change.margins !== undefined ||
    change.bindingOffset !== undefined || change.twoSided !== undefined) &&
    !resolvePageLayout(next).hasTextArea)
    throw new Error('The margins leave no room for text.');
  return next;
}

/** Read the standard class and geometry options that determine the editable page. */
export function latexPageLayout(prefix: string, output?: LatexOutputPaper): LatexPageLayout {
  const { layout, footSkip } = resolvePageLayout(prefix, output);
  const { width, height, left, right, top, bottom, leading } = layout;
  // Give imported geometry with no text area enough space to edit without changing the source.
  if (!hasRoom(width - left - right)) {
    layout.left = layout.right = Math.max(0, width - 24) / 2;
    delete layout.evenLeft;
  }
  if (!hasRoom(height - top - bottom)) {
    layout.top = layout.bottom = Math.max(0, height - 2 * leading) / 2;
    layout.footerBaseline = height - layout.bottom + footSkip;
  }
  return layout;
}

/** Resolve the values shown when editing a document's margins, before adding its gutter. */
export function latexMarginSettings(prefix: string, output?: LatexOutputPaper) {
  return resolvePageLayout(prefix, output).marginSettings;
}

function resolvePageLayout(prefix: string, output: LatexOutputPaper = {}) {
  const { source, geometry, geometryOptions, paperSize, orientation, fontSize, classOptions, documentClass } =
    readOptions(prefix);
  const landscape = orientation === 'landscape';
  const paper = paperSizes.get(paperSize ?? 'letterpaper')!;
  let [width, height] = landscape ? [paper[1]!, paper[0]!] : [paper[0]!, paper[1]!];
  const slide = documentClass === 'beamer';
  if (slide) {
    const sizes = {
      '141': [140, 91], '1610': [160, 100], '169': [160, 90], '149': [140, 90],
      '54': [125, 100], '43': [128, 96], '32': [135, 90], '2013': [148.5, 105],
    } as const;
    const aspect = classOptions.findLast((option) => option.startsWith('aspectratio='))?.slice(12);
    const size = aspect && Object.hasOwn(sizes, aspect) ? sizes[aspect as keyof typeof sizes] : sizes['43'];
    width = size[0] * millimeter;
    height = size[1] * millimeter;
  }
  const sizes = geometryValues(geometryOptions);
  const activeGeometry = geometry && sizes.get('pass') !== 'true';
  const sideOptions = activeGeometry ? geometryOptions : [];
  const { twoSided, mirror } = geometrySides(documentClass, classOptions, sideOptions);
  const twoColumns = sizes.has('twocolumn') ? sizes.get('twocolumn') === 'true' :
    sizes.has('onecolumn') ? sizes.get('onecolumn') === 'false' : classOptions.includes('twocolumn');
  const textPoints = slide && !classOptions.includes('10pt') && !classOptions.includes('12pt') ? 11 : fontSize;
  const typography = latexTypography(textPoints, source, twoColumns);
  const { size: font, leading } = typography.text;
  // Standard Computer Modern classes set lengths using the font's quad.
  const quad = (fontSize === 12 ? 11.74988 : fontSize === 11 ? 10.95003 : 10) * texPoint;
  const letter = documentClass === 'letter';
  const defaultIndent = twoColumns
    ? quad
    : fontSize === 12
      ? 1.5 * quad
      : (fontSize === 11 ? 17 : 15) * texPoint;
  const xHeight = 0.430555 * font;
  const paragraphs = paragraphLengths(
    source, quad, xHeight, letter ? 0 : defaultIndent, leading, letter ? 0.7 * quad : 0,
  );

  if (activeGeometry) {
    const widthOption = latexLength(sizes.get('paperwidth'));
    const heightOption = latexLength(sizes.get('paperheight'));
    width = (landscape ? heightOption : widthOption) ?? width;
    height = (landscape ? widthOption : heightOption) ?? height;
  }

  const classWidth = (fontSize === 12 ? 390 : fontSize === 11 ? 360 : 345) * texPoint * (twoColumns ? 2 : 1);
  const classLeading = leading / latexLineSpacing(source, textPoints).stretch;
  const body = Math.max(
    classLeading,
    Math.floor((height - 3.5 * inch) / classLeading) * classLeading + fontSize * texPoint,
  );
  const wholePoints = (length: number) => Math.trunc(length / texPoint) * texPoint;
  const classTop = letter
    ? inch + 84 * texPoint
    : inch + wholePoints((height - 2 * inch - 67 * texPoint - body) / 2) + 37 * texPoint;
  const standardSide = Math.max(0, (width - Math.min(classWidth, width - 2 * inch)) / 2);

  // The standard classes round their margin registers to whole TeX points after removing the origin.
  let left = inch + wholePoints((twoSided ? 0.8 : 1) * standardSide - inch);
  let right = 2 * standardSide - left;
  let top = classTop;
  let bottom = height - classTop - body;
  let evenLeft = twoSided ? inch + wholePoints(1.2 * standardSide - inch) : undefined;
  let footSkip = (letter ? 25 : 30) * texPoint;
  let bindingOffset = '0cm';
  let margins = {
    top: marginValue(undefined, top), bottom: marginValue(undefined, bottom),
    left: marginValue(undefined, left), right: marginValue(undefined, right),
  };
  if (activeGeometry) {
    const marginparWidth = wholePoints(Math.min(
      (twoSided ? 0.8 : 1) * standardSide - (twoColumns ? 10 : 11) * texPoint,
      (twoColumns ? 60 : 90) * texPoint,
    ));
    const result = physicalGeometry(sizes, {
      width, height, twoSided, mirror, twoColumns, font: quad, xHeight, classLeading,
      topSkip: fontSize * texPoint, marginparWidth, letter,
    });
    ({ left, right, top, bottom, evenLeft, footSkip, margins, binding: bindingOffset } = result);
  }
  // A driver can ship a physical sheet independently of the lengths set by the class.
  // Geometry uses the paper primitives and replaces that driver default.
  if (!slide && !activeGeometry && output.defaultPaper && !latexDriverUsesClassPaper(prefix, classOptions)) {
    const [sheetWidth, sheetHeight] = paperSizes.get(output.defaultPaper)!;
    right += sheetWidth! - width;
    bottom += sheetHeight! - height;
    width = sheetWidth!;
    height = sheetHeight!;
  }
  const outputDimensions = {
    width: latexLength(/\\pdfpagewidth\s*=?\s*([\d.]+\s*[a-z]+)/.exec(source)?.[1]),
    height: latexLength(/\\pdfpageheight\s*=?\s*([\d.]+\s*[a-z]+)/.exec(source)?.[1]),
  };
  if (outputDimensions.width && outputDimensions.width > 0) {
    right += outputDimensions.width - width;
    width = outputDimensions.width;
  }
  if (outputDimensions.height && outputDimensions.height > 0) {
    bottom += outputDimensions.height - height;
    height = outputDimensions.height;
  }
  const layout: LatexPageLayout = {
    width,
    height,
    left: slide ? 10 * millimeter : left,
    ...(!slide && evenLeft !== undefined && evenLeft !== left ? { evenLeft } : {}),
    right: slide ? 10 * millimeter : right,
    top: slide ? 0 : top,
    bottom: slide ? 0 : bottom,
    gap: 24,
    fontSize: font,
    leading,
    ...(['article', 'report', 'book', 'letter'].includes(documentClass) && { typography }),
    firstBaseline: slide ? leading / 2 + font * 0.4 : fontSize * texPoint,
    footerBaseline: height - bottom + footSkip,
    paragraphIndent: paragraphs.parindent,
    paragraphSpacing: paragraphs.parskip,
    paragraphShrink: Math.max(0, paragraphs.shrink),
    columns: twoColumns ? 2 : 1,
    columnGap: length(/\\setlength\s*\{\\columnsep\}\s*\{([^{}]*)\}/.exec(source)?.[1], quad, leading) ?? 10 * texPoint,
    numbered: !slide && !/\\(?:pagestyle\s*\{empty\}|pagenumbering\s*\{gobble\})/.test(source),
  };
  return {
    layout,
    footSkip,
    hasTextArea: hasRoom(width - left - right) && hasRoom(height - top - bottom),
    marginSettings: { margins, twoSided, bindingOffset, explicit: activeGeometry && hasExplicitMargins(geometryOptions) },
  };
}

/**
 * A line or unbreakable block in the continuous editor. `notes` are the heights of footnotes
 * whose marks it holds; they print at the foot of the same page and take room from its body.
 */
export type PageLine = {
  position: number;
  top: number;
  bottom: number;
  notes?: number[];
  /** An internal fragment can carry a source-authored boundary. */
  before?: LatexBreak;
  /** Content repeated at the start of a continuation, and at its preceding boundary. */
  continuation?: { fragment: number; startHeight: number };
  /** Space needed after placing this line if another fragment follows on a new page. */
  reserveAfter?: number;
  /** Descender depth or trailing glue that can extend beyond TeX's page goal. */
  depth?: number;
  /** Glue before the line can shrink with it. Glue after it belongs to the next line on this page. */
  shrinkBefore?: number;
  shrinkAfter?: number;
};
export type PageBlock = PageLine & {
  split?: () => PageLine[];
  /** A display alignment can break at a row before compressing the whole display onto a page. */
  preferFragments?: boolean;
  /** Measure internal fragments even when the entire block fits. */
  forceFragments?: boolean;
  /** Prefer to break before a section and its opening lines over shrinking the previous page. */
  keepHeadingWithNext?: boolean;
  flow?: LatexBlockFlow;
  /** @deprecated Use a column break in `flow`. */
  force?: boolean;
  /** @deprecated Use a page break in `flow`. */
  forcePage?: boolean;
};
export type PageBreak = { position: number; height: number; fragment?: number };
export type LatexWideFloat = { position: number; sheet: number; offset: number; height: number };

function strongerBreak(left: LatexBreak | undefined, right: LatexBreak | undefined) {
  if (left === 'recto' || right === 'recto') return 'recto';
  if (left === 'page' || right === 'page') return 'page';
  return left ?? right;
}

/**
 * Place spacers into the continuous editor while keeping page breaks out of document history.
 * Footnotes go on the page of their mark, in order, after a separator of `noteGap`. `footnotes`
 * lists the page index for each footnote and `footHeights` the room the notes use on each page.
 */
export function paginateLatex(
  blocks: PageBlock[],
  bodyHeight: number,
  spacing: number,
  noteGap = 0,
  columns = 1,
  firstSpanHeight = 0,
) {
  const breaks: PageBreak[] = [];
  const breakSlots: number[] = [];
  const footnotes: number[] = [];
  const footHeights: number[] = [0];
  const wideFloats: LatexWideFloat[] = [];
  const floatSpans = new Map<number, number>();
  const deferred: PageLine[] = [];
  type Glue = { position: number; edge: 'before' | 'after'; size: number };
  const shrinkages = new Map<number, { before: number; after: number }>();
  let glues: Glue[] = [];
  let trailing: Glue | undefined;
  let shrink = 0;
  let lastBottom = 0;
  const floatGap = 20 * texPoint;
  let start = 0;
  let pages = 1;
  let occupied = false;
  let pending: LatexBreak | undefined;
  // Spacers carry the page's unused body, including the room its footnotes take.
  let notes = 0;
  const room = (line: PageLine) => {
    const extra = (line.notes ?? []).reduce((sum, height) => sum + height, 0);
    if (!extra) return notes;
    return notes + extra + (notes ? 0 : noteGap);
  };
  const sheetOf = (slot: number) => Math.floor(slot / columns);
  const before = (line: PageLine) => line.top > start ? line.shrinkBefore ?? 0 : 0;
  const fits = (line: PageLine, elastic = true) => {
    const span = floatSpans.get(sheetOf(pages - 1)) ?? (pages > 1 && pages <= columns ? firstSpanHeight : 0);
    const availableShrink = elastic ? shrink + (trailing?.size ?? 0) + before(line) : 0;
    return line.bottom - (line.depth ?? 0) - start - availableShrink + room(line) + (line.reserveAfter ?? 0) <= bodyHeight - span;
  };

  function placeWide(sheet: number, floatPage = false) {
    const startIndex = wideFloats.length;
    let height = 0;
    while (deferred.length) {
      const figure = deferred[0]!;
      const size = figure.bottom - figure.top;
      const offset = height ? height + floatGap : 0;
      if (offset && offset + size + (floatPage ? 0 : floatGap) > bodyHeight) break;
      if (!floatPage && size + floatGap >= bodyHeight) break;
      deferred.shift();
      wideFloats.push({ position: figure.position, sheet, offset, height: size });
      height = offset + size;
    }
    if (!height) return;
    if (floatPage) {
      const fill = Math.max(0, (bodyHeight - height) / 2);
      for (const item of wideFloats.slice(startIndex)) item.offset += fill;
    } else floatSpans.set(sheet, height + floatGap);
  }
  function place(line: PageLine) {
    if (trailing) {
      glues.push(trailing);
      shrink += trailing.size;
    }
    const size = before(line);
    if (size > 0) {
      glues.push({ position: line.position, edge: 'before', size });
      shrink += size;
    }
    trailing = line.shrinkAfter ? { position: line.position, edge: 'after', size: line.shrinkAfter } : undefined;
    lastBottom = line.bottom - (line.depth ?? 0);
    notes = room(line);
    for (const _ of line.notes ?? []) footnotes.push(pages - 1);
    footHeights[pages - 1] = notes;
  }
  function settle() {
    const span = floatSpans.get(sheetOf(pages - 1)) ?? 0;
    const reduction = Math.min(shrink, Math.max(0, lastBottom - start + notes + span - bodyHeight));
    if (reduction > 0) {
      const ratio = reduction / shrink;
      for (const { position, edge, size } of glues) {
        const adjustment = shrinkages.get(position) ?? { before: 0, after: 0 };
        adjustment[edge] += size * ratio;
        shrinkages.set(position, adjustment);
      }
    }
    glues = [];
    trailing = undefined;
    shrink = 0;
    return reduction;
  }
  function advance(line: PageLine, boundary: LatexBreak = 'column') {
    // The next page has the same body capacity, even after a short previous page.
    const stride = bodyHeight + spacing;
    const distance = line.top - start;
    const needed = Math.max(1, Math.floor((distance + notes) / stride) + 1);
    const slot = pages - 1 + needed;
    let next = boundary === 'column' ? slot : Math.ceil(slot / columns) * columns;
    if (boundary === 'recto' && (next / columns) % 2 !== 0) next += columns;
    const advanceBy = next - (pages - 1);
    const previousSpan = columns === 1 ? floatSpans.get(sheetOf(pages - 1)) ?? 0 : 0;
    const reduction = settle();
    if (sheetOf(next) > sheetOf(pages - 1)) placeWide(sheetOf(next));
    const span = columns === 1 ? floatSpans.get(sheetOf(next)) ?? 0 : 0;
    breakSlots.push(next);
    const continuation = line.continuation;
    const startHeight = continuation?.startHeight ?? 0;
    breaks.push({
      position: line.position,
      height: advanceBy * stride - distance + startHeight + reduction + span - previousSpan,
      ...(continuation ? { fragment: continuation.fragment } : {}),
    });
    pages += advanceBy;
    for (let page = footHeights.length; page < pages; page++) footHeights.push(0);
    start = line.top - startHeight;
    occupied = false;
    notes = 0;
  }
  for (const block of blocks) {
    const flow = block.flow ?? (
      block.forcePage || block.force
        ? { kind: 'break' as const, boundary: block.forcePage ? 'page' as const : 'column' as const }
        : undefined
    );
    if (flow?.kind === 'content' && flow.wideFloat) {
      deferred.push(block);
      continue;
    }
    if (flow?.kind === 'omit') continue;
    if (flow?.kind === 'break') {
      if (occupied) pending = strongerBreak(pending, flow.boundary);
      continue;
    }
    const before = strongerBreak(pending, flow?.before);
    if (occupied && before) advance(block, before);
    pending = flow?.after;
    const internal = block.forceFragments ? block.split?.() : undefined;
    const forced = internal?.some(line => line.before);
    if (!forced && (fits(block, !block.preferFragments && !block.keepHeadingWithNext) || (!occupied && !block.split))) {
      occupied = true;
      place(block);
      continue;
    }
    const lines = internal ?? block.split?.() ?? [];
    if (lines.length < 2) {
      if (occupied) advance(block);
      occupied = true;
      place(block);
      continue;
    }
    for (const [index, line] of lines.entries()) {
      const next = lines[index + 1];
      const orphans = !block.preferFragments && index === 0 && next && !fits({ ...next, notes: [...(line.notes ?? []), ...(next.notes ?? [])] });
      if (occupied && (line.before || !fits(line, !block.preferFragments || index === 0) || orphans))
        advance(line, line.before);
      occupied = true;
      place(line);
    }
  }
  settle();
  while (deferred.length) {
    const sheet = sheetOf(pages - 1) + 1;
    placeWide(sheet, true);
    pages = sheet * columns + 1;
    while (footHeights.length < pages) footHeights.push(0);
  }
  return { breaks, breakSlots, pages, footnotes, footHeights, wideFloats, floatSpans, shrinkages };
}
