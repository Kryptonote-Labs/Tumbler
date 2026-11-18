export type Group = { from: number; to: number; end: number };

export function commandEnd(source: string, position: number) {
  if (source[position] !== '\\') return position;
  let end = position + 1;
  while (/[A-Za-z@]/.test(source[end] ?? '')) end++;
  return end === position + 1 ? Math.min(source.length, end + 1) : end;
}

export function lineEnd(source: string, position: number) {
  const end = source.indexOf('\n', position);
  return end < 0 ? source.length : end;
}

/** Groups can nest and contain escaped braces and comments. */
export function groupAt(
  source: string,
  position: number,
  open = '{',
  close = '}',
): Group | undefined {
  if (source[position] !== open) return;
  let depth = 1;
  for (let next = position + 1; next < source.length; next++) {
    const character = source[next];
    if (character === '\\') next = commandEnd(source, next) - 1;
    else if (character === '%') next = lineEnd(source, next);
    else if (character === open) depth++;
    else if (character === close && --depth === 0)
      return { from: position + 1, to: next, end: next + 1 };
  }
}

export function whitespaceEnd(source: string, position: number) {
  while (/\s/.test(source[position] ?? '')) position++;
  return position;
}

export function argumentAt(source: string, position: number) {
  let start = whitespaceEnd(source, position);
  if (source[start] === '[') {
    const optional = groupAt(source, start, '[', ']');
    if (!optional) return;
    start = whitespaceEnd(source, optional.end);
  }
  return groupAt(source, start);
}

export function mathEnd(source: string, start: number, close: string) {
  for (let next = start; next < source.length; next++) {
    if (source.startsWith(close, next)) return next;
    if (source[next] === '\\') next = commandEnd(source, next) - 1;
    else if (source[next] === '%') next = lineEnd(source, next);
  }
  return -1;
}

export function verbatimEnd(source: string, position: number) {
  const start = position + Number(source[position] === '*');
  const delimiter = source[start];
  if (!delimiter || /\s/.test(delimiter)) return position;
  const end = source.indexOf(delimiter, start + 1);
  return end < 0 || end >= lineEnd(source, start) ? lineEnd(source, start) : end + 1;
}

function environmentTag(source: string, position: number) {
  const end = commandEnd(source, position);
  const command = source.slice(position, end);
  if (command !== '\\begin' && command !== '\\end') return;
  const group = groupAt(source, whitespaceEnd(source, end));
  if (!group) return;
  return {
    kind: command === '\\begin' ? 'begin' : 'end',
    name: source.slice(group.from, group.to),
    end: group.end,
  };
}

const verbatimEnvironments = new Set(['verbatim', 'verbatim*', 'lstlisting', 'minted', 'Verbatim']);

export function environmentAt(source: string, position: number) {
  const first = environmentTag(source, position);
  if (first?.kind !== 'begin') return;
  const stack = [first.name];
  for (let next = first.end; next < source.length; next++) {
    const name = stack.at(-1)!;
    if (verbatimEnvironments.has(name)) {
      const close = source.indexOf('\\end{' + name + '}', next);
      if (close < 0) return;
      next = close;
    } else {
      if (source[next] === '%') next = lineEnd(source, next);
      if (source[next] !== '\\') continue;
      const end = commandEnd(source, next);
      if (source.slice(next, end) === '\\verb') {
        next = verbatimEnd(source, end) - 1;
        continue;
      }
    }
    const tag = environmentTag(source, next);
    if (!tag) {
      next = commandEnd(source, next) - 1;
      continue;
    }
    if (tag.kind === 'begin') stack.push(tag.name);
    else if (tag.name === name) {
      stack.pop();
      if (!stack.length) return { name, from: first.end, to: next, end: tag.end };
    }
    next = tag.end - 1;
  }
}

/** Ignore commented commands, escaped control sequences and verbatim while finding the body. */
export function documentBody(source: string) {
  for (let next = 0; next < source.length; next++) {
    if (source[next] === '%') next = lineEnd(source, next);
    else if (source[next] === '\\') {
      const tag = environmentTag(source, next);
      if (tag?.kind === 'begin' && tag.name === 'document') return environmentAt(source, next);
      const end = commandEnd(source, next);
      next = source.slice(next, end) === '\\verb' ? verbatimEnd(source, end) - 1 : end - 1;
    } else if (source[next] === '{') next = (groupAt(source, next)?.end ?? next + 1) - 1;
  }
}
