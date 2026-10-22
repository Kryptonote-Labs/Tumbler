import type { WordContentBlock } from '../../packages/word/src/index.ts';
import { fixtures } from './fixtures.ts';

function permutations<T>(items: readonly T[]): T[][] {
  return items.length ? items.flatMap((item, index) => permutations(items.filter((_, i) => i !== index)).map(rest => [item, ...rest])) : [[]];
}
const border = { style: 'single', widthPoints: 1, color: '#123456' } as const;
// All side insertion orders, and every subset of the four supported cell formats.
export const combinations: WordContentBlock[] = [
  ...permutations(['top', 'left', 'bottom', 'right'] as const).map(sides => ({
    kind: 'paragraph' as const, runs: [], paragraph: { borders: Object.fromEntries(sides.map(side => [side, border])) },
  })),
  ...Array.from({ length: 16 }, (_, mask): WordContentBlock => {
    const cell = fixtures.cell[0].rows[0]![0]!;
    const format = cell.format!;
    return { kind: 'table', columnWidths: [100, 100], rows: [[{ ...cell, format: {
      ...(mask & 1 ? { verticalAlignment: format.verticalAlignment } : {}),
      ...(mask & 2 ? { margins: format.margins } : {}),
      ...(mask & 4 ? { shading: format.shading } : {}),
      ...(mask & 8 ? { borders: format.borders } : {}),
    } }]] };
  }),
];
