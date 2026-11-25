import { escapedLatexText } from './latex';
import { readLatexClass, type LatexPageNumber } from './latex-flow';
import { withLatexPackage } from './latex-preamble';
import { latexRunningStyles, type LatexRunningField, type LatexRunningSlot } from './latex-presentation';
import { groupAt, latexCommands, whitespaceEnd } from './latex-syntax';

export type LatexPageNumberPosition = 'none' | 'head-L' | 'head-C' | 'head-R' | 'foot-L' | 'foot-C' | 'foot-R';
export type LatexPageStyle =
  | { kind: 'plain' | 'empty' | 'headings' }
  | { kind: 'custom'; number: LatexPageNumberPosition; header: string; footer: string };
const customStyle = 'tumblerpages';

/** The default and standard running furniture for a page, including odd/even headings. */
export function latexPageFurniture(prefix: string) {
  const { name, options } = readLatexClass(prefix);
  const { defaultStyle, styles } = latexRunningStyles(prefix);
  const selected = defaultStyle ?? (name === 'book' ? 'headings' : 'plain');
  const sided = options.findLast(option => option === 'twoside' || option === 'oneside');
  const twoSided = sided ? sided === 'twoside' : name === 'book';
  const supported = ['article', 'report', 'book'].includes(name);
  const make = (numberSlot: LatexRunningSlot, markSlot: LatexRunningSlot, mark: string) => ({
    fields: [
      { area: 'head', slot: numberSlot, source: '\\thepage' },
      { area: 'head', slot: markSlot, source: '\\slshape' + mark },
    ] satisfies LatexRunningField[],
    clearDefault: true,
    headRule: 0,
    footRule: 0,
  });
  const odd = make('R', 'L', '\\rightmark');
  const even = make('L', 'R', '\\leftmark');
  const prepare = (style: NonNullable<ReturnType<typeof styles.get>>) => ({
    ...style,
    usesRunningMarks: style.fields.some(({ source }) => /\\(?:leftmark|rightmark)\b/.test(source)),
  });
  const named = new Map([...styles].map(([key, style]) => [key, prepare(style)]));
  const oddHeadings = prepare(odd);
  const evenHeadings = prepare(even);
  return {
    defaultStyle: selected,
    /** Styles returned by `style`, with stable identities for preparing their fields. */
    styles: [...named.values(), ...(supported ? [oddHeadings, evenHeadings] : [])],
    style(folio: LatexPageNumber) {
      const style = folio.pageStyle ?? selected;
      return named.get(style) ?? (supported && style === 'headings'
        ? twoSided && folio.number % 2 === 0 ? evenHeadings : oddHeadings
        : undefined);
    },
  };
}

function pageStyleCommands(prefix: string) {
  const styles = [];
  for (const { name, start, end } of latexCommands(prefix)) {
    if (name !== 'pagestyle' && name !== 'fancypagestyle') continue;
    const style = groupAt(prefix, whitespaceEnd(prefix, end));
    if (!style) continue;
    const value = prefix.slice(style.from, style.to).trim();
    if (name === 'pagestyle') {
      styles.push({ name, value, start, end: style.end });
      continue;
    }
    const at = whitespaceEnd(prefix, style.end);
    const base = groupAt(prefix, at, '[', ']');
    const body = groupAt(prefix, whitespaceEnd(prefix, base?.end ?? at));
    if (body) styles.push({
      name, value, start, end: body.end,
      base: base && prefix.slice(base.from, base.to).trim(),
    });
  }
  return styles;
}

export function decodeLatexRunningText(source: string) {
  return source.replace(/\\text(backslash|asciicircum|asciitilde)\{\}|\\([%${}#&_])/g,
    (_, word: string | undefined, symbol: string | undefined) =>
      symbol ?? (word === 'backslash' ? '\\' : word === 'asciicircum' ? '^' : '~'));
}

/** Read the built-in or editable custom page style selected by the preamble. */
export function readLatexPageStyle(prefix: string): LatexPageStyle | undefined {
  const furniture = latexPageFurniture(prefix);
  const kind = furniture.defaultStyle;
  if (kind === 'plain' || kind === 'empty' || kind === 'headings') return { kind };
  if (kind !== customStyle) return;
  const fields = furniture.style({ number: 1, visible: true })?.fields ?? [];
  const folio = fields.find(({ source }) => source === '\\thepage');
  return {
    kind: 'custom',
    number: folio ? `${folio.area}-${folio.slot}` : 'none',
    header: decodeLatexRunningText(fields.find(({ area, source }) => area === 'head' && source !== '\\thepage')?.source ?? ''),
    footer: decodeLatexRunningText(fields.find(({ area, source }) => area === 'foot' && source !== '\\thepage')?.source ?? ''),
  };
}

/** Write ordinary page styles and a small fancyhdr definition for custom furniture. */
export function setLatexPageStyle(prefix: string, style: LatexPageStyle, effectivePrefix = prefix) {
  const isCustom = style.kind === 'custom';
  const newline = prefix.includes('\r\n') ? '\r\n' : '\n';
  let next = isCustom ? withLatexPackage(prefix, 'fancyhdr', effectivePrefix) : prefix;
  const commands = pageStyleCommands(next);
  const last = commands.findLast(({ name }) => name === 'pagestyle');
  const owned = ({ name, value, base }: (typeof commands)[number]) => name === 'fancypagestyle' &&
    (value === customStyle || (value === 'plain' && base === customStyle));
  const externalPlain = pageStyleCommands(effectivePrefix).some(command =>
    command.name === 'fancypagestyle' && command.value === 'plain' && !owned(command));
  const selection = '\\pagestyle{' + (isCustom ? customStyle : style.kind) + '}';
  const declarations = [];
  if (style.kind === 'custom') {
    declarations.push('\\fancypagestyle{' + customStyle + '}{', '  \\fancyhf{}');
    for (const area of ['head', 'foot'] as const) {
      const text = area === 'head' ? style.header : style.footer;
      if (text.trim()) {
        const slot = style.number === area + '-L' ? 'R' : 'L';
        declarations.push('  \\fancy' + area + '[' + slot + ']{' + escapedLatexText(text.trim()) + '}');
      }
      if (style.number !== 'none' && style.number.startsWith(area))
        declarations.push('  \\fancy' + area + '[' + style.number.at(-1) + ']{\\thepage}');
    }
    declarations.push('  \\renewcommand{\\headrulewidth}{0pt}', '}');
    if (!externalPlain) declarations.push('\\fancypagestyle{plain}[' + customStyle + ']{}');
  }
  for (const command of commands.reverse()) {
    if (!owned(command) && command !== last) continue;
    if (command === last && !isCustom) {
      next = next.slice(0, command.start) + selection + next.slice(command.end);
    } else {
      const trailing = /^[ \t]*(?:\r?\n|$)/.exec(next.slice(command.end))?.[0].length ?? 0;
      next = next.slice(0, command.start) + next.slice(command.end + trailing);
    }
  }
  if (last && !isCustom) return next;
  const begin = /\\begin\s*\{document\}\s*$/.exec(next);
  if (!begin) return prefix;
  const before = next.slice(0, begin.index);
  return before + (before.endsWith('\n') ? '' : newline) +
    [...declarations, selection].join(newline) + newline + next.slice(begin.index);
}
