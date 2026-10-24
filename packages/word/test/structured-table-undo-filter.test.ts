import { expect, test } from "bun:test";
import * as Y from "yjs";
import { createWordUndoManager, preflightWordUndo, structuredGrid, validateWordSharedDocument } from "../src/collaboration/structured/index.ts";
import { apply, cell, clone, fixture, sync } from "./structured-table-fixtures.ts";

for (const kind of ["foreign", "modified"] as const) {
  test(`guarded undo rejects a ${kind} item filter before changing state or history`, () => {
    const seed = fixture([[cell("A"), cell("B")]]);
    const body = seed.doc.getText("body"), origin = {};
    const manager = kind === "foreign"
      ? new Y.UndoManager(seed.doc, { trackedOrigins: new Set([origin]), deleteFilter: item => item.parent === body })
      : createWordUndoManager(seed.doc, { trackedOrigins: new Set([origin]) });
    if (kind === "modified") manager.deleteFilter = item => item.parent === body;
    let remote: Y.Doc | undefined;
    try {
      const target = structuredGrid(seed.doc, seed.table)[0]!.cells[0]!.address;
      seed.session.commit(seed.session.prepare([{ kind: "replace", selection: { cell: target, range: { start: 0, end: 0 } }, value: "X" }]), origin);
      remote = clone(seed.doc);
      apply(remote, { kind: "delete-axis", table: seed.table, dimension: "column", id: target.column });
      sync(seed.doc, remote);
      const before = Y.encodeStateAsUpdate(seed.doc), count = manager.undoStack.length;
      expect(() => preflightWordUndo(seed.doc, manager)).toThrow("custom item filters are unsupported");
      expect(manager.undoStack).toHaveLength(count);
      expect(Y.encodeStateAsUpdate(seed.doc)).toEqual(before);
      expect(() => validateWordSharedDocument(seed.doc)).not.toThrow();
    } finally { manager.destroy(); remote?.destroy(); seed.session.destroy(); }
  });
}
