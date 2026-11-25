import { latexLength } from './latex-lengths';
import { texPoint } from './latex-typography';
import { resolveLatexColour } from './latex-colour';
import { commandEnd, environmentAt, groupAt, latexCommands, whitespaceEnd } from './latex-syntax';

const fontSizes = new Map<string, readonly [number, number, number]>([
  ['tiny', [5, 6, 6]], ['scriptsize', [7, 8, 8]], ['footnotesize', [8, 9, 10]],
  ['small', [9, 10, 10.95]], ['normalsize', [10, 10.95, 12]], ['large', [12, 12, 14.4]],
  ['Large', [14.4, 14.4, 17.28]], ['LARGE', [17.28, 17.28, 20.74]],
  ['huge', [20.74, 20.74, 24.88]], ['Huge', [24.88, 24.88, 24.88]],
]);

const fontLeading = new Map<string, readonly [number, number, number]>([
  ['tiny', [6, 7, 7]], ['scriptsize', [8, 9.5, 9.5]], ['footnotesize', [9.5, 11, 12]],
  ['small', [11, 12, 13.6]], ['normalsize', [12, 13.6, 14.5]], ['large', [14, 14, 18]],
  ['Large', [18, 18, 22]], ['LARGE', [22, 22, 25]], ['huge', [25, 25, 30]], ['Huge', [30, 30, 30]],
]);

/** Read scoped declarations without absorbing the text or environment they format. */
export function latexDeclarations(source: string, start = 0, normalSize = 10 * texPoint) {
  let end = start;
  let family: 'sans' | 'roman' | 'mono' | undefined;
  let bold: boolean | undefined;
  let italic: boolean | undefined;
  let size: number | undefined;
  let leading: number | undefined;
  let scale: number | undefined;
  let colour: string | undefined;
  let rows: { start: number; odd: string; even: string } | undefined;
  for (;;) {
    const position = whitespaceEnd(source, end);
    const next = commandEnd(source, position);
    const command = source.slice(position + 1, next);
    const sizes = fontSizes.get(command);
    if (sizes) {
      const points = normalSize / texPoint;
      const index = points >= 11.5 ? 2 : points >= 10.5 ? 1 : 0;
      scale = (sizes[index] * texPoint) / normalSize;
      size = undefined;
      const baseline = fontLeading.get(command)?.[index];
      leading = baseline === undefined ? undefined : baseline * texPoint;
    } else if (command === 'sffamily' || command === 'rmfamily' || command === 'ttfamily') {
      family = command === 'sffamily' ? 'sans' : command === 'ttfamily' ? 'mono' : 'roman';
    } else if (command === 'bfseries' || command === 'mdseries') {
      bold = command === 'bfseries';
    } else if (command === 'itshape' || command === 'slshape' || command === 'upshape') {
      italic = command !== 'upshape';
    } else if (command === 'color' || command === 'fontsize' || command === 'rowcolors') {
      const first = groupAt(source, whitespaceEnd(source, next));
      if (!first) break;
      const value = source.slice(first.from, first.to).trim();
      end = first.end;
      if (command === 'color') {
        colour = value;
        continue;
      }
      const second = groupAt(source, whitespaceEnd(source, end));
      if (!second) break;
      const argument = source.slice(second.from, second.to).trim();
      if (command === 'fontsize') {
        size = latexLength(/^\d+(?:\.\d+)?$/.test(value) ? value + 'pt' : value);
        leading = latexLength(/^\d+(?:\.\d+)?$/.test(argument) ? argument + 'pt' : argument);
        scale = undefined;
        end = second.end;
      } else {
        const third = groupAt(source, whitespaceEnd(source, second.end));
        if (!third || !/^\d+$/.test(value)) break;
        rows = { start: Number(value), odd: argument, even: source.slice(third.from, third.to).trim() };
        end = third.end;
      }
      continue;
    } else if (command !== 'selectfont') break;
    end = next;
  }
  return { end, family, bold, italic, size, leading, scale, colour, rows };
}

export function latexVerticalSpace(source: string, start = 0) {
  const end = commandEnd(source, start);
  if (source.slice(start, end) !== '\\vspace') return;
  const group = groupAt(source, whitespaceEnd(source, end + Number(source[end] === '*')));
  if (!group) return;
  const length = source.slice(group.from, group.to).trim();
  const height = latexLength(length, 1);
  if (height !== undefined) return { height, unit: length.endsWith('em') ? 'em' : 'px', end: group.end };
}

/** Read simple titlesec formatting and leave complex styles to the TeX compiler. */
export function latexSectionPresentation(prefix: string, normalSize?: number) {
  const formats = new Map<string, { style: ReturnType<typeof latexDeclarations>; unnumbered: boolean }>();
  for (const match of prefix.matchAll(/\\titleformat\s*\{\\([a-z]+)\}/g)) {
    const styleGroup = groupAt(prefix, whitespaceEnd(prefix, match.index + match[0].length));
    const label = styleGroup && groupAt(prefix, whitespaceEnd(prefix, styleGroup.end));
    if (!styleGroup || !label) continue;
    const style = latexDeclarations(prefix.slice(styleGroup.from, styleGroup.to), 0, normalSize);
    formats.set(match[1]!, { style, unnumbered: !prefix.slice(label.from, label.to).trim() });
  }
  const spacing = new Map<string, { before: number; after: number }>();
  for (const match of prefix.matchAll(/\\titlespacing\*?\s*\{\\([a-z]+)\}/g)) {
    const indent = groupAt(prefix, whitespaceEnd(prefix, match.index + match[0].length));
    const before = indent && groupAt(prefix, whitespaceEnd(prefix, indent.end));
    const after = before && groupAt(prefix, whitespaceEnd(prefix, before.end));
    if (!before || !after) continue;
    const above = latexLength(prefix.slice(before.from, before.to));
    const below = latexLength(prefix.slice(after.from, after.to));
    if (above !== undefined && below !== undefined) spacing.set(match[1]!, { before: above, after: below });
  }
  return { formats, spacing };
}

export function latexPresentationColour(name: string | undefined, colours: ReadonlyMap<string, string>) {
  return name ? resolveLatexColour(name, colours) : undefined;
}

type RunningSlot = 'L' | 'C' | 'R';
type RunningField = { area: 'head' | 'foot'; slot: RunningSlot; source: string };

function fancyRunningStyle(source: string) {
  const fields: RunningField[] = [];
  let clearDefault = false;
  let headRule = 0.4 * texPoint;
  let footRule = 0;
  for (const { name, end } of latexCommands(source)) {
    const at = whitespaceEnd(source, end);
    if (name === 'fancyhf' || name === 'renewcommand') {
      const star = Number(source[at] === '*');
      const group = groupAt(source, whitespaceEnd(source, at + star));
      if (!group) continue;
      const value = source.slice(group.from, group.to).trim();
      if (name === 'fancyhf' && !value) {
        fields.length = 0;
        clearDefault = true;
      } else if (name === 'renewcommand') {
        const length = groupAt(source, whitespaceEnd(source, group.end));
        const pixels = length && latexLength(source.slice(length.from, length.to));
        if (pixels === undefined) continue;
        if (value === '\\headrulewidth') headRule = pixels;
        if (value === '\\footrulewidth') footRule = pixels;
      }
      continue;
    }
    if (name !== 'fancyhead' && name !== 'fancyfoot') continue;
    const option = groupAt(source, at, '[', ']');
    if (!option) continue;
    const group = groupAt(source, whitespaceEnd(source, option.end));
    if (!group) continue;
    const area = name === 'fancyhead' ? 'head' : 'foot';
    for (const slot of source.slice(option.from, option.to).split(',').map((part) => part.trim())) {
      if (slot !== 'L' && slot !== 'C' && slot !== 'R') continue;
      const index = fields.findIndex((field) => field.area === area && field.slot === slot);
      if (index >= 0) fields.splice(index, 1);
      fields.push({ area, slot, source: source.slice(group.from, group.to) });
    }
  }
  return {
    fields,
    headRule,
    footRule,
    clearDefault: clearDefault || fields.some(({ area, slot }) => area === 'foot' && slot === 'C'),
  };
}

/** Read fancyhdr's main style and named styles without executing their TeX. */
export function latexRunningStyles(prefix: string) {
  let defaultStyle: string | undefined;
  const styles = new Map<string, ReturnType<typeof fancyRunningStyle>>();
  for (const { name, end } of latexCommands(prefix)) {
    if (name !== 'pagestyle' && name !== 'fancypagestyle') continue;
    const group = groupAt(prefix, whitespaceEnd(prefix, end));
    if (!group) continue;
    const style = prefix.slice(group.from, group.to).trim();
    if (name === 'pagestyle') {
      defaultStyle = style;
    } else {
      const position = whitespaceEnd(prefix, group.end);
      const base = groupAt(prefix, position, '[', ']');
      const body = groupAt(prefix, whitespaceEnd(prefix, base?.end ?? position));
      if (body) styles.set(style, fancyRunningStyle(prefix.slice(body.from, body.to)));
    }
  }
  if (!styles.has('fancy')) styles.set('fancy', fancyRunningStyle(prefix));
  return { defaultStyle, styles };
}

/** Running fields for documents whose main page style is fancy. */
export function latexRunningFields(prefix: string) {
  const { defaultStyle, styles } = latexRunningStyles(prefix);
  const style = defaultStyle === 'fancy' ? styles.get('fancy') : undefined;
  if (style) {
    const { fields, headRule, clearDefault } = style;
    return { fields, headRule, clearDefault };
  }
}

/** A complete inline TikZ picture can be compiled to a tight box with its own preamble. */
export function latexTikzFragment(source: string) {
  const trimmed = source.trim();
  const picture = /^\\begin\s*\{center\}([\s\S]*)\\end\s*\{center\}$/.exec(trimmed)?.[1]?.trim() ?? trimmed;
  const environment = environmentAt(picture, 0);
  if (environment?.name === 'tikzpicture' && !picture.slice(environment.end).trim()) return picture;
}

/** Resolve alignment and width for simple array column aliases with zero or one argument. */
export function latexColumnAliasWidths(prefix: string, columns: readonly string[], em: number) {
  const aliases = new Map<string, { parameters: number; type: string; width: string | undefined }>();
  for (const { name, end } of latexCommands(prefix)) {
    if (name !== 'newcolumntype') continue;
    const key = groupAt(prefix, whitespaceEnd(prefix, end));
    if (!key || key.to - key.from !== 1) continue;
    const option = groupAt(prefix, whitespaceEnd(prefix, key.end), '[', ']');
    const count = option ? Number(prefix.slice(option.from, option.to)) : 0;
    if (count !== 0 && count !== 1) continue;
    const definition = groupAt(prefix, whitespaceEnd(prefix, option?.end ?? key.end));
    if (!definition) continue;
    const body = prefix.slice(definition.from, definition.to).trim();
    const decoration = body.startsWith('>') && groupAt(body, 1);
    const format = /^(X|[pmb]\s*\{([^{}]+)\})$/.exec(body.slice(decoration ? decoration.end : 0));
    if (format) aliases.set(prefix.slice(key.from, key.to), {
      parameters: count, type: format[1]!, width: format[2],
    });
  }
  return columns.map((column) => {
    const match = /^(?:@\{\s*\})?([A-Z])(?:\{([^{}]+)\})?(?:@\{\s*\})?$/.exec(column.trim());
    if (!match) return;
    if (match[1] === 'X') return 'flexible' as const;
    const alias = aliases.get(match[1]!);
    if (!alias || alias.parameters !== Number(!!match[2])) return;
    if (alias.type === 'X') return 'flexible' as const;
    return latexLength(alias.width?.replace('#1', match[2] ?? ''), em);
  });
}
