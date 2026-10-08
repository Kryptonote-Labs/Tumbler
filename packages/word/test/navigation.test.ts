import { expect, test } from 'bun:test';
import {
  NativeWordDocument,
  wordAdjacentLine,
  type WordLayout,
  type WordLayoutColumn,
  type WordLayoutLine,
  type WordLayoutTableCell,
} from '../src/index.ts';

const measure = { measure: (text: string) => ({ width: text.length * 6, ascent: 10, descent: 3 }) };
const template = new NativeWordDocument().layout(measure).pages[0]!;
function line(id: number, y: number, x = 50, startOffset = 0): WordLayoutLine {
  return {
    paragraphElementId: id,
    x,
    y,
    width: 100,
    height: 16,
    baseline: y + 12,
    startOffset,
    endOffset: startOffset + 10,
    fragments: [],
    marker: undefined,
  };
}
function column(lines: WordLayoutLine[], x = 50): WordLayoutColumn {
  return { index: 0, x, y: 50, width: 200, height: 500, lines, tables: [], unsupportedBlocks: [] };
}
function layout(...pages: WordLayoutColumn[][]): WordLayout {
  return {
    fragmentCount: 0,
    pages: pages.map((columns, index) => ({ ...template, index, columns })),
  };
}
const at = (line: WordLayoutLine, pageIndex = 0) => ({
  pageIndex,
  paragraphElementId: line.paragraphElementId,
  startOffset: line.startOffset,
});

test('vertical movement visits each wrapped line and paragraph, including document edges', () => {
  const lines = [line(1, 50), line(1, 70, 50, 10), line(2, 120)];
  const document = layout([column(lines)]);
  expect(wordAdjacentLine(document, at(lines[0]!), 'down', 80)?.line).toBe(lines[1]);
  expect(wordAdjacentLine(document, at(lines[1]!), 'down', 80)?.line).toBe(lines[2]);
  expect(wordAdjacentLine(document, at(lines[2]!), 'up', 80)?.line).toBe(lines[1]);
  expect(wordAdjacentLine(document, at(lines[0]!), 'up', 80)).toBeUndefined();
  expect(wordAdjacentLine(document, at(lines[2]!), 'down', 80)).toBeUndefined();
});

test('columns and pages continue the reading flow and preserve horizontal position', () => {
  const first = line(1, 500);
  const second = line(2, 50, 300);
  const third = line(3, 50, 60);
  const document = layout([column([first]), column([second], 300)], [], [column([third], 60)]);
  expect(wordAdjacentLine(document, at(first), 'down', 80)).toEqual({
    pageIndex: 0,
    line: second,
    x: 330,
  });
  expect(wordAdjacentLine(document, at(second), 'down', 330)).toEqual({
    pageIndex: 2,
    line: third,
    x: 90,
  });
  expect(wordAdjacentLine(document, at(third, 2), 'up', 90)).toEqual({
    pageIndex: 0,
    line: second,
    x: 330,
  });
});

test('table movement follows lines in the current cell and then the cell below', () => {
  const first = line(1, 60);
  const next = line(1, 90, 50, 10);
  const neighbour = line(2, 75, 160);
  const below = line(3, 150);
  const after = line(5, 220);
  const cell = (
    id: number,
    row: number,
    x: number,
    y: number,
    lines: WordLayoutLine[],
  ): WordLayoutTableCell => ({
    cellElementId: id,
    continuationElementIds: [],
    row,
    column: x === 40 ? 0 : 1,
    columnSpan: 1,
    rowSpan: 1,
    x,
    y,
    width: 110,
    height: 80,
    lines,
    tables: [],
  });
  const flow = column([after]);
  const document = layout([
    {
      ...flow,
      tables: [
        {
          tableElementId: 1,
          x: 40,
          y: 50,
          width: 220,
          height: 160,
          cells: [
            cell(1, 0, 40, 50, [first, next]),
            cell(2, 0, 150, 50, [neighbour]),
            cell(3, 1, 40, 130, [below]),
            cell(4, 1, 150, 130, [line(4, 150, 160)]),
          ],
        },
      ],
    },
  ]);
  expect(wordAdjacentLine(document, at(first), 'down', 90)?.line).toBe(next);
  expect(wordAdjacentLine(document, at(next), 'down', 90)?.line).toBe(below);
  expect(wordAdjacentLine(document, at(below), 'down', 90)?.line).toBe(after);
  expect(wordAdjacentLine(document, at(below), 'up', 90)?.line).toBe(next);
});

test('header and footer navigation stay in the active story', () => {
  const header = [line(1, 10), line(2, 30)];
  const footer = [line(3, 700), line(4, 720)];
  const document: WordLayout = {
    fragmentCount: 0,
    pages: [
      { ...template, headerLines: header, footerLines: footer, columns: [column([line(5, 50)])] },
    ],
  };
  expect(wordAdjacentLine(document, { ...at(header[0]!), story: 'header' }, 'down', 80)?.line).toBe(
    header[1],
  );
  expect(
    wordAdjacentLine(document, { ...at(header[1]!), story: 'header' }, 'down', 80),
  ).toBeUndefined();
  expect(wordAdjacentLine(document, { ...at(footer[1]!), story: 'footer' }, 'up', 80)?.line).toBe(
    footer[0],
  );
});
