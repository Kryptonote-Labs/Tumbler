import { expect, test } from 'bun:test';
import {
  NativeWordDocument,
  wordTableAvailableWidth,
  type WordContentBlock,
} from '../src/index.ts';

const measure = { measure: (text: string) => ({ width: text.length * 5, ascent: 8, descent: 2 }) };
const paragraph: WordContentBlock = { kind: 'paragraph', runs: [{ text: 'Body' }] };
const table: WordContentBlock = {
  kind: 'table',
  columnWidths: [100],
  rows: [[{ blocks: [paragraph] }]],
};

test('table fitting uses its actual unequal-width column', () => {
  const model = new NativeWordDocument();
  model.updateSettings({
    finalSection: {
      columns: [
        { widthTwips: 2000, spaceTwips: 400 },
        { widthTwips: 6000, spaceTwips: 0 },
      ],
    },
  });
  model.update([{ kind: 'paragraph', runs: [{ text: '\u2028', breakType: 'column' }] }, table]);
  const layout = model.layout(measure);
  const column = layout.pages[0]!.columns[1]!;
  expect(column.tables).toHaveLength(1);
  expect(wordTableAvailableWidth(layout, model.blocks, column.tables[0]!.tableElementId)).toBe(
    column.width,
  );
});

test('header fitting uses the owning page after changing paper size and margins', () => {
  const model = new NativeWordDocument({ content: [paragraph] });
  model.updateSettings({
    finalSection: {
      pageWidthTwips: 18000,
      marginLeftTwips: 1000,
      marginRightTwips: 1000,
      gutterTwips: 200,
    },
  });
  const header = model.updateStory({ section: 0, kind: 'header', type: 'default' }, [table]);
  const layout = model.layout(measure);
  const id = layout.pages[0]!.headerTables[0]!.tableElementId;
  expect(wordTableAvailableWidth(layout, header.blocks, id, 'header')).toBe(790);
});

test('nested fitting uses the containing cell width minus its padding', () => {
  const model = new NativeWordDocument({
    content: [
      {
        kind: 'table',
        columnWidths: [240],
        rows: [
          [
            {
              format: { margins: { startTwips: 200, endTwips: 400, topTwips: 0, bottomTwips: 0 } },
              blocks: [table],
            },
          ],
        ],
      },
    ],
  });
  const layout = model.layout(measure);
  const nested = layout.pages[0]!.columns[0]!.tables[0]!.cells[0]!.tables[0]!;
  expect(wordTableAvailableWidth(layout, model.blocks, nested.tableElementId)).toBe(210);
});

test('centered and right-aligned tables ignore paragraph-side table indentation', () => {
  const model = new NativeWordDocument({ content: [table] });
  const layout = model.layout(measure);
  const block = model.blocks[0]!;
  if (block.kind !== 'table') throw new Error('Expected table');
  for (const alignment of ['center', 'end'] as const) {
    const blocks = [{ ...block, properties: { ...block.properties, alignment, indentTwips: 400 } }];
    expect(wordTableAvailableWidth(layout, blocks, block.elementId)).toBe(
      layout.pages[0]!.columns[0]!.width,
    );
  }
});
