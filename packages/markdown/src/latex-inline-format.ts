import type { Mark, MarkSpec } from 'prosemirror-model';
import { resolveLatexColour } from './latex-colour';
import { latexFontSizePoints } from './latex-presentation';
import { texPoint } from './latex-typography';
import { groupAt, latexUrlArgument, whitespaceEnd } from './latex-syntax';

const textCommands = {
  strong: 'textbf',
  em: 'emph',
  mono: 'texttt',
  underline: 'uline',
  smallCaps: 'textsc',
  strike: 'sout',
  superscript: 'textsuperscript',
  subscript: 'textsubscript',
} as const;
const commandStyles = new Map<string, string>(Object.entries(textCommands).map(([style, command]) => [command, style]));
commandStyles.set('underline', 'underline');

export const latexFontSizes = ['tiny', 'scriptsize', 'footnotesize', 'small', 'normalsize', 'large', 'Large', 'LARGE', 'huge', 'Huge'] as const;
export type LatexFontSize = (typeof latexFontSizes)[number];
export type LatexToggleStyle = keyof typeof textCommands;
export type LatexStyle =
  | { style: LatexToggleStyle }
  | { style: 'colour' | 'highlight'; colour: string }
  | { style: 'size'; size: LatexFontSize }
  | { style: 'link'; href: string };

export function latexFontSizeProperties(normalSize: number) {
  const points = normalSize / texPoint;
  const index = points >= 11.5 ? 2 : points >= 10.5 ? 1 : 0;
  return Object.fromEntries(Array.from(latexFontSizePoints, ([size, sizes]) =>
    ['--latex-size-' + size, sizes[index] * texPoint + 'px'],
  ));
}

function fontSize(value: unknown) {
  return latexFontSizes.find(size => size === value);
}

function hexColour(value: unknown) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : undefined;
}

export function latexLinkUrl(value: string) {
  const url = value.trim();
  if (!/^(https?:\/\/|mailto:)/i.test(url)) return;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'mailto:' && !parsed.pathname) return;
    return parsed.href.replace(/[{}\\^~]/g, character => encodeURIComponent(character).replace('~', '%7E'));
  } catch {
    return;
  }
}

function readUrl(value: string) {
  return value.replace(/\\([%#&_{}])/g, '$1');
}

export function authoredLatexStyle(format: LatexStyle) {
  switch (format.style) {
    case 'colour':
    case 'highlight': {
      const colour = hexColour(format.colour);
      if (!colour) return;
      const command = format.style === 'colour' ? 'textcolor' : 'colorbox';
      return { ...format, colour, open: '\\' + command + '[HTML]{' + colour.slice(1).toUpperCase() + '}{', close: '}' };
    }
    case 'link': {
      const href = latexLinkUrl(format.href);
      if (!href) return;
      return { ...format, href, open: '\\href{' + href.replace(/[%#]/g, '\\$&') + '}{', close: '}' };
    }
    case 'size':
      return { ...format, open: '{\\' + format.size + ' ', close: '}' };
    default:
      return { ...format, open: '\\' + textCommands[format.style] + '{', close: '}' };
  }
}

export function latexStylePackage(mark: Mark) {
  if (mark.type.name !== 'latex_style') return;
  const open: string = mark.attrs.open;
  if (/^\\(?:sout|uline)\b/.test(open)) return 'ulem';
  if (/^\\(?:textcolor|colorbox)\b/.test(open)) return 'xcolor';
  if (/^\\(?:href|url)\b/.test(open)) return 'hyperref';
}

export function latexInlineSize(source: string, start: number) {
  const declaration = /^\{\s*\\([A-Za-z]+)\b\s*/.exec(source.slice(start));
  const size = fontSize(declaration?.[1]);
  const scope = size && groupAt(source, start);
  if (scope && declaration) {
    const from = start + declaration[0].length;
    const content = source.slice(from, scope.to);
    if (!/(?:\\(?:begin|par)(?![A-Za-z@])|\r?\n[ \t]*\r?\n)/.test(content))
      return { style: 'size' as const, size, from, to: scope.to, end: scope.end };
  }
}

/** Read an inline wrapper and preserve the original delimiters around its editable content. */
export function latexInlineFormat(
  source: string,
  start: number,
  end: number,
  command: string,
  colours: ReadonlyMap<string, string>,
  alias: string | undefined,
): { style: string; from: number; to: number; end: number; colour?: string; size?: LatexFontSize; href?: string; url?: boolean } | undefined {
  if (command === '{') return latexInlineSize(source, start);
  const at = whitespaceEnd(source, end);
  if (command === '\\textcolor' || command === '\\colorbox') {
    const model = groupAt(source, at, '[', ']');
    const name = groupAt(source, model ? whitespaceEnd(source, model.end) : at);
    if (!name) return;
    const value = source.slice(name.from, name.to).trim();
    const colour = model
      ? source.slice(model.from, model.to).trim() === 'HTML' && hexColour('#' + value)
      : resolveLatexColour(value, colours);
    const argument = groupAt(source, whitespaceEnd(source, name.end));
    return colour && argument ? { ...argument, colour, style: command === '\\textcolor' ? 'colour' : 'highlight' } : undefined;
  }
  if (command === '\\href' || command === '\\url') {
    // Hyperref reads URL arguments with special category codes, including literal percent signs.
    const target = latexUrlArgument(source, end);
    if (!target) return;
    const href = readUrl(source.slice(target.from, target.to));
    if (command === '\\url') return { ...target, style: 'link', href, url: true };
    const label = groupAt(source, whitespaceEnd(source, target.end));
    return label && { ...label, style: 'link', href };
  }
  const style = alias ?? commandStyles.get(command.slice(1));
  const argument = style && groupAt(source, at);
  return argument ? { ...argument, style } : undefined;
}

export const latexStyleMark: MarkSpec = {
  attrs: {
    open: { validate: 'string' },
    close: { validate: 'string' },
    style: { validate: 'string' },
    order: { validate: 'number' },
    colour: { default: null, validate: 'string|null' },
    href: { default: null, validate: 'string|null' },
    size: { default: null, validate: 'string|null' },
  },
  excludes: '',
  toDOM(mark) {
    const { style, href, size } = mark.attrs;
    const attrs: Record<string, string> = { 'data-latex-style': style };
    const colour = hexColour(mark.attrs.colour);
    if (style === 'strong') return ['strong', attrs, 0];
    if (style === 'em') return ['em', attrs, 0];
    if (style === 'underline') {
      if (/^\\underline\b/.test(mark.attrs.open)) attrs['data-latex-unbreakable'] = '';
      return ['u', attrs, 0];
    }
    if (style === 'strike') return ['s', attrs, 0];
    if (style === 'superscript') return ['sup', attrs, 0];
    if (style === 'subscript') return ['sub', attrs, 0];
    if (style === 'link') {
      attrs['data-latex-href'] = href;
      const destination = typeof href === 'string' && latexLinkUrl(href);
      if (destination) {
        attrs.href = destination;
        attrs.target = '_blank';
        attrs.rel = 'noopener noreferrer';
      }
      return ['a', attrs, 0];
    }
    if (style === 'sans' || style === 'mono' || style === 'normal') attrs['data-latex-font'] = style;
    if (style === 'size' && fontSize(size)) {
      attrs['data-latex-size'] = size;
      attrs.style = 'font-size:var(--latex-size-' + size + ')';
    }
    if (colour && (style === 'colour' || style === 'highlight')) {
      attrs['data-latex-colour'] = colour;
      attrs.style = (style === 'colour' ? 'color:' : 'background-color:') + colour;
    }
    return ['span', attrs, 0];
  },
};
