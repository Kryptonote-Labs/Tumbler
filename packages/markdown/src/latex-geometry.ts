import { argumentAt, commandEnd, groupAt, latexCommands, lineEnd, whitespaceEnd } from './latex-syntax';

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

type GeometryChange = { paperSize?: string; orientation?: string; margin?: string };

function optionKind(option: string): keyof GeometryChange | undefined {
  const key = option.split('=')[0]?.trim() ?? '';
  if (key === 'paper' || latexPaperSizes.has(key)) return 'paperSize';
  if (key === 'landscape' || key === 'portrait') return 'orientation';
  if (key === 'margin') return 'margin';
}

/** Update page settings in the geometry package, folding in legacy preamble overrides. */
export function setLatexGeometry(prefix: string, change: GeometryChange, currentPaperSize?: string) {
  const declarations = geometryDeclarations(prefix);
  const options = declarations.flatMap(item => item.options).filter(option => {
    const kind = optionKind(option);
    return !kind || change[kind] === undefined;
  });
  if (change.paperSize) options.push(change.paperSize);
  else if (change.paperSize === undefined && currentPaperSize && !declarations.length)
    options.unshift(currentPaperSize);
  if (change.orientation) options.push(change.orientation);
  if (change.margin) options.push('margin=' + change.margin);
  const newline = /\r\n|\n/.exec(prefix)?.[0] ?? '\n';
  const existing = declarations.find(item => item.name !== 'geometry') ?? declarations[0];
  const declaration = '\\' + (existing?.name === 'RequirePackage' ? 'RequirePackage' : 'usepackage') +
    (options.length ? '[' + options.join(',') + ']' : '') + '{geometry}';

  if (existing) {
    for (const item of declarations.reverse()) {
      let end = item.end;
      let replacement = item.others;
      if (item === existing) replacement = replacement ? replacement + newline + declaration : declaration;
      else if (!replacement) end += /^[ \t]*\r?\n/.exec(prefix.slice(end))?.[0].length ?? 0;
      prefix = prefix.slice(0, item.start) + replacement + prefix.slice(end);
    }
    return prefix;
  }
  if (!options.length) return prefix;
  let insert = 0;
  for (const command of latexCommands(prefix)) {
    if (command.name !== 'documentclass' && command.name !== 'usepackage' && command.name !== 'RequirePackage') {
      if (insert || command.name === 'begin') break;
      continue;
    }
    const group = argumentAt(prefix, command.end);
    if (group) insert = group.end;
  }
  if (!insert) return declaration + newline + prefix;
  const end = lineEnd(prefix, insert);
  if (/^[ \t]*(?:%.*)?$/.test(prefix.slice(insert, end).trimEnd())) {
    insert = prefix[end - 1] === '\r' ? end - 1 : end;
    return prefix.slice(0, insert) + newline + declaration + prefix.slice(insert);
  }
  return prefix.slice(0, insert) + newline + declaration + newline + prefix.slice(insert);
}
