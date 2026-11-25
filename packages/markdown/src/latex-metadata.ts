import type { Node } from 'prosemirror-model';
import { argumentAt, commandEnd, groupAt, latexCommands, lineEnd, verbatimEnd } from './latex-syntax';

/** The argument of a preamble command, with offsets into the preamble source. */
export type LatexCommandArgument = {
  from: number;
  to: number;
  source: string;
  line: number;
};

const opener = /^[ \t]*\\begin\s*\{document\}/m;

/**
 * Find the effective top-level `\name{…}` in a preamble. TeX uses the last definition, so this
 * does too. Comments, verbatim and groups such as macro bodies are skipped.
 */
export function latexPreambleCommand(
  prefix: string,
  name: string,
): LatexCommandArgument | undefined {
  let found: LatexCommandArgument | undefined;
  for (let position = 0; position < prefix.length; position++) {
    const character = prefix[position];
    if (character === '%') position = lineEnd(prefix, position);
    else if (character === '{') position = (groupAt(prefix, position)?.end ?? prefix.length) - 1;
    else if (character === '\\') {
      const end = commandEnd(prefix, position);
      const command = prefix.slice(position + 1, end);
      if (command === 'verb') {
        position = verbatimEnd(prefix, end) - 1;
        continue;
      }
      if (command === name) {
        const group = argumentAt(prefix, end);
        if (group) {
          found = {
            from: group.from,
            to: group.to,
            source: prefix.slice(group.from, group.to),
            line: prefix.slice(0, position).split('\n').length,
          };
          position = group.end - 1;
          continue;
        }
      }
      position = end - 1;
    }
  }
  return found;
}

export type LatexTitleField = 'title' | 'author' | 'date';

/** Standard title setters can execute before or after the document begins. */
export function readLatexTitleSetter(
  source: string, start = 0,
): { field: LatexTitleField; argument: NonNullable<ReturnType<typeof argumentAt>>; source: string } | undefined {
  const end = commandEnd(source, start);
  const field = source.slice(start + 1, end);
  if (field !== 'title' && field !== 'author' && field !== 'date') return;
  const argument = argumentAt(source, end);
  if (argument) return { field, argument, source: source.slice(argument.from, argument.to) };
}

type TitleArgument = { kind: 'preamble'; source: string } |
  { kind: 'body'; source: string; position: number; from: number; to: number };

/** The last setters executed before a standard title block, in authored order. */
export function latexTitleArguments(document: Node, before = document.content.size) {
  const fields = new Map<LatexTitleField, TitleArgument>();
  for (const field of ['title', 'author', 'date'] as const) {
    const argument = latexPreambleCommand(String(document.attrs.prefix ?? ''), field);
    if (argument) fields.set(field, { kind: 'preamble', source: argument.source });
  }
  document.descendants((node, position) => {
    if (position >= before || node.isTextblock) return false;
    if (node.type.name !== 'latex_raw') return node.type.name === 'latex_include';
    const setter = readLatexTitleSetter(String(node.attrs.source));
    if (setter)
      fields.set(setter.field, {
        kind: 'body', source: setter.source, position,
        from: setter.argument.from, to: setter.argument.to,
      });
    return false;
  });
  return fields;
}

/** Replace the effective `\name{…}` argument, or add the command before `\begin{document}`. */
export function setLatexPreambleCommand(prefix: string, name: string, source: string) {
  const current = latexPreambleCommand(prefix, name);
  if (current) return prefix.slice(0, current.from) + source + prefix.slice(current.to);
  if (!opener.test(prefix)) throw new Error('This file has no preamble.');
  const newline = /\r\n|\n/.exec(prefix)?.[0] ?? '\n';
  return prefix.replace(opener, (begin) => '\\' + name + '{' + source + '}' + newline + begin);
}

const plainEscapes = new Set(['&', '%', '$', '#', '_']);
const token = /\\(?:[A-Za-z@]+|[^A-Za-z@]?)|[&%$#_^]/g;

/**
 * Show a preamble argument as text a writer can edit. Commands such as `\today` stay visible.
 * Returns undefined when the argument cannot be shown as text and written back unchanged.
 */
export function latexFieldText(source: string) {
  const text = source.replace(/\\textasciicircum\{\}|\\(?:[A-Za-z@]+|[^A-Za-z@]?)/g, (value) =>
    value === '\\textasciicircum{}'
      ? '^'
      : value.length === 2 && plainEscapes.has(value[1]!)
        ? value[1]!
        : value,
  );
  return latexFieldSource(text, false) === source ? text : undefined;
}

/**
 * Write field text as a TeX argument. Plain special characters are escaped; commands typed
 * with a backslash, such as `\today` or `\\`, are kept so expert input survives.
 */
export function latexFieldSource(text: string, validate = true) {
  const source = text.replace(token, (value) => {
    if (value === '\\') return '\\textbackslash{}';
    if (value === '^') return '\\textasciicircum{}';
    return plainEscapes.has(value) ? '\\' + value : value;
  });
  if (validate && !balanced(source)) throw new Error('Use matching { and } braces.');
  return source;
}

function balanced(source: string) {
  let depth = 0;
  for (let position = 0; position < source.length; position++) {
    if (source[position] === '\\') position = commandEnd(source, position) - 1;
    else if (source[position] === '{') depth++;
    else if (source[position] === '}' && --depth < 0) return false;
  }
  return depth === 0;
}

/** Keep the actual author text and its separators while displaying the authors side by side. */
export function latexAuthorGroups(source: string) {
  const parts: { text: string; separator: boolean }[] = [];
  let position = 0;
  for (const command of latexCommands(source)) {
    if (command.name !== 'and') continue;
    parts.push({ text: source.slice(position, command.start), separator: false });
    parts.push({ text: source.slice(command.start, command.end), separator: true });
    position = command.end;
  }
  if (position) {
    parts.push({ text: source.slice(position), separator: false });
    return parts;
  }
}
