import { expect, test } from "bun:test";
import { prepareWordUpdate, commitWordUpdate, structuredGrid, validateWordSharedDocument } from "../src/collaboration/structured/index.ts";
import { fixture, cell } from "./structured-table-fixtures.ts";

for (const kind of ["delete-axis", "delete-table"] as const) {
  test(`a batch ending in ${kind} clears the earlier selection`, () => {
    const seed = fixture([[cell("A"), cell("B")]]);
    try {
      const target = structuredGrid(seed.doc, seed.table)[0]!.cells[0]!.address;
      const prepared = prepareWordUpdate(seed.doc, [
        { kind: "replace", selection: { cell: target, range: { start: 0, end: 1 } }, value: "Changed" },
        kind === "delete-axis"
          ? { kind, table: seed.table, dimension: "column", id: target.column }
          : { kind, table: seed.table },
      ]);
      expect(commitWordUpdate(seed.doc, prepared)).toBeUndefined();
      expect(() => validateWordSharedDocument(seed.doc)).not.toThrow();
    } finally { seed.session.destroy(); }
  });
}
