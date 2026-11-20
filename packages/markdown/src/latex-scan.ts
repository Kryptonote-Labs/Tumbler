/** The index after the `}` that closes the group opened at `open`, or -1 when it never closes. */
export function groupEnd(source: string, open: number) {
  let depth = 0;
  for (let index = open; index < source.length; index++) {
    const char = source[index];
    if (char === '\\') index++;
    else if (char === '%')
      index = source.indexOf('\n', index) === -1 ? source.length : source.indexOf('\n', index);
    else if (char === '{') depth++;
    else if (char === '}' && --depth === 0) return index + 1;
  }
  return -1;
}

/**
 * Find a command with an optional `[…]` argument and a `{…}` argument. Ranges cover the
 * whole command and the inside of each argument, so edits keep the text around them.
 */
export function findLatexCommand(source: string, name: string, from = 0) {
  const pattern = new RegExp(
    String.raw`\\${name}(?![a-zA-Z])\s*(\*)?\s*(?:\[([^\]]*)\])?\s*\{`,
    'g',
  );
  pattern.lastIndex = from;
  for (let match; (match = pattern.exec(source));) {
    // A `%` earlier on the line comments the command out.
    const line = source.slice(source.lastIndexOf('\n', match.index) + 1, match.index);
    if (/(?:^|[^\\])%/.test(line)) continue;
    const open = match.index + match[0].length - 1;
    const end = groupEnd(source, open);
    if (end < 0) return;
    const optionStart = match[2] === undefined ? undefined : source.indexOf('[', match.index) + 1;
    return {
      start: match.index,
      end,
      option:
        optionStart === undefined
          ? undefined
          : { start: optionStart, end: optionStart + match[2]!.length, text: match[2]! },
      body: { start: open + 1, end: end - 1, text: source.slice(open + 1, end - 1) },
    };
  }
}

/** Replace `[start, end)` of `source`. */
export const splice = (source: string, start: number, end: number, text: string) =>
  source.slice(0, start) + text + source.slice(end);
