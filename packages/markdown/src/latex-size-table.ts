import type { LatexBaseSize } from './latex-class';
export const texPoint = 96 / 72.27;

export const latexFontSizes = ['tiny', 'scriptsize', 'footnotesize', 'small', 'normalsize', 'large', 'Large', 'LARGE', 'huge', 'Huge'] as const;

// Font size and natural baseline skip from LaTeX and extsizes's size*.clo files.
const sizes = {
  8: [[5, 6], [5, 6], [6, 7], [7, 8], [8, 9.5], [10, 11], [10.95, 12], [12, 14], [14.4, 18], [17.28, 22]],
  9: [[5, 6], [5, 6], [7, 8], [8, 9], [9, 10], [10, 12], [10.95, 13], [12, 14], [14.4, 18], [17.28, 22]],
  10: [[5, 6], [7, 8], [8, 9.5], [9, 11], [10, 12], [12, 14], [14.4, 18], [17.28, 22], [20.74, 25], [24.88, 30]],
  11: [[6, 7], [8, 9.5], [9, 11], [10, 12], [10.95, 13.6], [12, 14], [14.4, 18], [17.28, 22], [20.74, 25], [24.88, 30]],
  12: [[6, 7], [8, 9.5], [10, 12], [10.95, 13.6], [12, 14.5], [14.4, 18], [17.28, 22], [20.74, 25], [24.88, 30], [24.88, 30]],
  14: [[6, 7], [8, 9.5], [10, 12], [12, 14], [14.4, 17], [17.28, 22], [20.74, 25], [24.88, 30], [29.86, 35], [35.83, 40]],
  17: [[8, 9], [10, 11], [12, 14], [14.4, 17], [17.28, 22], [20.74, 25], [24.88, 30], [29.86, 35], [35.83, 41], [42.99, 52]],
  20: [[10, 11], [12, 14], [14.4, 17], [17.28, 22], [20.74, 25], [24.88, 30], [29.86, 35], [35.83, 41], [42.99, 52], [51.59, 63]],
} satisfies Record<LatexBaseSize, readonly (readonly [number, number])[]>;

export function latexBaseFontMetrics(points: LatexBaseSize, command: (typeof latexFontSizes)[number]) {
  const [size, leading] = sizes[points][latexFontSizes.indexOf(command)]!;
  return { size: size * texPoint, leading: leading * texPoint };
}

/** The font and baseline skip selected by a size declaration, in CSS pixels. */
export function latexFontSize(command: string, normalSize = 10 * texPoint) {
  const points = normalSize / texPoint;
  const index = latexFontSizes.findIndex((name) => name === command);
  if (index < 0) return;
  // The normal font size identifies the class table, including design sizes such as 14.4pt.
  const key = ([8, 9, 10, 11, 12, 14, 17, 20] as const).find(
    (size) => Math.abs(sizes[size][4]![0] - points) < 0.01,
  ) ?? (points >= 11.5 ? 12 : points >= 10.5 ? 11 : 10);
  const [size, leading] = sizes[key][index]!;
  return { size: size * texPoint, leading: leading * texPoint };
}
