import type { WordContentBlock } from '../../packages/word/src/index.ts';

const border = { style: 'single', widthPoints: 1, color: '#123456' } as const;
export const fixtures = {
  cell: [{ kind: 'table', columnWidths: [100, 100], rows: [
    [{ gridSpan: 2, verticalMerge: 'restart', format: {
      shading: '#abcdef', verticalAlignment: 'center',
      margins: { topTwips: 10, endTwips: 20, bottomTwips: 30, startTwips: 40 },
      borders: { right: border, bottom: border, left: border, top: border },
    }, blocks: [{ kind: 'paragraph', runs: [{ text: 'Merged cell' }] }] }],
    [{ gridSpan: 2, verticalMerge: 'continue', blocks: [{ kind: 'paragraph', runs: [] }] }],
  ] }],
  borders: [{ kind: 'paragraph', runs: [{ text: 'Borders' }], paragraph: { borders: { right: border, left: border, bottom: border, top: border } } }],
  emptyTabs: [{ kind: 'paragraph', runs: [{ text: 'Empty tabs' }], positioning: { tabs: [] } }],
  clearTabs: [{ kind: 'paragraph', runs: [{ text: 'Clear one inherited tab' }], positioning: { tabs: [{ positionTwips: 720, alignment: 'clear', leader: 'none' }] } }],
} satisfies Record<string, WordContentBlock[]>;
