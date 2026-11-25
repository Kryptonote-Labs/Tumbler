import { latexLength } from './latex-lengths';

/** The characters TeX prints for ligatures and active characters in Computer Modern text. */
export function printable(text: string) {
  return text
    .replace(/~/g, ' ')
    .replace(/---/g, '—')
    .replace(/--/g, '–')
    .replace(/``/g, '“')
    .replace(/''/g, '”')
    .replace(/`/g, '‘')
    .replace(/'/g, '’');
}

export function skipSpaces(source: string, position: number) {
  while (source[position] === ' ' || source[position] === '\t') position++;
  return position;
}

/** TeX skips spaces after a control word, including one line end, but not a blank line. */
export function controlWordEnd(source: string, position: number) {
  const next = skipSpaces(source, position);
  return source[next] === '\n' && !/^\n[ \t]*\n/.test(source.slice(next))
    ? skipSpaces(source, next + 1)
    : next;
}

export function spaceEnd(source: string, position: number) {
  while (/\s/.test(source[position] ?? '')) position++;
  return position;
}

export function dimension(value: string, quad: number, textHeight: number) {
  const relative = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)?)\s*\\(?:textheight|vsize)$/.exec(value.trim());
  if (relative) return Number(relative[1] || 1) * textHeight;
  return latexLength(value, quad, quad * 0.430555);
}

const number = String.raw`[+-]?(?:\d+(?:\.\d*)?|\.\d+)`;
const length = String.raw`(?:${number}\s*(?:in|cm|mm|pt|bp|pc|sp|dd|cc|em|ex)|(?:${number})?\s*\\(?:textheight|vsize))`;
const glue = new RegExp(
  String.raw`(${length})(?:\s+plus\s+(?:${number}\s*(fil{1,3})\b|${length}))?(?:\s+minus\s+(${length}))?`,
  'y',
);

/** Read TeX glue after a primitive such as `\vskip`, keeping its natural size and fill order. */
export function readGlue(source: string, position: number, quad: number, textHeight: number) {
  glue.lastIndex = position;
  const match = glue.exec(source);
  if (!match) return;
  const height = dimension(match[1]!, quad, textHeight);
  if (height === undefined) return;
  const stretch = match[2] === 'fil' ? 1 : match[2] === 'fill' ? 2 : match[2] === 'filll' ? 3 : 0;
  const shrink = match[3] === undefined ? 0 : (dimension(match[3], quad, textHeight) ?? 0);
  return { height, stretch, shrink, end: controlWordEnd(source, glue.lastIndex) } as const;
}
