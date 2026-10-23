import { expect, test } from "bun:test";
import { apply, cell, fixture } from "./structured-table-fixtures.ts";
import { structuredGrid } from "../src/collaboration/structured/grid.ts";
import { tableName } from "../src/collaboration/structured/state.ts";
import { validateWordSharedDocument } from "../src/collaboration/structured/transactions.ts";

test("table reads see each structural write inside one outer transaction", () => {
  const seed = fixture([[cell("Original")]], 1);
  expect(structuredGrid(seed.doc, seed.table)[0]!.cells).toHaveLength(1);
  seed.doc.transact(() => {
    apply(seed.doc, { kind: "insert-axis", table: seed.table, dimension: "column", at: 1 });
    expect(structuredGrid(seed.doc, seed.table)[0]!.cells).toHaveLength(2);
    apply(seed.doc, { kind: "insert-axis", table: seed.table, dimension: "column", at: 2 });
    expect(structuredGrid(seed.doc, seed.table)[0]!.cells).toHaveLength(3);
  });
  expect(structuredGrid(seed.doc, seed.table)[0]!.cells).toHaveLength(3);
  seed.session.destroy();
});

test("validation checks a changed table after a successful prior read", () => {
  const seed = fixture([[cell("Original")]], 1);
  validateWordSharedDocument(seed.doc);
  seed.doc.getMap(tableName(seed.table)).set("malformed", { kind: "axis", dimension: "column" });
  expect(() => validateWordSharedDocument(seed.doc)).toThrow();
  seed.doc.getMap(tableName(seed.table)).delete("malformed");
  expect(() => validateWordSharedDocument(seed.doc)).not.toThrow();
  seed.session.destroy();
});
