import { groupAt, latexCommands, whitespaceEnd } from './latex-syntax';

type Package = { name: string; options: string[] };

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
        declarations.push({ name, options: [...(passed.get(name) ?? []), ...settings] });
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
]);
const drivers = new Set(['pdftex','dvips','dvipdfmx','xetex','luatex','tex4ht']);

/** Standard pdfTeX drivers set the PDF media to the class's paper at begin-document time. */
export function latexDriverUsesClassPaper(prefix: string, classOptions: readonly string[]) {
  const packages = readLatexPackages(prefix);
  for (const { name } of packages) {
    for (const dependency of dependencies.get(name) ?? [])
      if (!packages.some(item => item.name === dependency)) packages.push({ name: dependency, options: [] });
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
