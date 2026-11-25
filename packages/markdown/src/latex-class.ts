import { groupAt, latexCommands, whitespaceEnd } from './latex-syntax';

export function readLatexClass(source: string): { name: string; options: string[] } {
  for (const { name, end } of latexCommands(source)) {
    if (name !== 'documentclass') continue;
    const start = whitespaceEnd(source, end);
    const optional = groupAt(source, start, '[', ']');
    const required = groupAt(source, whitespaceEnd(source, optional?.end ?? start));
    if (required) {
      return {
        name: source.slice(required.from, required.to).trim(),
        options: optional
          ? source
              .slice(optional.from, optional.to)
              .replace(/(?<!\\)%[^\r\n]*/g, '')
              .split(',')
              .map((option) => option.trim())
          : [],
      };
    }
  }
  return { name: 'article', options: [] };
}

const standardSizes = [10, 11, 12] as const;
const extendedSizes = [8, 9, 10, 11, 12, 14, 17, 20] as const;
export type LatexBaseSize = (typeof extendedSizes)[number];

export function latexBaseClass(name: string) {
  return /^ext(?:article|report|book|letter)$/.test(name) ? name.slice(3) : name;
}

export function latexBaseSizeOptions(name: string): readonly LatexBaseSize[] {
  if (/^ext(?:article|report|book|letter)$/.test(name)) return extendedSizes;
  if (/^(?:article|report|book|letter)$/.test(name)) return standardSizes;
  return [];
}

/** The class option number can differ from the actual font size, such as 11pt selecting 10.95pt. */
export function latexBaseSize(prefix: string): LatexBaseSize {
  const { name, options } = readLatexClass(prefix);
  const sizes = latexBaseSizeOptions(name);
  // These classes process size options in declaration order, independent of their order in the source.
  return (sizes.length ? sizes : standardSizes).findLast((size) => options.includes(size + 'pt')) ?? (name === 'beamer' ? 11 : 10);
}

/** Change only size options, preserving other options and comments. */
export function setLatexBaseSize(prefix: string, size: LatexBaseSize, effectivePrefix = prefix) {
  const { name } = readLatexClass(effectivePrefix);
  if (!latexBaseSizeOptions(name).includes(size)) throw new Error('This class does not support that document size.');
  for (const command of latexCommands(prefix)) {
    if (command.name !== 'documentclass') continue;
    const at = whitespaceEnd(prefix, command.end);
    const options = groupAt(prefix, at, '[', ']');
    if (!options) return prefix.slice(0, command.end) + '[' + size + 'pt]' + prefix.slice(command.end);
    const authored = prefix.slice(options.from, options.to);
    const sizeToken = /((?:^|,)\s*(?:(?:%[^\r\n]*)(?:\r\n|\n)\s*)*)(?:8|9|10|11|12|14|17|20)pt(?=\s*(?:%[^\r\n]*\s*)*(?:,|$))/g;
    let replaced = false;
    const next = authored.replace(sizeToken, (_match, before: string) => {
      replaced = true;
      return before + size + 'pt';
    });
    return prefix.slice(0, options.from) + (replaced ? next : size + 'pt' + (authored.trim() ? ',' : '') + authored) + prefix.slice(options.to);
  }
  throw new Error('Change the size in the project file that declares the class.');
}
