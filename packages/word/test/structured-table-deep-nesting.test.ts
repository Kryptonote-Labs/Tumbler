import { expect, test } from "bun:test";
import { WordSharedText, anchorScopedSelection, resolveScopedAnchor, structuredGrid } from "../src/collaboration/structured/index.ts";
import { cellAddressFromName, cellFormatName, cellName, tableAddresses } from "../src/collaboration/structured/state.ts";
import { derived, apply, clone, sync, exported, texts } from "./structured-table-fixtures.ts";

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

test("deep canonical nesting preserves formatting, anchors, undo, synchronization and deletion recovery", () => {
  const seed = derived();
  let target = seed.target;
  try {
    for (let depth = 0; depth < 14; depth++) {
      seed.session.commit(seed.session.prepareOperation(
        { cell: target, range: { start: 0, end: 0 } },
        { name: "insert-table", input: { rows: [["Nested"]] } },
      ));
      const child = tableAddresses(seed.doc).find(table => table.story === cellName(target))!;
      apply(seed.doc, { kind: "insert-axis", table: child, dimension: "column", at: 1 });
      target = structuredGrid(seed.doc, child)[0]!.cells[1]!.address;
    }
    apply(seed.doc, { kind: "format", selection: { cell: target, range: { start: 0, end: 0 } }, patch: { align: "center" } });
    expect(seed.doc.getMap(cellFormatName(target)).get("align")).toBe("center");
    const history = seed.session.history();
    try {
      seed.session.commit(seed.session.prepareOperation(
        { cell: target, range: { start: 0, end: 0 } },
        { name: "replace", input: { value: "Deep text" } },
      ), history.origin);
      const selection = { cell: target, range: { start: 0, end: 4 } };
      const anchor = anchorScopedSelection(seed.doc, selection);
      expect(resolveScopedAnchor(seed.doc, anchor)).toEqual(selection);
      expect(() => seed.session.prepareOperation(
        { story: cellName(target), range: { start: 0, end: 0 } },
        { name: "replace", input: { value: "Invalid unscoped edit" } },
      )).toThrow("Use a scoped cell selection");
      const view = new WordSharedText(seed.doc, "body");
      try {
        const range = view.range(selection);
        expect(view.text.toString().slice(range.start, range.end)).toBe("Deep");
      } finally { view.destroy(); }
      expect(history.undo()).toBe(true);
      expect(texts(exported(seed.session).rows[0]![1]!.blocks)).not.toContain("Deep text");
      expect(history.redo()).toBe(true);
      expect(texts(exported(seed.session).rows[0]![1]!.blocks)).toContain("Deep text");
    } finally { history.destroy(); }
    const remote = clone(seed.doc);
    try {
      expect(remote.getMap(cellFormatName(target)).get("align")).toBe("center");
      apply(remote, { kind: "replace", selection: { cell: target, range: { start: 0, end: 0 } }, value: "Remote " });
      apply(seed.doc, { kind: "delete-axis", table: seed.table, dimension: "column", id: seed.target.column });
      sync(seed.doc, remote);
      expect(() => seed.session.artifact()).toThrow("Deleted axis contains edits not observed");
      apply(seed.doc, { kind: "restore-axis", table: seed.table, dimension: "column", id: seed.target.column });
      expect(texts(exported(seed.session).rows[0]![1]!.blocks)).toContain("Remote Deep text");
    } finally { remote.destroy(); }
  } finally { seed.session.destroy(); }
});
