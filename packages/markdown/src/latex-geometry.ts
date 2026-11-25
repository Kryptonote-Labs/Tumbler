import { readLatexClass } from './latex-flow';
import { latexLength } from './latex-lengths';
import { withLatexPackage } from './latex-preamble';
import { commandEnd, groupAt, latexCommands, lineEnd, whitespaceEnd } from './latex-syntax';

export const latexPaperSizes = new Map<string, [number, number]>([
  ['letterpaper', [8.5 * 96, 11 * 96]],
  ['a4paper', [210 * (96 / 25.4), 297 * (96 / 25.4)]],
  ['a5paper', [148 * (96 / 25.4), 210 * (96 / 25.4)]],
  ['legalpaper', [8.5 * 96, 14 * 96]],
  ['a3paper', [297 * (96 / 25.4), 420 * (96 / 25.4)]],
  ['b5paper', [176 * (96 / 25.4), 250 * (96 / 25.4)]],
  ['executivepaper', [7.25 * 96, 10.5 * 96]],
]);

function splitOptions(source: string) {
  const options: string[] = [];
  let start = 0;
  let option = '';
  for (let at = 0; at <= source.length; at++) {
    const token = source[at];
    if (token === '\\') at = commandEnd(source, at) - 1;
    else if (token === '{') at = (groupAt(source, at)?.end ?? source.length) - 1;
    else if (token === '%') {
      option += source.slice(start, at);
      at = lineEnd(source, at);
      start = at + 1;
      if (at === source.length) at--;
    } else if (token === ',' || token === undefined) {
      const value = (option + source.slice(start, at)).trim();
      if (value) options.push(value);
      option = '';
      start = at + 1;
    }
  }
  return options;
}

function geometryDeclarations(prefix: string) {
  const declarations = [];
  for (const command of latexCommands(prefix)) {
    const at = whitespaceEnd(prefix, command.end);
    if (command.name === 'begin' && prefix.slice(at, at + 10) === '{document}') break;
    if (command.name === 'geometry') {
      const group = groupAt(prefix, at);
      if (group) declarations.push({ ...command, end: group.end, options: splitOptions(prefix.slice(group.from, group.to)), others: '' });
    } else if (command.name === 'usepackage' || command.name === 'RequirePackage') {
      const optional = groupAt(prefix, at, '[', ']');
      const group = groupAt(prefix, optional ? whitespaceEnd(prefix, optional.end) : at);
      if (!group) continue;
      const names = splitOptions(prefix.slice(group.from, group.to));
      if (!names.includes('geometry')) continue;
      const others = names.filter(name => name !== 'geometry');
      declarations.push({
        ...command,
        end: group.end,
        options: optional ? splitOptions(prefix.slice(optional.from, optional.to)) : [],
        others: others.length ? prefix.slice(command.start, group.from) + others.join(',') + '}' : '',
      });
    }
  }
  return declarations;
}

export function readGeometry(prefix: string) {
  const declarations = geometryDeclarations(prefix);
  const options = declarations.flatMap(item => item.options);
  return { loaded: declarations.some(item => item.name !== 'geometry'), options: options.slice(options.findLastIndex(isReset) + 1) };
}

const aliases = new Map([
  ['inner', 'left'], ['lmargin', 'left'], ['innermargin', 'left'],
  ['outer', 'right'], ['rmargin', 'right'], ['outermargin', 'right'],
  ['tmargin', 'top'], ['bmargin', 'bottom'],
  ['totalwidth', 'width'], ['totalheight', 'height'], ['body', 'text'],
  ['hratio', 'hmarginratio'], ['vratio', 'vmarginratio'], ['ratio', 'marginratio'],
  ['layoutname', 'layout'], ['head', 'headheight'], ['foot', 'footskip'],
]);

export function geometryOption(option: string): [key: string, value: string] {
  const separator = option.indexOf('=');
  const key = (separator < 0 ? option : option.slice(0, separator)).trim();
  const value = separator < 0 ? 'true' : option.slice(separator + 1).trim();
  const group = groupAt(value, 0);
  return [aliases.get(key) ?? key, group?.end === value.length ? value.slice(1, -1).trim() : value];
}

export function geometryPair(value: string) {
  const [first = '', second = first] = splitOptions(value);
  return [first, second] as const;
}

export const latexMarginSides = ['top', 'bottom', 'left', 'right'] as const;
export type LatexMargins = Record<(typeof latexMarginSides)[number], string>;

export type GeometryChange = {
  paperSize?: string | undefined;
  orientation?: string | undefined;
  margin?: string | undefined;
  /** Physical margins in one-sided documents and odd-page margins in two-sided documents. */
  margins?: LatexMargins | null | undefined;
  twoSided?: boolean | undefined;
  bindingOffset?: string | undefined;
};

const marginKeys = new Set([
  ...latexMarginSides, 'margin', 'hmargin', 'vmargin', 'textwidth', 'textheight', 'width', 'height',
  'text', 'total', 'lines', 'hscale', 'vscale', 'scale', 'hdivide', 'vdivide', 'divide',
]);
export function hasExplicitMargins(options: string[]) {
  return options.some(option => marginKeys.has(geometryOption(option)[0]));
}
const sideKeys = new Set(['twoside', 'oneside', 'asymmetric']);
const isReset = (option: string) => /^reset(?:\s*=\s*true)?$/.test(option);

function optionKind(option: string): keyof GeometryChange | undefined {
  const [key] = geometryOption(option);
  if (key === 'paper' || key === 'paperwidth' || key === 'paperheight' || key === 'papersize' || latexPaperSizes.has(key)) return 'paperSize';
  if (key === 'landscape' || key === 'portrait') return 'orientation';
  if (key === 'margin') return 'margin';
  if (marginKeys.has(key)) return 'margins';
  if (sideKeys.has(key)) return 'twoSided';
  if (key === 'bindingoffset') return 'bindingOffset';
}

function marginOptions(margins: LatexMargins | null | undefined, twoSided: boolean) {
  if (!margins) return [];
  const values = latexMarginSides.map(side => margins[side].trim());
  if (values.every(value => value === values[0])) return ['margin=' + values[0]];
  return latexMarginSides.map((side, index) => {
    const key = twoSided && side === 'left' ? 'inner' : twoSided && side === 'right' ? 'outer' : side;
    return key + '=' + values[index];
  });
}

function changeOptions(options: string[], change: GeometryChange, twoSided: boolean) {
  for (const [kind, replacement] of [
    ['paperSize', change.paperSize && [change.paperSize]],
    ['orientation', change.orientation && [change.orientation]],
    ['margin', change.margin && ['margin=' + change.margin]],
    ['margins', change.margins === undefined ? undefined : marginOptions(change.margins, twoSided)],
    ['bindingOffset', change.bindingOffset && ['bindingoffset=' + change.bindingOffset]],
    ['twoSided', change.twoSided === undefined ? undefined : []],
  ] as const) {
    if (replacement === undefined) continue;
    const matches = (option: string) => {
      const actual = optionKind(option);
      return actual === kind || (kind === 'margins' && actual === 'margin');
    };
    const last = options.findLastIndex(matches);
    const reset = options.findLastIndex(isReset);
    const inPlace = last > reset && (kind !== 'margin' || last === options.length - 1);
    options = options.flatMap((option, index) =>
      !matches(option) ? [option] : inPlace && index === last && replacement ? replacement : [],
    );
    if (replacement && !inPlace) options.push(...replacement);
  }
  return options;
}

export function geometrySides(documentClass: string, classOptions: string[], options: string[]) {
  // The standard classes process twoside after oneside, regardless of their source order.
  let twoSided = classOptions.includes('twoside') ||
    (documentClass === 'book' && !classOptions.includes('oneside'));
  let mirror = twoSided;
  for (const option of options) {
    const [key, value] = geometryOption(option);
    if (key === 'twoside') twoSided = mirror = value === 'true';
    if (key === 'asymmetric' && value === 'true') {
      twoSided = true;
      mirror = false;
    }
  }
  return { twoSided, mirror };
}

function setClassSides(prefix: string, twoSided: boolean) {
  for (const command of latexCommands(prefix)) {
    if (command.name !== 'documentclass') continue;
    const start = whitespaceEnd(prefix, command.end);
    const group = groupAt(prefix, start, '[', ']');
    const options = group ? splitOptions(prefix.slice(group.from, group.to)) : [];
    const name = groupAt(prefix, whitespaceEnd(prefix, group?.end ?? start));
    if (!name) break;
    const book = prefix.slice(name.from, name.to).trim() === 'book';
    const next = options.filter(option => !sideKeys.has(geometryOption(option)[0]));
    if (twoSided) next.push('twoside');
    else if (book) next.push('oneside');
    if (next.join(',') === options.join(',')) return prefix;
    return prefix.slice(0, start) + (next.length ? '[' + next.join(',') + ']' : '') +
      prefix.slice(group?.end ?? start);
  }
  throw new Error('Page sides require a document class.');
}

function geometryPackage(name: string, options: string[]) {
  return '\\' + (name === 'RequirePackage' ? name : 'usepackage') +
    (options.length ? '[' + options.join(',') + ']' : '') + '{geometry}';
}

/** Update page settings in the geometry package, folding in safe legacy preamble overrides. */
export function writeLatexGeometry(prefix: string, change: GeometryChange, currentPaperSize?: string) {
  if (change.margins && Object.values(change.margins).some(value => latexLength(value) === undefined))
    throw new Error('Enter a measurement such as 2cm or 1in.');
  if (change.bindingOffset && !((latexLength(change.bindingOffset) ?? -1) >= 0))
    throw new Error('Enter a nonnegative gutter, such as 5mm.');
  if (change.twoSided !== undefined) prefix = setClassSides(prefix, change.twoSided);
  const declarations = geometryDeclarations(prefix);
  const { name, options } = readLatexClass(prefix);
  const { twoSided } = geometrySides(name, options, readGeometry(prefix).options);
  const mirror = change.twoSided ?? twoSided;
  const newline = /\r\n|\n/.exec(prefix)?.[0] ?? '\n';
  // Imported overrides may depend on lengths defined after the package loads. A reset also
  // has to stay at its original position because it starts a new sequence of settings.
  const preserveOverrides = declarations.some(item =>
    item.name === 'geometry' && item.options.some(option => option.includes('\\') || isReset(option)),
  );
  const existing = preserveOverrides
    ? declarations.findLast(item => item.name === 'geometry')
    : declarations.find(item => item.name !== 'geometry') ?? declarations[0];

  if (existing) {
    const cleared: GeometryChange = {
      paperSize: change.paperSize === '' ? '' : undefined,
      orientation: change.orientation === '' ? '' : undefined,
      margin: change.margin === '' ? '' : undefined,
      margins: change.margins === null ? null : undefined,
      bindingOffset: change.bindingOffset === '' ? '' : undefined,
      twoSided: change.twoSided,
    };
    const consolidated = preserveOverrides ? [] : changeOptions(declarations.flatMap(item => item.options), change, mirror);
    for (const item of declarations.reverse()) {
      let replacement = item.others;
      if (preserveOverrides) {
        const options = changeOptions(item.options, item === existing ? change : cleared, mirror);
        if (options.join(',') === item.options.join(',')) continue;
        if (item.name === 'geometry') replacement = options.length ? '\\geometry{' + options.join(',') + '}' : '';
        else replacement = [item.others, geometryPackage(item.name, options)].filter(Boolean).join(newline);
      } else if (item === existing) {
        replacement = [item.others, geometryPackage(item.name, consolidated)].filter(Boolean).join(newline);
      }
      const end = item.end + (replacement ? 0 : /^[ \t]*\r?\n/.exec(prefix.slice(item.end))?.[0].length ?? 0);
      prefix = prefix.slice(0, item.start) + replacement + prefix.slice(end);
    }
    return prefix;
  }
  const next = changeOptions([], change, mirror);
  if (!next.length) return prefix;
  if (change.paperSize === undefined && currentPaperSize) next.unshift(currentPaperSize);
  return withLatexPackage(prefix, 'geometry', prefix, next);
}
