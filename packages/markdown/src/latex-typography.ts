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
  sections: readonly [SectionSize, SectionSize, SectionSize];
  table: Readonly<{
    separation: number;
    longTableSkip: number;
    naturalLineHeight: number;
    tallRule: number;
    thinRule: number;
    spaceAboveRule: number;
    spaceBelowRule: number;
  }>;
  space: number;
  spaceStretch: number;
  spaceShrink: number;
  hyphenation?: 'english';
  romanFont?: LatexRomanFont;
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
export function latexTypography(points: number, prefix: string): LatexTypography {
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
  const titleAscent = title.leading / 2 + 0.4 * title.size;
  const titleDescent = title.leading - titleAscent;
  const authorAscent = author.leading / 2 + 0.4 * author.size;
  return {
    text,
    sections: [
      section(points === 12 ? textSize(17.28, 22) : textSize(14.4, 18), 3.5, 2.3),
      section(author, 3.25, 1.5),
      section(text, 3.25, 1.5),
    ],
    table: {
      separation: 6 * texPoint,
      longTableSkip: 12 * texPoint,
      // TeX's array strut puts its baseline at 70% of the baseline skip.
      naturalLineHeight: 2 * (0.7 * text.leading - 0.4 * text.size),
      tallRule: 0.08 * text.size,
      thinRule: 0.05 * text.size,
      spaceAboveRule: 0.4 * ex,
      spaceBelowRule: 0.65 * ex,
    },
    ...latexRomanGlue(romanFont, text.size),
    ...(usesClassicRoman ? { romanFont } : {}),
    ...(english ? { hyphenation: 'english' } : {}),
    inlineTitle: {
      text: title,
      author,
      // The null box receives \topskip, then the title advances by its full baselineskip.
      before: points * texPoint + 2 * text.size + title.leading - titleAscent,
      authorGap: 1.5 * text.size + author.leading - titleDescent - authorAscent,
      emptyAuthorGap: 1.5 * text.size + author.leading - titleDescent,
      dateGap: text.size,
      after: topsep + 1.5 * text.size,
      // The following line still receives its full baseline skip when the date box is absent.
      emptyDateAfter: 2.5 * text.size + text.leading / 2 - 0.4 * text.size,
    },
  };
}
