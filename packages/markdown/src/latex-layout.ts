import { readLatexClass, type LatexBlockFlow, type LatexBreak } from './latex-flow';
import { latexTypography, texPoint, type LatexTypography } from './latex-typography';
import { latexLength } from './latex-lengths';
import { latexDriverUsesClassPaper } from './latex-preamble';
import { commandEnd, groupAt } from './latex-syntax';

const inch = 96;
const millimeter = inch / 25.4;
const paperSizes = new Map([
  ['letterpaper', [8.5 * inch, 11 * inch]],
  ['legalpaper', [8.5 * inch, 14 * inch]],
  ['a3paper', [297 * millimeter, 420 * millimeter]],
  ['a4paper', [210 * millimeter, 297 * millimeter]],
  ['a5paper', [148 * millimeter, 210 * millimeter]],
  ['executivepaper', [7.25 * inch, 10.5 * inch]],
]);

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
  numbered: boolean;
  columns: 1 | 2;
  columnGap: number;
  rotated?: true;
};

/** Resolve the binding margin for a physical sheet, preserving its text width. */
export function latexSheetLayout(layout: LatexPageLayout, index: number): LatexPageLayout {
  if (index % 2 === 0 || layout.evenLeft === undefined) return layout;
  return { ...layout, left: layout.evenLeft, right: layout.left + layout.right - layout.evenLeft };
}

/** pdflscape exchanges the body axes, with the portrait footer on the left of the sheet. */
export function latexLandscapeLayout(portrait: LatexPageLayout): LatexPageLayout {
  return {
    ...portrait,
    width: portrait.height,
    height: portrait.width,
    left: portrait.bottom,
    evenLeft: undefined,
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
  const geometryOptions: string[] = [];
  let geometry = false;
  for (const match of source.matchAll(
    /\\usepackage\s*(?:\[([^\]]*)\])?\s*\{([^{}]*)\}|\\geometry\s*\{([^{}]*)\}/g,
  )) {
    if (match[3] === undefined && !match[2]?.split(',').some((name) => name.trim() === 'geometry'))
      continue;
    geometry = true;
    for (const item of (match[3] ?? match[1] ?? '').split(',')) {
      if (item.trim() === 'reset') geometryOptions.length = 0;
      else geometryOptions.push(item.trim());
    }
  }
  let paperSize: string | undefined;
  let orientation: 'landscape' | 'portrait' | undefined;
  let fontSize = 10;
  for (const value of [...classOptions, ...geometryOptions]) {
    const named = value.replace(/^paper\s*=\s*/, '');
    if (paperSizes.has(named)) paperSize = named;
    if (value === 'landscape' || value === 'portrait') orientation = value;
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

export function latexPaperSettings(prefix: string) {
  const { paperSize, orientation, geometryOptions } = readOptions(prefix);
  let margin: string | undefined;
  for (const option of geometryOptions) {
    const [key, value] = option.split('=');
    if (key?.trim() === 'margin') margin = value?.trim();
  }
  return { paperSize, orientation, margin };
}

/** A literal TeX length, also accepting multiples of `\\baselineskip`. */
function length(value: string | undefined, quad: number, leading: number) {
  const measure = value
    ?.trim()
    .split(/\s+(?:plus|minus)\s+/)[0]
    ?.trim();
  const skip = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)?)\s*\\baselineskip$/.exec(measure ?? '');
  if (skip) return (skip[1] === '' || skip[1] === undefined ? 1 : Number(skip[1])) * leading;
  return latexLength(measure, quad);
}

function packageOptions(source: string, position: number, name: string) {
  const match = /\\usepackage\s*(?:\[([^\]]*)\])?\s*\{([^{}]*)\}/y;
  match.lastIndex = position;
  const found = match.exec(source);
  if (!found || !found[2]!.split(',').some((entry) => entry.trim() === name)) return;
  return { options: found[1] ?? '', end: match.lastIndex };
}

function paragraphLengths(source: string, quad: number, defaultIndent: number, leading: number, defaultSkip = 0) {
  const lengths = { parindent: defaultIndent, parskip: defaultSkip };
  // Apply literal TeX registers, LaTeX length commands and the parskip package in source order.
  const assignments =
    /\\(?:(setlength|addtolength)\s*(?:\{\s*\\(parindent|parskip)\s*\}|\\(parindent|parskip)\b)\s*\{([^{}]*)\}|(parindent|parskip)\s*(?:=\s*)?([+-]?(?:\d+(?:\.\d*)?|\.\d+)\s*(?:in|cm|mm|pt|bp|pc|sp|dd|cc|em))\b)/y;
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
      lengths.parskip = length(options.get('skip'), quad, leading) ?? leading / 2;
      lengths.parindent = options.has('indent')
        ? (length(options.get('indent'), quad, leading) ?? quad)
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
    const value = length(argument ?? literal, quad, leading);
    if (value === undefined) continue;
    lengths[name] = operation === 'addtolength' ? lengths[name] + value : value;
  }
  return lengths;
}

/** Read the standard class and geometry options that determine the editable page. */
export function latexPageLayout(
  prefix: string,
  output: { defaultPaper?: 'a4paper' | 'letterpaper' } = {},
): LatexPageLayout {
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
  const twoColumns = classOptions.includes('twocolumn');
  const sides = (geometry ? [...classOptions, ...geometryOptions] : classOptions)
    .findLast((option) => option === 'twoside' || option === 'oneside');
  const twoSided = !slide && (sides ? sides === 'twoside' : documentClass === 'book');
  const typography = latexTypography(slide && !classOptions.includes('10pt') && !classOptions.includes('12pt') ? 11 : fontSize, source, twoColumns);
  const { size: font, leading } = typography.text;
  // Standard Computer Modern classes set lengths using the font's quad.
  const quad = (fontSize === 12 ? 11.74988 : fontSize === 11 ? 10.95003 : 10) * texPoint;
  const letter = documentClass === 'letter';
  const defaultIndent = twoColumns
    ? quad
    : fontSize === 12
      ? 1.5 * quad
      : (fontSize === 11 ? 17 : 15) * texPoint;
  const paragraphs = paragraphLengths(source, quad, letter ? 0 : defaultIndent, leading, letter ? 0.7 * quad : 0);

  const sizes = new Map(
    geometryOptions.map((option) => {
      const [name, value] = option.split('=');
      return [name?.trim(), value?.trim()] as const;
    }),
  );
  const paperWidth = latexLength(sizes.get('paperwidth'));
  const paperHeight = latexLength(sizes.get('paperheight'));
  if (paperWidth && paperWidth > 0) width = paperWidth;
  if (paperHeight && paperHeight > 0) height = paperHeight;

  const classWidth = (fontSize === 12 ? 390 : fontSize === 11 ? 360 : 345) * texPoint * (twoColumns ? 2 : 1);
  const body = Math.max(
    leading,
    Math.floor((height - 3.5 * inch) / leading) * leading + fontSize * texPoint,
  );
  const classTop = letter ? inch + 84 * texPoint : inch + (height - 2 * inch - 67 * texPoint - body) / 2 + 37 * texPoint;
  const standardSide = Math.max(0, (width - Math.min(classWidth, width - 2 * inch)) / 2);

  // The standard classes use 40% of the free width inside the binding in two-sided mode.
  let left = twoSided ? inch + Math.trunc((0.8 * standardSide - inch) / texPoint) * texPoint : standardSide;
  let right = 2 * standardSide - left;
  let top = geometry ? height * 0.12 : classTop;
  let bottom = geometry ? height * 0.18 : height - classTop - body;
  // Geometry options are ordered. In particular, margin applies to all four sides.
  const explicit = new Map<string, number>();
  for (const option of geometryOptions) {
    const [raw, value] = option.split('=');
    const name = raw?.trim();
    const length = latexLength(value?.trim());
    if (length === undefined || length < 0) continue;
    if (name === 'margin' || name === 'left' || name === 'inner') explicit.set('left', length);
    if (name === 'margin' || name === 'right' || name === 'outer') explicit.set('right', length);
    if (name === 'margin' || name === 'top') explicit.set('top', length);
    if (name === 'margin' || name === 'bottom') explicit.set('bottom', length);
  }
  const horizontal =
    latexLength(sizes.get('textwidth')) ?? latexLength(sizes.get('width')) ?? width * 0.7;
  const vertical =
    latexLength(sizes.get('textheight')) ?? latexLength(sizes.get('height')) ?? height * 0.7;
  if (geometry) {
    const remainder = Math.max(0, width - horizontal);
    left = remainder * (twoSided ? 0.4 : 0.5);
    right = remainder - left;
    top = Math.max(0, (height - vertical) * 0.4);
    bottom = Math.max(0, (height - vertical) * 0.6);
  }
  left =
    explicit.get('left') ??
    (explicit.has('right') ? Math.max(0, width - explicit.get('right')! - horizontal) : left);
  right =
    explicit.get('right') ??
    (explicit.has('left') ? Math.max(0, width - left - horizontal) : right);
  top =
    explicit.get('top') ??
    (explicit.has('bottom') ? Math.max(0, height - explicit.get('bottom')! - vertical) : top);
  bottom =
    explicit.get('bottom') ?? (explicit.has('top') ? Math.max(0, height - top - vertical) : bottom);

  // Keep the editable area usable for unusual imported settings. PDF still uses the exact source.
  if (left + right >= width - 24) left = right = width * 0.15;
  if (top + bottom >= height - leading * 2) {
    top = height * 0.12;
    bottom = height * 0.18;
  }
  const evenLeft = twoSided
    ? geometry ? right : inch + Math.trunc((right - inch) / texPoint) * texPoint
    : undefined;
  // A driver can ship a physical sheet independently of the lengths set by the class.
  // Geometry uses the paper primitives and replaces that driver default.
  if (!slide && !geometry && output.defaultPaper && !latexDriverUsesClassPaper(prefix, classOptions)) {
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
  return {
    width,
    height,
    left: slide ? 10 * millimeter : left,
    ...(evenLeft !== undefined && evenLeft !== left ? { evenLeft } : {}),
    right: slide ? 10 * millimeter : right,
    top: slide ? 0 : top,
    bottom: slide ? 0 : bottom,
    gap: 24,
    fontSize: font,
    leading,
    typography: ['article', 'report', 'book', 'letter'].includes(documentClass) ? typography : undefined,
    firstBaseline: slide ? leading / 2 + font * 0.4 : fontSize * texPoint,
    footerBaseline: height - bottom + (latexLength(sizes.get('footskip')) ?? (letter ? 25 : 30) * texPoint),
    paragraphIndent: paragraphs.parindent,
    paragraphSpacing: paragraphs.parskip,
    columns: twoColumns ? 2 : 1,
    columnGap: length(/\\setlength\s*\{\\columnsep\}\s*\{([^{}]*)\}/.exec(source)?.[1], quad, leading) ?? 10 * texPoint,
    numbered: !slide && !/\\(?:pagestyle\s*\{empty\}|pagenumbering\s*\{gobble\})/.test(source),
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
  /** Content repeated at the start of a continuation, and at its preceding boundary. */
  continuation?: { fragment: number; startHeight: number };
  /** Space needed after placing this line if another fragment follows on a new page. */
  reserveAfter?: number;
  /** Descender depth left below TeX's page goal when this is the last line or row. */
  depth?: number;
};
export type PageBlock = PageLine & {
  split?: () => PageLine[];
  flow?: LatexBlockFlow;
};
export type PageBreak = { position: number; height: number; fragment?: number };

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
  const fits = (line: PageLine) =>
    line.bottom - (line.depth ?? 0) - start + room(line) + (line.reserveAfter ?? 0) <= bodyHeight - (pages > 1 && pages <= columns ? firstSpanHeight : 0);
  function place(line: PageLine) {
    notes = room(line);
    for (const _ of line.notes ?? []) footnotes.push(pages - 1);
    footHeights[pages - 1] = notes;
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
    breakSlots.push(next);
    const continuation = line.continuation;
    const startHeight = continuation?.startHeight ?? 0;
    breaks.push({
      position: line.position,
      height: advanceBy * stride - distance + startHeight,
      ...(continuation ? { fragment: continuation.fragment } : {}),
    });
    pages += advanceBy;
    for (let page = footHeights.length; page < pages; page++) footHeights.push(0);
    start = line.top - startHeight;
    occupied = false;
    notes = 0;
  }
  for (const block of blocks) {
    const flow = block.flow;
    if (flow?.kind === 'omit') continue;
    if (flow?.kind === 'break') {
      if (occupied) pending = strongerBreak(pending, flow.boundary);
      continue;
    }
    const before = strongerBreak(pending, flow?.before);
    if (occupied && before) advance(block, before);
    pending = flow?.after;
    if (fits(block) || (!occupied && !block.split)) {
      occupied = true;
      place(block);
      continue;
    }
    const lines = block.split?.() ?? [];
    if (lines.length < 2) {
      if (occupied) advance(block);
      occupied = true;
      place(block);
      continue;
    }
    for (const [index, line] of lines.entries()) {
      const next = lines[index + 1];
      const orphans = index === 0 && next && !fits({ ...next, notes: [...(line.notes ?? []), ...(next.notes ?? [])] });
      if (occupied && (!fits(line) || orphans)) advance(line);
      occupied = true;
      place(line);
    }
  }
  return { breaks, breakSlots, pages, footnotes, footHeights };
}
