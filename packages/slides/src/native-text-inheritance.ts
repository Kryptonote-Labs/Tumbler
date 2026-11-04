import type { SlideParagraph, SlideText, SlideTextRun } from './model.ts';
import { nativeParagraphMetrics, nativeScriptRuns } from './native-fonts.ts';

/** Layout changes replace inherited styles while keeping explicit paragraph and run overrides. */
export function inheritNativeText(text: SlideText, template: SlideText): SlideText {
  const run = (current: SlideTextRun, base: SlideTextRun) => {
    const scale = current.nativeFonts?.scale ?? base.nativeFonts?.scale ?? 1;
    let defaults = {
      ...base,
      fontSize: (base.fontSize * scale) / (base.nativeFonts?.scale ?? 1),
      nativeFonts: base.nativeFonts && { ...base.nativeFonts, scale },
    };
    const paragraphDefaults = current.nativeDefaults;
    for (const field of paragraphDefaults?.nativeAuthored ?? [])
      defaults = { ...defaults, [field]: paragraphDefaults![field] };
    defaults = {
      ...defaults,
      nativeAuthored: paragraphDefaults?.nativeAuthored,
      nativeOwnFonts: paragraphDefaults?.nativeOwnFonts,
      nativeOwnLanguage: paragraphDefaults?.nativeOwnLanguage,
      nativeFonts: defaults.nativeFonts && {
        ...defaults.nativeFonts,
        language: paragraphDefaults?.nativeOwnLanguage ?? defaults.nativeFonts.language,
        authored: {
          latin: paragraphDefaults?.nativeOwnFonts?.latin ?? defaults.nativeFonts.authored.latin,
          eastAsian:
            paragraphDefaults?.nativeOwnFonts?.eastAsian ?? defaults.nativeFonts.authored.eastAsian,
          complexScript:
            paragraphDefaults?.nativeOwnFonts?.complexScript ??
            defaults.nativeFonts.authored.complexScript,
        },
      },
    };
    let result: SlideTextRun = {
      ...defaults,
      text: current.text,
      nativeDefaults: defaults,
      nativeAuthored: current.nativeAuthored,
      nativeOwnFonts: current.nativeOwnFonts,
      nativeOwnLanguage: current.nativeOwnLanguage,
      nativeFonts: defaults.nativeFonts && {
        ...defaults.nativeFonts,
        language: current.nativeOwnLanguage ?? defaults.nativeFonts.language,
        authored: {
          latin: current.nativeOwnFonts?.latin ?? defaults.nativeFonts.authored.latin,
          eastAsian: current.nativeOwnFonts?.eastAsian ?? defaults.nativeFonts.authored.eastAsian,
          complexScript:
            current.nativeOwnFonts?.complexScript ?? defaults.nativeFonts.authored.complexScript,
        },
      },
    };
    for (const field of current.nativeAuthored ?? [])
      result = { ...result, [field]: current[field] };
    return nativeScriptRuns(result);
  };
  return {
    ...text,
    anchor: template.anchor,
    nativeLevels: template.nativeLevels,
    paragraphs: text.paragraphs.map((paragraph) => {
      const base = template.nativeLevels?.[paragraph.level ?? 0] ?? template.paragraphs[0];
      if (!base) return paragraph;
      const defaultRun = base.endRun ?? base.runs[0];
      if (!defaultRun) return paragraph;
      let result: SlideParagraph = {
        ...base,
        lineHeight:
          typeof base.lineHeight === 'number'
            ? (base.lineHeight * (1 - (text.nativeLineReduction ?? 0))) /
              (1 - (template.nativeLineReduction ?? 0) || 1)
            : `${(parseFloat(base.lineHeight) * (1 - (text.nativeLineReduction ?? 0))) / (1 - (template.nativeLineReduction ?? 0) || 1)}px`,
        level: paragraph.level ?? 0,
        nativeAuthored: paragraph.nativeAuthored,
        runs: paragraph.runs.flatMap((current) => run(current, defaultRun)),
        endRun: paragraph.endRun ? run(paragraph.endRun, defaultRun)[0] : undefined,
      };
      for (const field of paragraph.nativeAuthored ?? [])
        result = { ...result, [field]: paragraph[field] };
      return nativeParagraphMetrics(result);
    }),
  };
}
