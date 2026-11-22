import { environmentAt, groupAt, whitespaceEnd } from './latex-syntax';

export function readLatexCodeBlock(source: string) {
  const environment = environmentAt(source, whitespaceEnd(source, 0));
  if (!environment || !['lstlisting', 'verbatim', 'verbatim*'].includes(environment.name) ||
      source.slice(environment.end).trim()) return;
  const options = environment.name === 'lstlisting' && groupAt(source, whitespaceEnd(source, environment.from), '[', ']');
  const setting = options ? source.slice(options.from, options.to) : '';
  const caption = /(?:^|,)\s*caption\s*=\s*(?:\{([^{}]*)\}|([^,]+))/.exec(setting);
  const label = /(?:^|,)\s*label\s*=\s*(?:\{([^{}]*)\}|([^,]+))/.exec(setting);
  const start = options ? options.end : environment.from;
  const from = start + (/^[ \t]*\r?\n/.exec(source.slice(start, environment.to))?.[0].length ?? 0);
  const end = /\r?\n[ \t]*$/.exec(source.slice(from, environment.to))?.[0].length ?? 0;
  const to = environment.to - end;
  return {
    from,
    to,
    source: source.slice(from, to),
    caption: caption?.[1] ?? caption?.[2]?.trim(),
    label: label?.[1] ?? label?.[2]?.trim(),
    size: /\\small\b/.test(setting) ? 'small' : 'normal',
  };
}
