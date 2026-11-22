export type LatexLine = Readonly<{
  from: number;
  to: number;
  spaceAdjustment: number;
  letterSpacing?: number;
  hyphen?: true;
}>;

type Glue = { width: number; stretch: number; shrink: number };

export type LatexTextMetrics = Readonly<{
  word(text: string, from: number, to: number): number;
  space: number;
  stretch: number;
  shrink: number;
  expansion?: { stretch: number; shrink: number };
  gapAfter?(word: string): Glue;
  hyphenate?(word: string): readonly number[];
}>;

type Word = { from: number; to: number; advance: number };
type Break = { word: number; offset: number; hyphen?: true };
type Choice = { end: number; adjustment: number; cost: number; badness: number; letters?: number };

function planLines(
  text: string,
  words: readonly Word[],
  width: number,
  indent: number,
  metrics: LatexTextMetrics,
  hyphenation: boolean,
) {
  const points: Break[] = [];
  const advances = [0];
  const glue = [{ width: 0, stretch: 0, shrink: 0 }];
  for (const [index, word] of words.entries()) {
    const token = text.slice(word.from, word.to);
    points.push({ word: index, offset: word.from });
    if (hyphenation) {
      const cuts = new Set(metrics.hyphenate?.(token));
      for (const offset of [...cuts].sort((a, b) => a - b)) {
        if (Number.isInteger(offset) && offset > 0 && offset < token.length)
          points.push({ word: index, offset: word.from + offset, hyphen: true });
      }
    }
    advances.push(advances[index]! + word.advance);
    const gap = metrics.gapAfter?.(token) ?? { width: metrics.space, stretch: metrics.stretch, shrink: metrics.shrink };
    const prior = glue[index]!;
    glue.push({ width: prior.width + gap.width, stretch: prior.stretch + gap.stretch, shrink: prior.shrink + gap.shrink });
  }
  points.push({ word: words.length, offset: text.length });

  const terminal = points.length - 1;
  const best = new Array<Choice>(points.length);
  best[terminal] = { end: terminal, adjustment: 0, cost: 0, badness: 0 };
  for (let start = terminal - 1; start >= 0; start--) {
    const first = points[start]!;
    const word = words[first.word]!;
    const firstWidth = first.hyphen
      ? metrics.word(text.slice(first.offset, word.to), first.offset, word.to)
      : word.advance;
    const available = start === 0 ? width - indent : width;
    let choice: Choice | undefined;
    for (let end = start + 1; end < points.length; end++) {
      const last = points[end]!;
      const finalWord = last.hyphen ? last.word : last.word - 1;
      const finalOffset = last.hyphen ? last.offset : words[finalWord]!.to;
      const gaps = finalWord - first.word;
      const beginGlue = glue[first.word]!;
      const endGlue = glue[finalWord]!;
      const gapWidth = endGlue.width - beginGlue.width;
      const lineShrink = endGlue.shrink - beginGlue.shrink;
      const lineStretch = endGlue.stretch - beginGlue.stretch;
      const advance =
        gaps === 0
          ? last.hyphen
            ? metrics.word(text.slice(first.offset, finalOffset) + '-', first.offset, finalOffset)
            : firstWidth
          : firstWidth +
            advances[finalWord]! -
            advances[first.word + 1]! +
            gapWidth +
            (last.hyphen
              ? metrics.word(
                  text.slice(words[finalWord]!.from, finalOffset) + '-',
                  words[finalWord]!.from,
                  finalOffset,
                )
              : words[finalWord]!.advance);
      const remaining = available - advance;
      const glyphs = advance - gapWidth;
      const expansion = glyphs * (remaining < 0 ? metrics.expansion?.shrink ?? 0 : metrics.expansion?.stretch ?? 0);
      if ((gaps || expansion) && remaining < -(lineShrink + expansion)) {
        if (!last.hyphen) break;
        continue;
      }
      if (!best[end] || (last.hyphen && remaining < 0 && !gaps)) continue;
      const capacity = (remaining < 0 ? lineShrink : lineStretch) + expansion;
      const ratio =
        remaining === 0
          ? 0
          : capacity > 0
            ? Math.abs(remaining) / capacity
            : Number.POSITIVE_INFINITY;
      const badness = end === terminal && remaining >= 0 ? 0 : Math.min(10_000, 100 * ratio ** 3);
      const cost =
        (10 + badness) ** 2 +
        best[end]!.cost +
        (last.hyphen ? 50 ** 2 : 0) +
        (first.hyphen && last.hyphen ? 10_000 : 0);
      if (!choice || cost < choice.cost) {
        const justify = end !== terminal || remaining < 0;
        const scaled = justify ? Math.sign(remaining) * Math.min(1, ratio) * expansion : 0;
        const characters = scaled ? text.slice(first.offset, finalOffset).replace(/[ \t\r\n\f]+/g, ' ').length + Number(!!last.hyphen) : 0;
        const adjustment = gaps ? (gapWidth - gaps * metrics.space + (justify ? remaining - scaled : 0)) / gaps : 0;
        choice = { end, cost, adjustment, badness, ...(scaled && characters ? { letters: scaled / characters } : {}) };
      }
    }
    if (choice) best[start] = choice;
  }

  const lines: LatexLine[] = [];
  let highestBadness = 0;
  for (let start = 0; start < terminal;) {
    const choice = best[start];
    if (!choice) return;
    const end = points[choice.end]!;
    highestBadness = Math.max(highestBadness, choice.badness);
    lines.push({
      from: points[start]!.offset,
      to: end.hyphen ? end.offset : words[end.word - 1]!.to,
      spaceAdjustment: choice.adjustment,
      ...(choice.letters ? { letterSpacing: choice.letters } : {}),
      ...(end.hyphen ? { hyphen: true } : {}),
    });
    start = choice.end;
  }
  return { lines, highestBadness, cost: best[0]!.cost };
}

/**
 * Choose paragraph breaks as a group. The caller supplies font advances in its layout units.
 * Offsets refer to the original text, including any whitespace between words.
 */
export function composeLatexParagraph(
  text: string,
  width: number,
  indent: number,
  metrics: LatexTextMetrics,
): LatexLine[] {
  if (!(width > 0)) return [];
  // NBSP and joined words stay inside a box. TeX collapses ordinary source whitespace.
  const words: Word[] = Array.from(text.matchAll(/[^ \t\r\n\f]+/g), (match) => ({
    from: match.index,
    to: match.index + match[0].length,
    advance: metrics.word(match[0], match.index, match.index + match[0].length),
  }));
  if (!words.length || words.some(({ advance }) => !Number.isFinite(advance))) return [];
  const plain = planLines(text, words, width, indent, metrics, false);
  if (metrics.hyphenate && (!plain || plain.highestBadness > 100)) {
    const hyphenated = planLines(text, words, width, indent, metrics, true);
    if (hyphenated && (!plain || hyphenated.cost < plain.cost)) return hyphenated.lines;
  }
  return plain?.lines ?? [];
}

/** Standard TeX space factors for plain Roman prose at a word boundary. */
export function latexInterwordGlue(word: string, metrics: Pick<LatexTextMetrics, 'space' | 'stretch' | 'shrink'> & { extra: number }) {
  const tail = word.replace(/[)\]'"’”]+$/, '');
  const factor = /[A-Z][.?!:;,]$/.test(tail) ? 1
    : /[.?!]$/.test(tail) ? 3
      : tail.endsWith(':') ? 2 : tail.endsWith(';') ? 1.5 : tail.endsWith(',') ? 1.25 : 1;
  return {
    width: metrics.space + (factor === 3 ? metrics.extra : 0),
    stretch: metrics.stretch * factor,
    shrink: metrics.shrink / factor,
  };
}
