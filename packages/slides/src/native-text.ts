import { nativeScriptRuns, nativeParagraphMetrics } from './native-fonts.ts';
import { nativeColour } from './native-shape.ts';
import { presentationFormattingPatch } from './authoring-validation.ts';
import type { NativeParagraphField } from './model.ts';
import type { FormattingPatch } from '@tumblerjs/core';
import type { SlideText, SlideTextRun, SlideParagraph } from './model.ts';
import type { PresentationCommand } from './commands.ts';

type TextCommand = Extract<
  PresentationCommand,
  { name: 'edit-text' | 'format-text' | 'paragraph' }
>;
const value = (text: SlideText) =>
  text.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join('\n');

function coalesceRuns(runs: readonly SlideTextRun[]) {
  const result: SlideTextRun[] = [];
  for (const run of runs.flatMap(nativeScriptRuns)) {
    const last = result.at(-1);
    const { text: a, ...left } = last ?? run,
      { text: b, ...right } = run;
    if (last && JSON.stringify(left) === JSON.stringify(right))
      result[result.length - 1] = { ...last, text: last.text + run.text };
    else if (run.text) result.push(run);
  }
  return result;
}
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
function boundary(text: string, index: number) {
  if (index === 0 || index === text.length) return true;
  if (text.charCodeAt(index - 1) < 128 && text.charCodeAt(index) < 128) return true;
  return segmenter.segment(text).containing(index)?.index === index;
}

function formatRun(
  run: SlideTextRun,
  patch: FormattingPatch | undefined,
  base: SlideTextRun,
): SlideTextRun {
  if (!patch?.text) return run;
  base = run.nativeDefaults ? { ...run.nativeDefaults, text: run.text } : base;
  let next = { ...run };
  const t = patch.text;
  for (const field of ['bold', 'italic', 'fontFamily'] as const) {
    const change = t[field];
    if (change) next = { ...next, [field]: 'set' in change ? change.set : base[field] };
  }
  if (t.fontSize)
    next.fontSize =
      'set' in t.fontSize
        ? ((t.fontSize.set * 4) / 3) * (run.nativeFonts?.scale ?? 1)
        : base.fontSize;
  if (t.underline) {
    next.underline = 'set' in t.underline ? t.underline.set !== 'none' : base.underline;
    next.underlineStyle =
      'set' in t.underline
        ? t.underline.set === 'double'
          ? 'dbl'
          : t.underline.set === 'none'
            ? 'none'
            : 'sng'
        : base.underlineStyle;
  }
  if (t.fontFamily && run.nativeFonts)
    next.nativeFonts = {
      ...run.nativeFonts,
      authored: {
        ...run.nativeFonts.authored,
        latin: 'set' in t.fontFamily ? t.fontFamily.set : base.nativeFonts?.authored.latin,
      },
    };
  if (t.color)
    next.color =
      'set' in t.color && t.color.set.type === 'rgb' ? nativeColour(t.color.set.value) : base.color;
  const authored = new Set(run.nativeAuthored);
  for (const [change, fields] of [
    [t.bold, ['bold']],
    [t.italic, ['italic']],
    [t.fontSize, ['fontSize']],
    [t.underline, ['underline', 'underlineStyle']],
    [t.color, ['color']],
  ] as const)
    if (change)
      for (const field of fields) {
        if ('set' in change || base.nativeAuthored?.includes(field)) authored.add(field);
        else authored.delete(field);
      }
  if (t.fontFamily)
    next.nativeOwnFonts = {
      latin: 'set' in t.fontFamily ? t.fontFamily.set : base.nativeOwnFonts?.latin,
      eastAsian: run.nativeOwnFonts?.eastAsian,
      complexScript: run.nativeOwnFonts?.complexScript,
    };
  return { ...next, nativeAuthored: [...authored] };
}

function formatParagraph(
  p: SlideParagraph,
  patch: FormattingPatch | undefined,
  base: SlideParagraph,
): SlideParagraph {
  const align = patch?.block?.horizontalAlignment;
  if (!align) return p;
  return {
    ...p,
    nativeAuthored:
      'set' in align
        ? [...new Set([...(p.nativeAuthored ?? []), 'align', 'distributed'] as const)]
        : p.nativeAuthored?.filter((field) => field !== 'align' && field !== 'distributed'),
    distributed: 'set' in align ? false : (base.distributed ?? false),
    align:
      'set' in align
        ? ({ start: 'left', center: 'center', end: 'right', justify: 'justify' } as const)[
            align.set
          ]
        : base.align,
  };
}

/** Editing a run touches only its paragraph model. No preservation XML participates in this path. */
export function editNativeText(
  text: SlideText,
  command: TextCommand,
  baseline: SlideText = text,
): SlideText {
  const original = value(text);
  if (command.start < 0 || command.end < command.start || command.end > original.length)
    throw new RangeError('Invalid text range.');
  if (!boundary(original, command.start) || !boundary(original, command.end))
    throw new RangeError('Text ranges must follow grapheme boundaries.');
  if (
    command.name === 'edit-text' &&
    (!command.value.isWellFormed() ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\r\uFFFE\uFFFF]/u.test(command.value))
  )
    throw new RangeError('Invalid XML text character.');
  const fallback: SlideTextRun = {
    text: '',
    fontFamily: 'Aptos',
    fontSize: 32,
    color: '#000000',
    bold: false,
    italic: false,
    underline: false,
  };
  let offset = 0;
  const ranges = text.paragraphs.map((paragraph, i) => {
    const start = offset;
    const length = paragraph.runs.reduce((n, r) => n + r.text.length, 0);
    offset += length + 1;
    return {
      paragraph,
      start,
      end: start + length,
      base:
        baseline.nativeLevels?.[paragraph.level ?? 0] ??
        baseline.paragraphs[i] ??
        baseline.paragraphs[0] ??
        paragraph,
    };
  });
  if (command.name === 'paragraph') {
    let number = 0;
    return {
      ...text,
      anchor: command.verticalAlignment ?? text.anchor,
      paragraphs: ranges.map(({ paragraph: p, start, end }) => {
        if (
          command.start > end ||
          command.end < start ||
          (command.end === start && command.start !== command.end)
        )
          return p;
        const level = command.level ?? p.level ?? 0;
        const bullet =
          command.bullet === undefined
            ? p.bullet
            : command.bullet === 'none'
              ? ''
              : command.bullet === 'bullet'
                ? '•'
                : `${++number}.`;
        return {
          ...p,
          nativeAuthored: [
            ...new Set<NativeParagraphField>([
              ...(p.nativeAuthored ?? []),
              ...(command.bullet !== undefined
                ? (['bullet', 'marginLeft', 'indent'] as const)
                : []),
              ...(command.level !== undefined ? (['marginLeft', 'indent'] as const) : []),
              ...(command.before !== undefined ? (['before'] as const) : []),
              ...(command.after !== undefined ? (['after'] as const) : []),
              ...(command.lineSpacing !== undefined ? (['lineHeight'] as const) : []),
            ]),
          ],
          level,
          bullet,
          ...(command.bullet !== undefined
            ? {
                marginLeft: command.bullet === 'none' ? 0 : 36 * (level + 1),
                indent: command.bullet === 'none' ? 0 : -30,
              }
            : command.level !== undefined
              ? {
                  marginLeft: (p.bullet ? p.marginLeft - (p.level ?? 0) * 36 : 36) + level * 36,
                  indent: p.bullet ? p.indent : -30,
                }
              : {}),
          ...(command.lineSpacing !== undefined ? { lineHeight: command.lineSpacing } : {}),
          ...(command.before !== undefined ? { before: (command.before * 4) / 3 } : {}),
          ...(command.after !== undefined ? { after: (command.after * 4) / 3 } : {}),
        };
      }),
    };
  }
  const patch = presentationFormattingPatch(
    command.name === 'format-text' ? command.patch : command.formatting,
  );
  function slice(
    p: SlideParagraph,
    start: number,
    end: number,
    format: boolean,
    base: SlideParagraph,
  ) {
    let at = 0;
    const output: SlideTextRun[] = [];
    for (const run of p.runs) {
      const from = Math.max(start, at),
        to = Math.min(end, at + run.text.length);
      if (to > from)
        output.push(
          format
            ? formatRun(
                { ...run, text: run.text.slice(from - at, to - at) },
                patch,
                base.endRun ?? base.runs[0] ?? fallback,
              )
            : { ...run, text: run.text.slice(from - at, to - at) },
        );
      at += run.text.length;
    }
    return output;
  }
  if (command.name === 'format-text')
    return {
      ...text,
      paragraphs: ranges.map(({ paragraph: p, start, end, base }) => {
        if (command.start > end || command.end < start) return p;
        const a = Math.max(0, command.start - start),
          b = Math.min(end - start, command.end - start);
        const next = formatParagraph(p, patch, base);
        return nativeParagraphMetrics({
          ...next,
          runs: coalesceRuns([
            ...slice(p, 0, a, false, base),
            ...slice(p, a, b, true, base),
            ...slice(p, b, end - start, false, base),
          ]),
          ...(p.endRun && b === end - start
            ? { endRun: formatRun(p.endRun, patch, base.endRun ?? base.runs[0] ?? fallback) }
            : {}),
        });
      }),
    };
  const first = ranges.findIndex((p) => command.start <= p.end),
    last = ranges.findIndex((p) => command.end <= p.end);
  const begin = ranges[first],
    finish = ranges[last];
  if (!begin || !finish) throw new RangeError('Invalid text paragraph.');
  let at = begin.start,
    typing = begin.paragraph.endRun ?? begin.paragraph.runs[0] ?? fallback;
  for (const run of begin.paragraph.runs) {
    if (command.start >= at && command.start <= at + run.text.length) {
      typing = run;
      break;
    }
    at += run.text.length;
  }
  const lines = command.value.split('\n');
  const before = slice(begin.paragraph, 0, command.start - begin.start, false, begin.base);
  const after = slice(
    finish.paragraph,
    command.end - finish.start,
    finish.end - finish.start,
    false,
    finish.base,
  );
  const inserted = lines.map((line, i): SlideParagraph => {
    const p = i === 0 ? begin.paragraph : finish.paragraph;
    const runs = [
      ...(i === 0 ? before : []),
      ...(line
        ? [
            formatRun(
              { ...typing, text: line },
              patch,
              begin.base.endRun ?? begin.base.runs[0] ?? fallback,
            ),
          ]
        : []),
      ...(i === lines.length - 1 ? after : []),
    ];
    const endRun = formatRun(
      { ...typing, text: '' },
      patch,
      begin.base.endRun ?? begin.base.runs[0] ?? fallback,
    );
    return nativeParagraphMetrics({
      ...formatParagraph(p, patch, begin.base),
      runs: coalesceRuns(runs),
      endRun: runs.length ? undefined : endRun,
    });
  });
  return {
    ...text,
    paragraphs: [
      ...text.paragraphs.slice(0, first),
      ...inserted,
      ...text.paragraphs.slice(last + 1),
    ],
  };
}
