import { readLatexPackages } from './latex-preamble';
import { latexLength } from './latex-lengths';
import { latexRomanGlue, type LatexRomanFont } from './latex-font-metrics';

export const texPoint = 96 / 72.27;

type TextSize = Readonly<{ size: number; leading: number }>;
type SectionSize = TextSize & { before: number; after: number };

const textSize = (size: number, leading: number): TextSize => ({
  size: size * texPoint,
  leading: leading * texPoint,
});

const classic = {
  10: { text: textSize(10, 12), author: textSize(12, 14), title: textSize(17.28, 22) },
  11: { text: textSize(10.95, 13.6), author: textSize(12, 14), title: textSize(17.28, 22) },
  12: { text: textSize(12, 14.5), author: textSize(14.4, 18), title: textSize(20.74, 25) },
} as const;

export type LatexTypography = Readonly<{
  text: TextSize;
  inTextFloat: Readonly<{
    before: number;
    after: number;
    followingLine: number;
    captionGap: number;
    captionShift: number;
  }>;
  subcaption: TextSize & { gap: number; shift: number; romanFont?: 'cmr9' | 'cmr10' };
  hiddenLinks: boolean;
  latinModern: boolean;
  sections: readonly [SectionSize, SectionSize, SectionSize];
  table: Readonly<{
    separation: number;
    longTableSkip: number;
    naturalLineHeight: number;
    rowStretch: number;
    tallRule: number;
    thinRule: number;
    spaceAboveRule: number;
    spaceBelowRule: number;
  }>;
  list: readonly Readonly<{
    leftMargin: number;
    labelSeparation: number;
    topSeparation: number;
    paragraphSeparation: number;
    itemSeparation: number;
    paragraphStartSeparation: number;
  }>[];
  space: number;
  spaceStretch: number;
  spaceExtra: number;
  sentenceSpacing: boolean;
  spaceShrink: number;
  hyphenation?: 'english';
  romanFont?: LatexRomanFont;
  expansion?: { stretch: number; shrink: number };
  inlineTitle: Readonly<{
    text: TextSize;
    author: TextSize;
    before: number;
    after: number;
    authorGap: number;
    emptyAuthorGap: number;
    dateGap: number;
    emptyDateAfter: number;
  }>;
}>;

/** Standard LaTeX size defaults and Computer Modern interword glue, in CSS pixels. */
export function latexTypography(points: number, prefix: string, twoColumns = false): LatexTypography {
  const { text, author, title } = classic[points === 12 ? 12 : points === 11 ? 11 : 10];
  const ex = text.size * (points === 12 ? 0.430554 : 0.430555);
  const section = (font: TextSize, before: number, after: number): SectionSize => ({
    ...font,
    // CSS line boxes have their own ascent and descent. Keep the same baseline-to-baseline skips.
    before: before * ex + (font.leading - text.leading) / 2 - 0.4 * (font.size - text.size),
    after: after * ex + (text.leading - font.leading) / 2 + 0.4 * (font.size - text.size),
  });
  // The positive topsep of the center list is used at both edges of an inline \maketitle.
  const topsep = (points === 12 ? 10 : 8) * texPoint;
  const babel = /\\usepackage\s*(?:\[([^\]]*)\]\s*)?\{([^}]*\bbabel\b[^}]*)\}/.exec(prefix);
  const languages = babel?.[1]?.split(',').map((language) => language.trim()) ?? [];
  const language =
    languages.find((option) => option.startsWith('main='))?.slice(5) ?? languages.at(-1);
  const english =
    (!babel || /^(?:english|american|USenglish)$/.test(language ?? '')) &&
    !/\\(?:hyphenation|setmainlanguage|defaulthyphenchar)\b/.test(prefix) &&
    !/\\usepackage\s*(?:\[[^\]]*\]\s*)?\{[^}]*\bpolyglossia\b/.test(prefix);
  const romanFont = points === 12 ? 'cmr12' : 'cmr10';
  const usesClassicRoman =
    !/\\(?:fontfamily|fontencoding|setmainfont|renewcommand\s*\{\\rmdefault\})/.test(prefix) &&
    !/\\usepackage\s*(?:\[[^\]]*\]\s*)?\{[^}]*\b(?:fontenc|fontspec|lmodern|times|palatino|newtxtext|newpxtext)\b/.test(
      prefix,
    );
  const packages = readLatexPackages(prefix);
  const latinModern = packages.some(({ name }) => name === 'lmodern');
  const arrayStretch = Number([...prefix.matchAll(/\\(?:re)?newcommand\s*\{\\arraystretch\}\s*\{([0-9.]+)\}/g)].at(-1)?.[1] ?? 1);
  const columnSeparation = [...prefix.matchAll(/\\setlength\s*\{\\tabcolsep\}\s*\{([^{}]+)\}/g)].at(-1)?.[1];
  const microtype = packages.find(item => item.name === 'microtype');
  const caption = packages.some(item => item.name === 'caption' || item.name === 'subcaption');
  const subcaption = points === 12 ? classic[11].text : points === 11 ? classic[10].text : textSize(9, 11);
  // Caption packages add a strut whose baseline is at 70% of the line height.
  const captionShift = ({ size, leading }: TextSize) => 0.2 * leading - 0.4 * size;
  const expansion = microtype && (usesClassicRoman || latinModern) && !microtype.options.some(option => /^expansion\s*=\s*false$/.test(option))
    ? { stretch: 0.02, shrink: 0.02 } : undefined;
  const titleAscent = title.leading / 2 + 0.4 * title.size;
  const titleDescent = title.leading - titleAscent;
  const authorAscent = author.leading / 2 + 0.4 * author.size;
  const textDescent = text.leading / 2 - 0.4 * text.size;
  const inTextSep = (points === 12 ? 14 : 12) * texPoint;
  // Standard classes initialize \@listi through \@listvi with these glue values.
  const list = [
    [25, points === 12 ? 10 : points === 11 ? 9 : 8, points === 12 ? 5 : points === 11 ? 4.5 : 4, points === 12 ? 5 : points === 11 ? 4.5 : 4],
    [22, points === 12 ? 5 : points === 11 ? 4.5 : 4, 2, 2],
    [18.7, 2, 0, 2],
    [17, 2, 0, 2],
    [10, 2, 0, 2],
    [10, 2, 0, 2],
  ].map(([margin, top, paragraph, item], depth) => ({
    leftMargin: (margin! / 10) * text.size,
    labelSeparation: text.size / 2,
    topSeparation: top! * texPoint,
    paragraphSeparation: paragraph! * texPoint,
    itemSeparation: item! * texPoint,
    paragraphStartSeparation: (depth < 2 ? points === 10 ? 2 : 3 : 1) * texPoint,
  }));
  return {
    text,
    list,
    inTextFloat: {
      before: inTextSep - textDescent,
      after: inTextSep,
      // A float's closed vertical box has zero depth, so the next paragraph gets a full baseline skip.
      followingLine: textDescent,
      captionGap: 10 * texPoint + (caption ? 0 : textDescent),
      captionShift: caption ? captionShift(text) : 0,
    },
    subcaption: {
      ...subcaption,
      gap: 6 * texPoint,
      shift: captionShift(subcaption),
      ...(usesClassicRoman ? { romanFont: points === 10 ? 'cmr9' : 'cmr10' } : {}),
    },
    latinModern,
    hiddenLinks: packages.some(item => item.name === 'hyperref' && item.options.includes('hidelinks')),
    sections: [
      section(points === 12 ? textSize(17.28, 22) : textSize(14.4, 18), 3.5, 2.3),
      section(author, 3.25, 1.5),
      section(text, 3.25, 1.5),
    ],
    table: {
      separation: latexLength(columnSeparation, text.size) ?? 6 * texPoint,
      rowStretch: arrayStretch > 0 && Number.isFinite(arrayStretch) ? arrayStretch : 1,
      longTableSkip: 12 * texPoint,
      // TeX's array strut puts its baseline at 70% of the baseline skip.
      naturalLineHeight: 2 * (0.7 * text.leading - 0.4 * text.size),
      tallRule: 0.08 * text.size,
      thinRule: 0.05 * text.size,
      spaceAboveRule: 0.4 * ex,
      spaceBelowRule: 0.65 * ex,
    },
    ...latexRomanGlue(romanFont, text.size),
    sentenceSpacing: !/\\frenchspacing\b/.test(prefix),
    ...(usesClassicRoman ? { romanFont } : {}),
    ...(expansion ? { expansion } : {}),
    ...(english ? { hyphenation: 'english' } : {}),
    inlineTitle: {
      text: title,
      author,
      // The null box receives \topskip, then the title advances by its full baselineskip.
      before: (twoColumns ? 0 : points * texPoint) + 2 * text.size + title.leading - titleAscent,
      authorGap: 1.5 * text.size + author.leading - titleDescent - authorAscent,
      emptyAuthorGap: 1.5 * text.size + author.leading - titleDescent,
      dateGap: text.size,
      after: topsep + 1.5 * text.size,
      // The following line still receives its full baseline skip when the date box is absent.
      emptyDateAfter: 2.5 * text.size + (twoColumns ? 0 : textDescent),
    },
  };
}
