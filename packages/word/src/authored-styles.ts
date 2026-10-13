import { WordStyles, type WordStyle } from './styles.ts';
import { xml, runProperties } from './create-xml.ts';
import { paragraphFormatXml } from './paragraph-format.ts';

const definition = (styleId: string, name: string, size?: number, level?: number): WordStyle => ({
  styleId, name, type: 'paragraph', basedOn: styleId === 'Normal' ? undefined : 'Normal', linked: undefined, isDefault: false,
  run: size === undefined ? {} : { fontSizePoints: size, ...(level === undefined ? {} : { bold: true }) },
  paragraph: level === undefined ? {} : { keepNext: true, keepLines: true, spacingBeforeTwips: 240, spacingAfterTwips: 120 },
});
export const WORD_BUILTIN_STYLES: readonly WordStyle[] = [
  definition('Normal', 'Normal'), definition('Title', 'Title', 28), definition('Subtitle', 'Subtitle', 16),
  ...Array.from({ length: 9 }, (_, level) => definition(`Heading${level + 1}`, `Heading ${level + 1}`, [20, 16, 14, 13, 12, 12, 11, 11, 11][level], level)),
];
export function builtinStyleXml(style: WordStyle): string {
  const heading = /^Heading([1-9])$/.exec(style.styleId);
  return `<w:style w:type="paragraph" w:styleId="${xml(style.styleId)}"><w:name w:val="${xml(style.name ?? style.styleId)}"/>${style.basedOn ? `<w:basedOn w:val="${xml(style.basedOn)}"/>` : ''}<w:next w:val="Normal"/><w:qFormat/><w:pPr>${[...paragraphFormatXml(style.paragraph).values()].join('')}${heading ? `<w:outlineLvl w:val="${Number(heading[1]) - 1}"/>` : ''}</w:pPr><w:rPr>${runProperties({ ...(style.run.fontSizePoints === undefined ? {} : { fontSizePoints: style.run.fontSizePoints }), ...(style.run.bold === undefined ? {} : { bold: style.run.bold }) })}</w:rPr></w:style>`;
}
export const builtinWordStyles = new WordStyles({ styles: WORD_BUILTIN_STYLES });

export function wordAuthoringStyles(source?: WordStyles, defaults: import('./create.ts').WordTextFormat = { fontFamily: 'Aptos', fontSizePoints: 12 }) {
  const { color, highlight, ...run } = defaults;
  return new WordStyles({
    styles: [...(source?.styles ?? []), ...WORD_BUILTIN_STYLES.filter(style => !source?.style(style.styleId))],
    documentRunDefaults: source?.documentRunDefaults ?? { ...run, ...(highlight === undefined ? {} : { highlight }), ...(color ? { color: { type: 'rgb' as const, value: color.slice(1) } } : {}) },
    documentParagraphDefaults: source?.documentParagraphDefaults ?? {},
    ...(source?.themeColors ? { themeColors: source.themeColors } : {}),
    ...(source?.themeFonts ? { themeFonts: source.themeFonts } : {}),
  });
}
