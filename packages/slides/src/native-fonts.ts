import { scriptSegments } from './text-fonts.ts';
import type { SlideTextRun, NativeTextFonts, SlideParagraph, SlideObject } from './model.ts';

/** Theme/script choices are compiled on import; typing new scripts never consults XML. */
export function nativeScriptRuns(run: SlideTextRun): SlideTextRun[] {
  const context = run.nativeFonts;
  if (!context || !run.text) return [run];
  const segments = /^[\x00-\x7f]*$/.test(run.text)
    ? [{ text: run.text, kind: 'latin' as const, script: 'Latn' }]
    : scriptSegments(run.text, context.language);
  return segments.map((segment) => ({
    ...run,
    text: segment.text,
    fontFamily: nativeTypeface(context, segment.kind, segment.script),
  }));
}
export function nativeTypeface(
  context: NativeTextFonts,
  kind: 'latin' | 'eastAsian' | 'complexScript',
  script: string,
) {
  const authored = context.authored[kind],
    role =
      authored?.startsWith('+mj') || (!authored && context.role === 'major') ? 'major' : 'minor';
  return authored && !authored.startsWith('+')
    ? authored
    : (context.theme?.typeface(role, kind, script) ??
        context.theme?.typeface(role, 'latin') ??
        'Arial');
}
export function nativeParagraphMetrics(paragraph: SlideParagraph): SlideParagraph {
  const largest = Math.max(
    1,
    ...paragraph.runs.map((r) => r.fontSize),
    ...(paragraph.runs.length ? [] : [paragraph.endRun?.fontSize ?? 24]),
  );
  return {
    ...paragraph,
    fontSize: largest,
    ...(paragraph.bulletScale !== undefined ? { bulletSize: largest * paragraph.bulletScale } : {}),
    ...(paragraph.bulletColorFromText
      ? { bulletColor: paragraph.runs[0]?.color ?? paragraph.endRun?.color ?? '#222' }
      : {}),
    ...(paragraph.bulletFontFromText
      ? { bulletFont: paragraph.runs[0]?.fontFamily ?? paragraph.endRun?.fontFamily ?? 'Arial' }
      : {}),
  };
}

export function nativeObjectTheme(
  object: SlideObject,
  theme: NativeTextFonts['theme'],
): SlideObject {
  const context: NativeTextFonts = {
    theme,
    authored: { latin: undefined, eastAsian: undefined, complexScript: undefined },
    role: object.placeholder === 'title' || object.placeholder === 'ctrTitle' ? 'major' : 'minor',
    language: undefined,
    scale: 1,
  };
  const text = (value: SlideObject['text']) =>
    value && {
      ...value,
      paragraphs: value.paragraphs.map((p) => ({
        ...p,
        runs: p.runs.flatMap((run) => nativeScriptRuns({ ...run, nativeFonts: context })),
        ...(p.endRun
          ? {
              endRun: {
                ...p.endRun,
                nativeFonts: context,
                fontFamily: nativeTypeface(context, 'latin', 'Latn'),
              },
            }
          : {}),
      })),
    };
  return {
    ...object,
    text: text(object.text),
    table: object.table && {
      ...object.table,
      cells: object.table.cells.map((cell) => ({ ...cell, text: text(cell.text) })),
    },
  };
}
