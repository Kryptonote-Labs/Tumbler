import { texPoint } from './latex-typography';

export type TitleListKind = 'itemize' | 'enumerate';

export const isTitleList = (name: string): name is TitleListKind =>
  name === 'itemize' || name === 'enumerate';

/** Standard LaTeX list margins, glue, and marker shapes. */
export function titleListStyle(kind: TitleListKind, depth: number, points: number) {
  const margins = [25, 22, 18.7, 17, 10, 10];
  const margin = (margins[depth] ?? 10) * texPoint;
  const top = depth === 0 ? (points === 12 ? 10 : points === 11 ? 9 : 8) : depth === 1 ? 4 : 2;
  const item = depth === 0 ? (points === 12 ? 5 : points === 11 ? 4.5 : 4) : depth === 1 ? 2 : 0;
  return {
    margin,
    gap: 5 * texPoint,
    top: top * texPoint,
    item: item * texPoint,
    marker(number: number) {
      if (kind === 'itemize') return ['•', '–', '∗', '·'][depth % 4] ?? '•';
      if (depth === 1 && number <= 26) return '(' + String.fromCharCode(96 + number) + ')';
      if (depth === 3 && number <= 26) return String.fromCharCode(64 + number) + '.';
      return number + '.';
    },
  };
}
