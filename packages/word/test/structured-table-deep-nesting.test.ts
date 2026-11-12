import { expect, test } from "bun:test";
import { cellAddressFromName, cellFormatName, cellName } from "../src/collaboration/structured/state.ts";

test("cell names retain existing identities and grow linearly beyond the former story cap", () => {
  let cell = { story: "body", table: "table", row: "row", column: "column" };
  let previousLength = 0;
  for (let depth = 0; depth < 100; depth++) {
    const name = cellName(cell);
    expect(cellAddressFromName(name)).toEqual(cell);
    expect(cellAddressFromName(cellFormatName(cell))).toEqual(cell);
    if (cell.story.length <= 8192)
      expect(name).toBe("word-cell-v2:" + JSON.stringify([cell.story, cell.table, cell.row, cell.column]));
    if (depth > 30) expect(name.length - previousLength).toBeLessThan(100);
    previousLength = name.length;
    cell = { ...cell, story: name, table: `nested-${depth}-"\\λ` };
  }
});
