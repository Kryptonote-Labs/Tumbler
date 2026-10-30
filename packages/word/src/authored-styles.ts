import { resolveWordColour, DEFAULT_WORD_THEME } from './theme-colours.ts';
import { WordStyles, type WordStyle } from './styles.ts';
import { xml, runProperties } from './create-xml.ts';
import { paragraphFormatXml } from './paragraph-format.ts';

const definition = (styleId: string, name: string, size?: number, level?: number): WordStyle => ({
  styleId, name, type: 'paragraph', basedOn: styleId === 'Normal' ? undefined : 'Normal', linked: undefined, next: 'Normal', isDefault: false,
  run: size === undefined ? {} : { fontSizePoints: size, ...(level === undefined ? {} : { bold: true }) },
  paragraph: level === undefined ? {} : { outlineLevel: level, keepNext: true, keepLines: true, spacingBeforeTwips: 240, spacingAfterTwips: 120 },
});
export const WORD_BUILTIN_STYLES: readonly WordStyle[] = [
  definition('Normal', 'Normal'), definition('Title', 'Title', 28), definition('Subtitle', 'Subtitle', 16),
  ...Array.from({ length: 9 }, (_, level) => definition(`Heading${level + 1}`, `Heading ${level + 1}`, [20, 16, 14, 13, 12, 12, 11, 11, 11][level], level)),
];
export function builtinStyleXml(style: WordStyle): string {
  return `<w:style w:type="paragraph" w:styleId="${xml(style.styleId)}"><w:name w:val="${xml(style.name ?? style.styleId)}"/>${style.basedOn ? `<w:basedOn w:val="${xml(style.basedOn)}"/>` : ''}<w:next w:val="Normal"/><w:qFormat/><w:pPr>${[...paragraphFormatXml(style.paragraph).values()].join('')}</w:pPr><w:rPr>${runProperties({ ...(style.run.fontSizePoints === undefined ? {} : { fontSizePoints: style.run.fontSizePoints }), ...(style.run.bold === undefined ? {} : { bold: style.run.bold }) })}</w:rPr></w:style>`;
}
export const builtinWordStyles = new WordStyles({ styles: WORD_BUILTIN_STYLES });

const authoringStyles = new WeakMap<WordStyles, Map<import('@tumblerjs/ooxml').ThemeColorScheme | undefined, WordStyles>>();

export function wordAuthoringStyles(source?: WordStyles, defaults: import('./create.ts').WordTextFormat = { fontFamily: 'Aptos', fontSizePoints: 12 }, paragraphDefaults: import('./paragraph-format.ts').WordParagraphFormat = {}, themeColours?: import('@tumblerjs/ooxml').ThemeColorScheme) {
  const { color, highlight, ...run } = defaults;
  const scheme = source?.themeColors ?? themeColours;
  // Source defaults and declarations are immutable. Supplied authoring defaults
  // apply only when there is no source style collection.
  const cached = source && authoringStyles.get(source)?.get(scheme);
  if (cached) return cached;
  const result = new WordStyles({
    styles: [...(source?.styles ?? []), ...WORD_BUILTIN_STYLES.filter(style => !source?.style(style.styleId))],
    documentRunDefaults: source?.documentRunDefaults ?? { ...run, ...(highlight === undefined ? {} : { highlight }), ...(color ? { color: { type: 'rgb' as const, value: resolveWordColour(color, scheme ?? DEFAULT_WORD_THEME).slice(1) } } : {}) },
    documentParagraphDefaults: source?.documentParagraphDefaults ?? paragraphDefaults,
    ...(scheme ? { themeColors: scheme } : {}),
    ...(source?.themeFonts ? { themeFonts: source.themeFonts } : {}),
  });
  if (source) {
    const schemes = authoringStyles.get(source) ?? new Map();
    schemes.set(scheme, result);
    authoringStyles.set(source, schemes);
  }
  return result;
}

export function validateWordStyleId(styleId: string | undefined): void {
  if (styleId !== undefined && (typeof styleId !== 'string' || styleId.length === 0 || /[\u0000-\u001f\u007f]/.test(styleId))) throw new TypeError('Invalid paragraph style id.');
}
