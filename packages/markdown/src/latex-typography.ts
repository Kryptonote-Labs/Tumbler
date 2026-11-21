import { latexRomanGlue, type LatexRomanFont } from './latex-font-metrics';

export const texPoint = 96 / 72.27;

type TextSize = Readonly<{ size: number; leading: number }>;

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
    dateGap: number;
  }>;
}>;

/** Standard LaTeX size defaults and Computer Modern interword glue, in CSS pixels. */
export function latexTypography(points: number, prefix: string): LatexTypography {
  const { text, author, title } = classic[points === 12 ? 12 : points === 11 ? 11 : 10];
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
  return {
    text,
    ...latexRomanGlue(romanFont, text.size),
    ...(usesClassicRoman ? { romanFont } : {}),
    ...(english ? { hyphenation: 'english' } : {}),
    inlineTitle: {
      text: title,
      author,
      // The null box at the start of \maketitle receives \topskip.
      before: points * texPoint + 2 * text.size + topsep,
      authorGap: 1.5 * text.size,
      dateGap: text.size,
      after: topsep + 1.5 * text.size,
    },
  };
}
