import { expect, test } from "bun:test";
import { SparseAxisGeometry } from "@tumblerjs/core";
import { spreadsheetSelectionRects } from "../src/spreadsheet-selection.ts";
const rows = new SparseAxisGeometry(1048576, 20),
  columns = new SparseAxisGeometry(16384, 60);
const base = {
  rows,
  columns,
  scrollTop: 0,
  scrollLeft: 0,
  width: 800,
  height: 500,
  frozenRows: 0,
  frozenColumns: 0,
};
test("a range has one outer outline with exact cell boundaries", () => {
  expect(
    spreadsheetSelectionRects({
      ...base,
      range: { start: { row: 5, column: 5 }, end: { row: 14, column: 9 } },
    }),
  ).toEqual([
    {
      left: 292,
      top: 108,
      width: 300,
      height: 200,
      topEdge: true,
      bottomEdge: true,
      leftEdge: true,
      rightEdge: true,
    },
  ]);
});
test("offscreen ranges clip without false edges or oversized layout", () => {
  const [rect] = spreadsheetSelectionRects({
    ...base,
    range: {
      start: { row: 1, column: 1 },
      end: { row: 1048576, column: 16384 },
    },
    scrollTop: 10000,
    scrollLeft: 10000,
  });
  expect(rect).toEqual({
    left: 52,
    top: 28,
    width: 748,
    height: 472,
    topEdge: false,
    bottomEdge: false,
    leftEdge: false,
    rightEdge: false,
  });
});
test("frozen panes split the outline without borders at the internal seams", () => {
  const rects = spreadsheetSelectionRects({
    ...base,
    frozenRows: 1,
    frozenColumns: 1,
    range: { start: { row: 1, column: 1 }, end: { row: 3, column: 3 } },
  });
  expect(rects).toHaveLength(4);
  expect(rects[0]).toMatchObject({
    topEdge: true,
    leftEdge: true,
    rightEdge: false,
    bottomEdge: false,
  });
  expect(rects[3]).toMatchObject({
    topEdge: false,
    leftEdge: false,
    rightEdge: true,
    bottomEdge: true,
  });
});

test("sorted rows outline the rendered cells, including disjoint selections", async () => {
  const { spreadsheetSelectionRanges } =
    await import("../src/spreadsheet-selection.ts");
  const projection = new Map([
    [2, 3],
    [3, 5],
    [4, 2],
    [5, 4],
  ]);
  expect(
    spreadsheetSelectionRanges(
      { start: { row: 5, column: 1 }, end: { row: 5, column: 2 } },
      projection,
    ),
  ).toEqual([{ start: { row: 3, column: 1 }, end: { row: 3, column: 2 } }]);
  expect(
    spreadsheetSelectionRanges(
      { start: { row: 2, column: 1 }, end: { row: 3, column: 2 } },
      projection,
    ),
  ).toEqual([
    { start: { row: 2, column: 1 }, end: { row: 2, column: 2 } },
    { start: { row: 4, column: 1 }, end: { row: 4, column: 2 } },
  ]);
});
