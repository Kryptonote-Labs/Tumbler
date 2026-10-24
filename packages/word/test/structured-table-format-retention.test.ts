import { expect, test } from "bun:test";
import * as Y from "yjs";
import type { WordTableFormatPatch } from "../src/collaboration/table-format.ts";
import type { CellAddress } from "../src/collaboration/structured/schema.ts";
import { activeAxes } from "../src/collaboration/structured/state.ts";
import { structuredGrid, validateWordSharedDocument } from "../src/collaboration/structured/index.ts";
import { apply, cell, clone, fixture, sync } from "./structured-table-fixtures.ts";

type Format = "cell" | "row" | "width";
function format(doc: Y.Doc, target: CellAddress, kind: Format) {
  const patch: WordTableFormatPatch = kind === "cell"
    ? { scope: "cell", cell: { shading: "#ff0000" } }
    : kind === "row"
      ? { scope: "row", row: { heightTwips: 600, heightRule: "exact" } }
      : { scope: "table", columnWidths: activeAxes(doc, target, "column").map(() => 120) };
  apply(doc, { kind: "table-format", cell: target, patch });
}

for (const kind of ["cell", "row", "width"] as const) {
  test(`undo cannot orphan another peer's ${kind} formatting on an inserted axis`, () => {
    const seed = fixture([[cell("A"), cell("B")], [cell("C"), cell("D")]]);
    const history = seed.session.history();
    let remote: Y.Doc | undefined;
    try {
      const dimension = kind === "row" ? "row" : "column";
      seed.session.commit(seed.session.prepare([{ kind: "insert-axis", table: seed.table, dimension, at: 1 }]), history.origin);
      const target = structuredGrid(seed.doc, seed.table)[dimension === "row" ? 1 : 0]!.cells[dimension === "column" ? 1 : 0]!.address;
      remote = clone(seed.doc);
      format(remote, target, kind);
      sync(seed.doc, remote);
      const before = Y.encodeStateAsUpdate(seed.doc);
      expect(() => history.undo()).toThrow();
      expect(Y.encodeStateAsUpdate(seed.doc)).toEqual(before);
      expect(() => validateWordSharedDocument(seed.doc)).not.toThrow();
    } finally { history.destroy(); remote?.destroy(); seed.session.destroy(); }
  });

  test(`axis deletion conflicts with unseen ${kind} formatting but accepts observed formatting`, () => {
    const seed = fixture([[cell("A"), cell("B")], [cell("C"), cell("D")]]);
    const remote = clone(seed.doc);
    try {
      const target = structuredGrid(seed.doc, seed.table)[0]!.cells[0]!.address;
      const dimension = kind === "row" ? "row" : "column";
      const deletion = { kind: "delete-axis", table: seed.table, dimension, id: target[dimension] } as const;
      apply(seed.doc, deletion);
      format(remote, target, kind);
      // A peer that observes the formatting can deliberately delete that axis.
      const observed = clone(remote);
      try {
        apply(observed, deletion);
        expect(() => validateWordSharedDocument(observed)).not.toThrow();
      } finally { observed.destroy(); }
      sync(seed.doc, remote);
      expect(() => validateWordSharedDocument(seed.doc)).toThrow("Deleted axis contains edits not observed");
    } finally { remote.destroy(); seed.session.destroy(); }
  });
}

test("a spanning source cell cannot hide an unseen width edit on its deleted column", () => {
  const seed = fixture([[{ ...cell("Merged"), gridSpan: 2 }, cell("Other")]], 3);
  const remote = clone(seed.doc);
  try {
    const target = structuredGrid(seed.doc, seed.table)[0]!.cells[0]!.address;
    apply(seed.doc, { kind: "delete-axis", table: seed.table, dimension: "column", id: target.column });
    format(remote, target, "width");
    sync(seed.doc, remote);
    expect(() => validateWordSharedDocument(seed.doc)).toThrow();
  } finally { remote.destroy(); seed.session.destroy(); }
});

for (const kind of ["row", "width"] as const) {
  test(`whole-table deletion retains unseen ${kind} formatting on a concurrent new axis`, () => {
    const seed = fixture([[cell("A"), cell("B")]]), remote = clone(seed.doc);
    try {
      apply(seed.doc, { kind: "delete-table", table: seed.table });
      const dimension = kind === "row" ? "row" : "column";
      apply(remote, { kind: "insert-axis", table: seed.table, dimension, at: 1 });
      const target = structuredGrid(remote, seed.table)[dimension === "row" ? 1 : 0]!.cells[dimension === "column" ? 1 : 0]!.address;
      if (kind === "row") format(remote, target, kind);
      else apply(remote, { kind: "table-format", cell: target, patch: { scope: "table", columnWidths: [80, 120, 80] } });
      sync(seed.doc, remote);
      expect(() => validateWordSharedDocument(seed.doc)).toThrow();
      apply(seed.doc, { kind: "restore-table", table: seed.table });
      expect(() => validateWordSharedDocument(seed.doc)).not.toThrow();
    } finally { remote.destroy(); seed.session.destroy(); }
  });
}

test("writing the existing column widths does not create a false deletion conflict", () => {
  const seed = fixture([[cell("A"), cell("B")]]), remote = clone(seed.doc);
  try {
    const target = structuredGrid(seed.doc, seed.table)[0]!.cells[0]!.address;
    apply(seed.doc, { kind: "delete-axis", table: seed.table, dimension: "column", id: target.column });
    apply(remote, { kind: "table-format", cell: target, patch: { scope: "table", columnWidths: [80, 80] } });
    sync(seed.doc, remote);
    expect(() => validateWordSharedDocument(seed.doc)).not.toThrow();
  } finally { remote.destroy(); seed.session.destroy(); }
});
