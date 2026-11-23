import { latexLength } from './latex-lengths';
import { resolveLatexColour } from './latex-colour';
import { commandEnd, environmentAt, groupAt, whitespaceEnd } from './latex-syntax';

const fontSizes = new Map([
  ['tiny', 0.5], ['scriptsize', 0.7], ['footnotesize', 0.8], ['small', 0.9],
  ['normalsize', 1], ['large', 1.2], ['Large', 1.44], ['LARGE', 1.73],
  ['huge', 2.07], ['Huge', 2.49],
]);

/** Read scoped declarations without absorbing the text or environment they format. */
export function latexDeclarations(source: string, start = 0) {
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
    const ratio = fontSizes.get(command);
    if (ratio) {
      scale = ratio;
      size = leading = undefined;
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
  const height = latexLength(source.slice(group.from, group.to));
  if (height !== undefined) return { height, end: group.end };
}

/** Read simple titlesec formatting and leave complex styles to the TeX compiler. */
export function latexSectionPresentation(prefix: string) {
  const formats = new Map<string, { style: ReturnType<typeof latexDeclarations>; unnumbered: boolean }>();
  for (const match of prefix.matchAll(/\\titleformat\s*\{\\([a-z]+)\}/g)) {
    const styleGroup = groupAt(prefix, whitespaceEnd(prefix, match.index + match[0].length));
    const label = styleGroup && groupAt(prefix, whitespaceEnd(prefix, styleGroup.end));
    if (!styleGroup || !label) continue;
    const style = latexDeclarations(prefix.slice(styleGroup.from, styleGroup.to));
    formats.set(match[1]!, { style, unnumbered: !prefix.slice(label.from, label.to).trim() });
  }
  return formats;
}

export function latexPresentationColour(name: string | undefined, colours: ReadonlyMap<string, string>) {
  return name ? resolveLatexColour(name, colours) : undefined;
}

/** Running fields for the common fancy page style with literal left, centre and right slots. */
export function latexRunningFields(prefix: string) {
  if (!/\\pagestyle\s*\{fancy\}/.test(prefix)) return;
  const fields: { area: 'head' | 'foot'; slot: 'L' | 'C' | 'R'; source: string }[] = [];
  for (const match of prefix.matchAll(/\\fancy(head|foot)\s*\[([LCR])\]/g)) {
    const group = groupAt(prefix, whitespaceEnd(prefix, match.index + match[0].length));
    if (!group) continue;
    const area = match[1] === 'head' ? 'head' : 'foot';
    const slot = match[2] === 'L' ? 'L' : match[2] === 'R' ? 'R' : 'C';
    const index = fields.findIndex((field) => field.area === area && field.slot === slot);
    if (index >= 0) fields.splice(index, 1);
    fields.push({ area, slot, source: prefix.slice(group.from, group.to) });
  }
  const rule = /\\renewcommand\s*\{\\headrulewidth\}\s*\{([^{}]*)\}/.exec(prefix);
  return {
    fields,
    headRule: latexLength(rule?.[1] ?? '0.4pt') ?? 0,
    clearDefault: /\\fancyhf\s*\{\s*\}/.test(prefix),
  };
}

/** A complete inline TikZ picture can be compiled to a tight box with its own preamble. */
export function latexTikzFragment(source: string) {
  const trimmed = source.trim();
  const picture = /^\\begin\s*\{center\}([\s\S]*)\\end\s*\{center\}$/.exec(trimmed)?.[1]?.trim() ?? trimmed;
  const environment = environmentAt(picture, 0);
  if (environment?.name === 'tikzpicture' && !picture.slice(environment.end).trim()) return picture;
}
