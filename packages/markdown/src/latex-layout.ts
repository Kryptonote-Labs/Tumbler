import { commandEnd, groupAt } from './latex-syntax';

const inch = 96;
const texPoint = inch / 72.27;
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
  right: number;
  top: number;
  bottom: number;
  gap: number;
  fontSize: number;
  leading: number;
  firstBaseline: number;
  footerBaseline: number;
  paragraphIndent: number;
  paragraphSpacing: number;
  numbered: boolean;
};

function dimension(value: string | undefined, quad?: number) {
  const match = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*(in|cm|mm|pt|bp|pc|sp|dd|cc|em)$/.exec(
    value ?? '',
  );
  if (!match) return;
  const units: Record<string, number> = {
    in: inch,
    cm: 10 * millimeter,
    mm: millimeter,
    pt: texPoint,
    bp: inch / 72,
    pc: texPoint * 12,
    sp: texPoint / 65536,
    dd: (texPoint * 1238) / 1157,
    cc: (texPoint * 12 * 1238) / 1157,
    em: quad ?? NaN,
  };
  const length = Number(match[1]) * (units[match[2]!] ?? 0);
  if (Number.isFinite(length)) return length;
}

function readOptions(prefix: string) {
  const source = prefix.replace(/(?<!\\)%[^\n]*/g, '');
  const classOptions = /\\documentclass\s*(?:\[([^\]]*)\])?/.exec(source)?.[1] ?? '';
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
  for (const value of [...classOptions.split(',').map((item) => item.trim()), ...geometryOptions]) {
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
  return dimension(measure, quad);
}

function packageOptions(source: string, position: number, name: string) {
  const match = /\\usepackage\s*(?:\[([^\]]*)\])?\s*\{([^{}]*)\}/y;
  match.lastIndex = position;
  const found = match.exec(source);
  if (!found || !found[2]!.split(',').some((entry) => entry.trim() === name)) return;
  return { options: found[1] ?? '', end: match.lastIndex };
}

function paragraphLengths(source: string, quad: number, defaultIndent: number, leading: number) {
  const lengths = { parindent: defaultIndent, parskip: 0 };
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
export function latexPageLayout(prefix: string): LatexPageLayout {
  const { source, geometry, geometryOptions, paperSize, orientation, fontSize, classOptions } =
    readOptions(prefix);
  const landscape = orientation === 'landscape';
  const paper = paperSizes.get(paperSize ?? 'letterpaper')!;
  let [width, height] = landscape ? [paper[1]!, paper[0]!] : [paper[0]!, paper[1]!];
  const leading = (fontSize === 12 ? 14.5 : fontSize === 11 ? 13.6 : 12) * texPoint;
  const font = (fontSize === 11 ? 10.95 : fontSize) * texPoint;
  // Standard Computer Modern classes set lengths using the font's quad.
  const quad = (fontSize === 12 ? 11.74988 : fontSize === 11 ? 10.95003 : 10) * texPoint;
  const twoColumns = classOptions
    .split(',')
    .map((part) => part.trim())
    .includes('twocolumn');
  const defaultIndent = twoColumns
    ? quad
    : fontSize === 12
      ? 1.5 * quad
      : (fontSize === 11 ? 17 : 15) * texPoint;
  const paragraphs = paragraphLengths(source, quad, defaultIndent, leading);

  const sizes = new Map(
    geometryOptions.map((option) => {
      const [name, value] = option.split('=');
      return [name?.trim(), value?.trim()] as const;
    }),
  );
  const paperWidth = dimension(sizes.get('paperwidth'));
  const paperHeight = dimension(sizes.get('paperheight'));
  if (paperWidth && paperWidth > 0) width = paperWidth;
  if (paperHeight && paperHeight > 0) height = paperHeight;

  const classWidth = (fontSize === 12 ? 390 : fontSize === 11 ? 360 : 345) * texPoint;
  const body = Math.max(
    leading,
    Math.floor((height - 3.5 * inch) / leading) * leading + fontSize * texPoint,
  );
  const classTop = inch + (height - 2 * inch - 67 * texPoint - body) / 2 + 37 * texPoint;
  const standardSide = Math.max(0, (width - Math.min(classWidth, width - 2 * inch)) / 2);

  let left = geometry ? width * 0.15 : standardSide;
  let right = left;
  let top = geometry ? height * 0.12 : classTop;
  let bottom = geometry ? height * 0.18 : height - classTop - body;
  // Geometry options are ordered. In particular, margin applies to all four sides.
  const explicit = new Map<string, number>();
  for (const option of geometryOptions) {
    const [raw, value] = option.split('=');
    const name = raw?.trim();
    const length = dimension(value?.trim());
    if (length === undefined || length < 0) continue;
    if (name === 'margin' || name === 'left' || name === 'inner') explicit.set('left', length);
    if (name === 'margin' || name === 'right' || name === 'outer') explicit.set('right', length);
    if (name === 'margin' || name === 'top') explicit.set('top', length);
    if (name === 'margin' || name === 'bottom') explicit.set('bottom', length);
  }
  const horizontal =
    dimension(sizes.get('textwidth')) ?? dimension(sizes.get('width')) ?? width * 0.7;
  const vertical =
    dimension(sizes.get('textheight')) ?? dimension(sizes.get('height')) ?? height * 0.7;
  if (geometry) {
    left = right = Math.max(0, (width - horizontal) / 2);
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
  return {
    width,
    height,
    left,
    right,
    top,
    bottom,
    gap: 24,
    fontSize: font,
    leading,
    firstBaseline: fontSize * texPoint,
    footerBaseline: height - bottom + (dimension(sizes.get('footskip')) ?? 30 * texPoint),
    paragraphIndent: paragraphs.parindent,
    paragraphSpacing: paragraphs.parskip,
    numbered: !/\\(?:pagestyle\s*\{empty\}|pagenumbering\s*\{gobble\})/.test(source),
  };
}

/**
 * A line or unbreakable block in the continuous editor. `notes` are the heights of footnotes
 * whose marks it holds; they print at the foot of the same page and take room from its body.
 */
export type PageLine = { position: number; top: number; bottom: number; notes?: number[] };
export type PageBlock = PageLine & {
  split?: () => PageLine[];
  force?: boolean;
};
export type PageBreak = { position: number; height: number };

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
) {
  const breaks: PageBreak[] = [];
  const footnotes: number[] = [];
  const footHeights: number[] = [0];
  let start = 0;
  let pages = 1;
  let occupied = false;
  let forced = false;
  // Spacers carry the page's unused body, including the room its footnotes take.
  let notes = 0;
  const room = (line: PageLine) => {
    const extra = (line.notes ?? []).reduce((sum, height) => sum + height, 0);
    if (!extra) return notes;
    return notes + extra + (notes ? 0 : noteGap);
  };
  const fits = (line: PageLine) => line.bottom - start + room(line) <= bodyHeight;
  function place(line: PageLine) {
    notes = room(line);
    for (const _ of line.notes ?? []) footnotes.push(pages - 1);
    footHeights[pages - 1] = notes;
  }
  function advance(line: PageLine) {
    // The next page has the same body capacity, even after a short previous page.
    const stride = bodyHeight + spacing;
    const distance = line.top - start;
    const advanceBy = Math.max(1, Math.floor((distance + notes) / stride) + 1);
    breaks.push({
      position: line.position,
      height: advanceBy * stride - distance,
    });
    pages += advanceBy;
    for (let page = footHeights.length; page < pages; page++) footHeights.push(0);
    start = line.top;
    occupied = false;
    notes = 0;
  }
  for (const block of blocks) {
    if (block.force) {
      forced ||= occupied;
      continue;
    }
    if (forced) {
      advance(block);
      forced = false;
    }
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
  return { breaks, pages, footnotes, footHeights };
}
