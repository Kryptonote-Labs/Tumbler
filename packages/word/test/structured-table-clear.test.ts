import { expect, test } from "bun:test";
import { WordSharedText, WordStructuredUndo, structuredGrid } from "../src/collaboration/structured/index.ts";
import { tableParagraphs } from "../src/collaboration/tables.ts";
import { createWordArtifact } from "../src/index.ts";
import { openWordOperationDocument } from "../src/operations/document.ts";
import { tableAddresses } from "../src/collaboration/structured/state.ts";
import { apply, clone, sync, cell, paragraph, derived, exported, texts } from "./structured-table-fixtures.ts";

function importedParent() {
  const session = openWordOperationDocument(createWordArtifact({ blocks: [
    { kind: "table", rows: [[{ blocks: [{ kind: "table", rows: [[cell("Child A"), cell("Child B")]] }, paragraph("Parent")] }, cell("Other")]] },
  ] }));
  const table = { story: "body", table: tableParagraphs(session.text).find(p => p.table && !p.table.parents)!.table!.id };
  session.commit(session.prepare([{ kind: "migrate", table }]));
  return { session, table, doc: session.text.doc! };
}

test("clearing a parent reports unseen nested edits and preserves them for recovery", () => {
  const seed = importedParent(), view = new WordSharedText(seed.doc, "body");
  view.commit(view.prepareMigration());
  const child = tableAddresses(seed.doc).find(table => table.table !== seed.table.table)!;
  const remote = clone(seed.doc);
  try {
    const target = structuredGrid(seed.doc, seed.table)[0]!.cells[0]!.address;
    const childCell = structuredGrid(remote, child)[0]!.cells[0]!.address;
    apply(remote, { kind: "replace", selection: { cell: childCell, range: { start: 0, end: 0 } }, value: "Remote " });
    const p = tableParagraphs(view.text).find(p => p.table?.id === target.table && !p.table.parents)!;
    view.commit(seed.session.prepareOperation({ cell: target, range: { start: 0, end: 0 } }, {
      name: "edit-table", input: { action: "clear-cell", cellId: p.table!.cell },
    }));
    sync(seed.doc, remote);
    expect(() => seed.session.artifact()).toThrow("Deleted axis contains edits not observed");
    apply(seed.doc, { kind: "restore-table", table: child });
    expect(texts(exported(seed.session).rows[0]![0]!.blocks)).toContain("Remote Child A");
  } finally { remote.destroy(); view.destroy(); seed.session.destroy(); }
});

for (const source of [true, false]) {
  for (const route of ["scoped", "linear"] as const) {
    test(`${route} clear of a ${source ? "source" : "inserted"} parent retains nested content for undo`, () => {
      const seed = source ? importedParent() : derived();
      const target = source ? structuredGrid(seed.doc, seed.table)[0]!.cells[0]!.address : structuredGrid(seed.doc, seed.table)[0]!.cells[1]!.address;
      if (!source) seed.session.commit(seed.session.prepareOperation(
        { cell: target, range: { start: 0, end: 0 } },
        { name: "insert-table", input: { rows: [["Child A", "Child B"]] } },
      ));
      const view = new WordSharedText(seed.doc, "body");
      const undo = new WordStructuredUndo(seed.doc);
      try {
        const before = texts(exported(seed.session).rows[0]![source ? 0 : 1]!.blocks);
        const parent = tableParagraphs(view.text).find(p => p.table?.id === target.table && p.table.column === (source ? 0 : 1))!;
        const operation = { name: "edit-table", input: { action: "clear-cell", cellId: parent.table!.cell } } as const;
        const prepared = route === "scoped"
          ? seed.session.prepareOperation({ cell: target, range: { start: 0, end: 0 } }, operation)
          : view.prepareOperation({ start: parent.start, end: parent.start }, operation);
        const selection = view.commit(prepared, undo.origin)!;
        const cleared = exported(seed.session).rows[0]![source ? 0 : 1]!.blocks;
        expect(cleared.some(block => block.kind === "table")).toBe(false);
        expect(texts(cleared)).toEqual([""]);
        expect(texts(exported(seed.session).rows[0]![source ? 1 : 2]!.blocks)).toEqual([source ? "Other" : "B"]);
        const range = view.range(selection);
        expect(range.start).toBe(range.end);
        expect(undo.undo()).toBe(true);
        expect(texts(exported(seed.session).rows[0]![source ? 0 : 1]!.blocks)).toEqual(before);
        expect(undo.redo()).toBe(true);
        view.commit(view.prepareOperation(view.range(selection), { name: "replace", input: { value: "Again" } }));
        expect(texts(exported(seed.session).rows[0]![source ? 0 : 1]!.blocks)).toEqual(["Again"]);
      } finally { undo.destroy(); view.destroy(); seed.session.destroy(); }
    });
  }
}
