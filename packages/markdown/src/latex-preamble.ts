import { groupAt, latexCommands, whitespaceEnd } from './latex-syntax';

type Package = { name: string; options: string[]; offset: number };

function options(source: string) {
  return source.replace(/(?<!\\)%[^\r\n]*/g, '').split(',').map(option => option.trim());
}

export function readLatexPackages(prefix: string): Package[] {
  const declarations: Package[] = [];
  const passed = new Map<string, string[]>();
  for (const command of latexCommands(prefix)) {
    const at = whitespaceEnd(prefix, command.end);
    if (command.name === 'PassOptionsToPackage') {
      const setting = groupAt(prefix, at);
      const name = setting && groupAt(prefix, whitespaceEnd(prefix, setting.end));
      if (setting && name) {
        const key = prefix.slice(name.from, name.to).trim();
        passed.set(key, [...(passed.get(key) ?? []), ...options(prefix.slice(setting.from, setting.to))]);
      }
      continue;
    }
    if (command.name !== 'usepackage' && command.name !== 'RequirePackage') continue;
    const optional = groupAt(prefix, at, '[', ']');
    const names = groupAt(prefix, optional ? whitespaceEnd(prefix, optional.end) : at);
    if (!names) continue;
    const settings = optional ? options(prefix.slice(optional.from, optional.to)) : [];
    for (const name of options(prefix.slice(names.from, names.to))) {
      if (name && !declarations.some(item => item.name === name))
        declarations.push({ name, options: [...(passed.get(name) ?? []), ...settings], offset: command.start });
    }
  }
  return declarations;
}

export function usesLatexPackage(prefix: string, name: string) {
  return readLatexPackages(prefix).some(item => item.name === name);
}

const dependencies = new Map<string, readonly string[]>([
  ['pgf', ['graphicx', 'xcolor']],
  ['tikz', ['pgf']],
  ['pgfplots', ['tikz']],
  ['tcolorbox', ['pgf']],
  ['siunitx', ['color']],
  ['bookmark', ['hyperref']],
  ['hyperref', ['url']],
]);
const drivers = new Set(['pdftex','dvips','dvipdfmx','xetex','luatex','tex4ht']);

/** Standard pdfTeX drivers set the PDF media to the class's paper at begin-document time. */
export function latexDriverUsesClassPaper(prefix: string, classOptions: readonly string[]) {
  const packages = readLatexPackages(prefix);
  for (const { name } of packages) {
    for (const dependency of dependencies.get(name) ?? [])
      if (!packages.some(item => item.name === dependency)) packages.push({ name: dependency, options: [], offset: 0 });
  }
  return packages.some(({ name, options }) => {
    if (!['graphics','graphicx','color','xcolor','hyperref'].includes(name)) return false;
    const settings = [...classOptions, ...options];
    const driver = settings.findLast(option => drivers.has(option));
    if (driver && driver !== 'pdftex') return false;
    const page = settings.findLast(option => /^(?:no)?setpagesize(?:\s*=.*)?$/.test(option));
    return page === undefined || (page.startsWith('setpagesize') && !/=\s*false$/.test(page));
  });
}


const defaultOptions = new Map([['ulem', 'normalem'], ['hyperref', 'hidelinks']]);

/** Insert one ordinary package declaration before the document opens. */
export function withLatexPackage(prefix: string, name: string) {
  if (!/^[a-z0-9-]+$/i.test(name)) throw new RangeError('Invalid LaTeX package name.');
  const loaded = new Set(readLatexPackages(prefix).map(item => item.name));
  for (const command of latexCommands(prefix)) {
    if (command.name !== 'documentclass') continue;
    const at = whitespaceEnd(prefix, command.end);
    const options = groupAt(prefix, at, '[', ']');
    const group = groupAt(prefix, options ? whitespaceEnd(prefix, options.end) : at);
    if (group && prefix.slice(group.from, group.to).trim() === 'beamer') {
      loaded.add('hyperref');
      loaded.add('xcolor');
    }
    break;
  }
  for (const item of loaded)
    for (const dependency of dependencies.get(item) ?? []) loaded.add(dependency);
  if (loaded.has(name)) return prefix;
  for (const command of latexCommands(prefix)) {
    if (command.name !== 'begin') continue;
    const group = groupAt(prefix, whitespaceEnd(prefix, command.end));
    if (!group || prefix.slice(group.from, group.to) !== 'document') continue;
    const newline = /\r\n|\n/.exec(prefix)?.[0] ?? '\n';
    const options = defaultOptions.get(name);
    const declaration = '\\usepackage' + (options ? '[' + options + ']' : '') + '{' + name + '}';
    const line = prefix.lastIndexOf('\n', command.start - 1) + 1;
    const at = /^\s*$/.test(prefix.slice(line, command.start)) ? line : command.start;
    const before = prefix.slice(0, at);
    return before + (at === line ? '' : newline) + declaration + newline + prefix.slice(at);
  }
  return prefix;
}
