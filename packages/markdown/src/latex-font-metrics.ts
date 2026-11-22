import { classicRoman } from './latex-roman-metrics';

export type LatexRomanFont = keyof typeof classicRoman;

const fraction = 2 ** 20;

export function latexRomanGlue(font: LatexRomanFont, size: number) {
  const [space, stretch, shrink, extra] = classicRoman[font].glue;
  return {
    space: (space! / fraction) * size,
    spaceStretch: (stretch! / fraction) * size,
    spaceExtra: (extra! / fraction) * size,
    spaceShrink: (shrink! / fraction) * size,
  };
}

/** Measure the Computer Modern Roman word forms represented directly in OT1. */
export function measureLatexRoman(text: string, font: LatexRomanFont, size: number) {
  if (!/^[A-Za-z0-9.,:;!?()/+*'-]+$/.test(text) || /--|''|[!?]'/.test(text)) return;
  const table = classicRoman[font];
  const pairs: Readonly<Partial<Record<number, readonly ['ligature' | 'kern', number]>>> =
    table.pairs;
  let advance = 0;
  let current = text.charCodeAt(0);
  for (let index = 1; index < text.length; index++) {
    const next = text.charCodeAt(index);
    const pair = pairs[current * 256 + next];
    if (pair?.[0] === 'ligature') {
      current = pair[1];
    } else {
      advance += table.widths[current]! + (pair?.[1] ?? 0);
      current = next;
    }
  }
  return ((advance + table.widths[current]!) / fraction) * size;
}
