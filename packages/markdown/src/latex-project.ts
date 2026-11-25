import type { Node } from 'prosemirror-model';
import { commandEnd, documentBody, groupAt, latexCommands, whitespaceEnd } from './latex-syntax';

export type LatexProject = { entry: string; files: Record<string, string> };

export function isLatexProjectPath(path: string) {
  return !/[\\\u0000-\u001f\u007f]/.test(path) &&
    path.split('/').every(part => part && part !== '.' && part !== '..');
}

export function validateLatexProject(value: unknown) {
  if (value === null) return;
  if (!value || typeof value !== 'object' || !('entry' in value) ||
    typeof value.entry !== 'string' || !isLatexProjectPath(value.entry) ||
    !('files' in value) || !value.files || typeof value.files !== 'object' || Array.isArray(value.files) ||
    Object.entries(value.files).some(([path, text]) => !isLatexProjectPath(path) || typeof text !== 'string'))
    throw new RangeError('Invalid LaTeX project sources.');
}

export function latexProjectEntry(files: ReadonlyMap<string, string>) {
  const roots = [...files].filter(([path, text]) => /\.tex$/i.test(path) && !!documentBody(text)).map(([path]) => path);
  if (roots.length === 1) return roots[0];
  const conventional = roots.filter(path => /(?:^|\/)main\.tex$/i.test(path));
  if (conventional.length === 1) return conventional[0];
  throw new RangeError(roots.length
    ? 'This archive has multiple main LaTeX files. Name the intended entry main.tex.'
    : 'This archive has no complete LaTeX document.');
}

export function resolveLatexProjectPath(from: string, path: string) {
  if (path.startsWith('/') || /[\\\u0000-\u001f\u007f]/.test(path)) return;
  const directory = from.slice(0, Math.max(0, from.lastIndexOf('/')));
  const parts = directory ? directory.split('/') : [];
  for (const part of path.split('/')) {
    if (part === '..') {
      if (!parts.length) return;
      parts.pop();
    } else if (part && part !== '.') parts.push(part);
  }
  return parts.join('/');
}

export function latexProjectFile(
  files: ReadonlyMap<string, string>,
  entry: string,
  from: string,
  name: string,
  extension: string,
) {
  const withExtension = name.endsWith(extension) ? name : name + extension;
  for (const source of [entry, from]) {
    const path = resolveLatexProjectPath(source, withExtension);
    if (path && files.has(path)) return path;
  }
}

export function readLatexInclude(source: string, start: number) {
  const end = commandEnd(source, start);
  const command = source.slice(start, end);
  if (command !== '\\input' && command !== '\\include') return;
  const group = groupAt(source, whitespaceEnd(source, end));
  if (!group) return;
  const name = source.slice(group.from, group.to).trim();
  if (name && !/[{}\\%#]/.test(name)) return { name, end: group.end };
}

/** Interpret literal definitions in local preamble files without evaluating arbitrary TeX. */
export function resolveLatexProjectPrefix(
  prefix: string,
  entry: string,
  files: ReadonlyMap<string, string>,
) {
  const active = new Set<string>([entry]);
  function expand(source: string, from: string, inheritedOptions?: string) {
    let output = '';
    let cursor = 0;
    for (const { name, start, end } of latexCommands(source)) {
      if (start < cursor) continue;
      const isClass = name === 'documentclass' || name === 'LoadClass' || name === 'LoadClassWithOptions';
      const isPackage = name === 'usepackage' || name === 'RequirePackage' || name === 'RequirePackageWithOptions';
      if (!isClass && !isPackage && name !== 'input' && name !== 'endinput') continue;
      if (name === 'endinput') return output + source.slice(cursor, start);
      const first = whitespaceEnd(source, end);
      const option = groupAt(source, first, '[', ']');
      const arg = groupAt(source, whitespaceEnd(source, option?.end ?? first));
      if (!arg) continue;
      output += source.slice(cursor, start);
      const settings = option
        ? source.slice(option.from, option.to)
        : name.endsWith('WithOptions') ? inheritedOptions : undefined;
      const extension = isClass ? '.cls' : isPackage ? '.sty' : '.tex';
      const argument = source.slice(arg.from, arg.to);
      for (const specifier of isPackage ? argument.split(',') : [argument]) {
        const path = latexProjectFile(files, entry, from, specifier.trim(), extension);
        if (path && !active.has(path)) {
          active.add(path);
          output += '\n' + expand(files.get(path)!, path, name === 'input' ? inheritedOptions : settings) + '\n';
          active.delete(path);
        } else if (!path) {
          const command = isClass ? 'documentclass' : isPackage ? 'usepackage' : 'input';
          output += '\\' + command + (settings === undefined ? '' : '[' + settings + ']') + '{' + specifier + '}\n';
        }
      }
      cursor = arg.end;
    }
    return output + source.slice(cursor);
  }
  return expand(prefix, entry);
}

const effective = new WeakMap<LatexProject, { authored: string; resolved: string }>();

export function latexEffectivePrefix(document: Node) {
  const prefix = String(document.attrs.prefix ?? '');
  const project: LatexProject | null = document.attrs.latexProject ?? null;
  if (!project) return prefix;
  const cached = effective.get(project);
  if (cached?.authored === prefix) return cached.resolved;
  const resolved = resolveLatexProjectPrefix(prefix, project.entry, new Map(Object.entries(project.files)));
  effective.set(project, { authored: prefix, resolved });
  return resolved;
}
