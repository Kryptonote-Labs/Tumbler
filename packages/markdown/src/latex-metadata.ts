import { argumentAt, commandEnd, groupAt, lineEnd, verbatimEnd } from './latex-syntax';

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
