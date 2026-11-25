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
  return { loaded: declarations.length > 0, options: options.slice(options.lastIndexOf('reset') + 1) };
}

type GeometryChange = {
  paperSize?: string | undefined;
  orientation?: string | undefined;
  margin?: string | undefined;
};

function optionKind(option: string): keyof GeometryChange | undefined {
  const key = option.split('=')[0]?.trim() ?? '';
  if (key === 'paper' || latexPaperSizes.has(key)) return 'paperSize';
  if (key === 'landscape' || key === 'portrait') return 'orientation';
  if (key === 'margin') return 'margin';
}

function changeOptions(options: string[], change: GeometryChange) {
  const changes = [
    ['paperSize', change.paperSize, change.paperSize],
    ['orientation', change.orientation, change.orientation],
    ['margin', change.margin, change.margin && 'margin=' + change.margin],
  ] as const;
  for (const [kind, value, replacement] of changes) {
    if (value === undefined) continue;
    const last = options.findLastIndex(item => optionKind(item) === kind);
    const inPlace = last > options.lastIndexOf('reset') && (kind !== 'margin' || last === options.length - 1);
    options = options.flatMap((item, index) =>
      optionKind(item) !== kind ? [item] : replacement && inPlace && index === last ? [replacement] : [],
    );
    if (replacement && !inPlace) options.push(replacement);
  }
  return options;
}

function geometryPackage(name: string, options: string[]) {
  return '\\' + (name === 'RequirePackage' ? name : 'usepackage') +
    (options.length ? '[' + options.join(',') + ']' : '') + '{geometry}';
}

/** Update page settings in the geometry package, folding in safe legacy preamble overrides. */
export function setLatexGeometry(prefix: string, change: GeometryChange, currentPaperSize?: string) {
  const declarations = geometryDeclarations(prefix);
  const newline = /\r\n|\n/.exec(prefix)?.[0] ?? '\n';
  // Imported overrides may depend on lengths defined after the package loads. A reset also
  // has to stay at its original position because it starts a new sequence of settings.
  const preserveOverrides = declarations.some(item =>
    item.name === 'geometry' && item.options.some(option => option.includes('\\') || option === 'reset'),
  );
  const existing = preserveOverrides
    ? declarations.findLast(item => item.name === 'geometry')
    : declarations.find(item => item.name !== 'geometry') ?? declarations[0];

  if (existing) {
    const cleared: GeometryChange = {
      paperSize: change.paperSize === '' ? '' : undefined,
      orientation: change.orientation === '' ? '' : undefined,
      margin: change.margin === '' ? '' : undefined,
    };
    const consolidated = preserveOverrides ? [] : changeOptions(declarations.flatMap(item => item.options), change);
    for (const item of declarations.reverse()) {
      let replacement = item.others;
      if (preserveOverrides) {
        const options = changeOptions(item.options, item === existing ? change : cleared);
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
  const options = changeOptions(change.paperSize === undefined && currentPaperSize ? [currentPaperSize] : [], change);
  return options.length ? withLatexPackage(prefix, 'geometry', prefix, options) : prefix;
}
