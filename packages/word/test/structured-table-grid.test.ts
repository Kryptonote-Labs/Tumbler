import { expect, test } from "bun:test";
import * as Y from "yjs";

import {
  structuredGrid,
  validateWordSharedDocument,
} from "../src/collaboration/structured/index.ts";

import {
  cell,
  vertical,
  fixture,
  apply,
  clone,
  sync,
  exported,
  texts,
} from "./structured-table-fixtures.ts";
test("review 1: deleting the endpoint of an inserted vertical continuation advances the grid", () => {
  const { session, table, doc } = vertical();
  try {
    apply(doc, { kind: "insert-axis", table, dimension: "row", at: 1 });
    apply(doc, {
      kind: "delete-axis",
      table,
      dimension: "column",
      id: "base-1",
    });
    expect(
      session.grid(table.table).map((r) => r.cells.map((c) => c.columns)),
    ).toEqual([[["base-0"]], [["base-0"]], [["base-0"]]]);
    expect(exported(session).rows).toHaveLength(3);
  } finally {
    session.destroy();
  }
});
test("review 2: concurrent restart deletion does not change an inserted row's coverage", () => {
  const { session, table, doc } = fixture([
    [cell("A"), cell("B")],
    [{ ...cell("Merged"), gridSpan: 2, verticalMerge: "restart" }],
    [{ ...cell(""), gridSpan: 2, verticalMerge: "continue" }],
  ]);
  const remote = clone(doc);
  try {
    const restart = structuredGrid(doc, table)[1]!.id;
    apply(doc, { kind: "insert-axis", table, dimension: "row", at: 1 });
    const target = structuredGrid(doc, table)[1]!.cells[1]!.address;
    apply(doc, {
      kind: "replace",
      selection: { cell: target, range: { start: 0, end: 0 } },
      value: "Retained",
    });
    apply(remote, {
      kind: "delete-axis",
      table,
      dimension: "row",
      id: restart,
    });
    sync(doc, remote);
    validateWordSharedDocument(doc);
    expect(session.grid(table.table)[1]!.cells).toHaveLength(2);
    expect(
      texts(exported(session).rows[1]!.flatMap((c) => c.blocks)),
    ).toContain("Retained");
  } finally {
    session.destroy();
    remote.destroy();
  }
});
test("review 4: merging an imported span projects each source payload once", () => {
  const { session, table, doc } = fixture(
    [[{ ...cell("A"), gridSpan: 2 }, cell("B")]],
    3,
  );
  try {
    apply(doc, {
      kind: "merge-right",
      cell: structuredGrid(doc, table)[0]!.cells[0]!.address,
    });
    expect(texts(exported(session).rows[0]![0]!.blocks)).toEqual(["A", "B"]);
  } finally {
    session.destroy();
  }
});
for (const dimension of ["row", "column"] as const)
  test(`review 7: ordinary ${dimension} deletion after explicit merge`, () => {
    const { session, table, doc } = fixture([
      [cell("A"), cell("B")],
      [cell("C"), cell("D")],
    ]);
    try {
      const target = structuredGrid(doc, table)[0]!.cells[0]!.address;
      apply(doc, { kind: "merge-right", cell: target });
      apply(doc, {
        kind: "delete-axis",
        table,
        dimension,
        id: dimension === "row" ? target.row : target.column,
      });
      validateWordSharedDocument(doc);
      expect(exported(session).rows).toHaveLength(dimension === "row" ? 1 : 2);
    } finally {
      session.destroy();
    }
  });
test("covered coordinates cannot create an invisible continuation payload", () => {
  const { session, table, doc } = vertical();
  try {
    apply(doc, { kind: "insert-axis", table, dimension: "row", at: 1 });
    const target = {
      ...structuredGrid(doc, table)[1]!.cells[0]!.address,
      column: "base-1",
    };
    const before = Y.encodeStateAsUpdate(doc);
    expect(() =>
      apply(doc, {
        kind: "replace",
        selection: { cell: target, range: { start: 0, end: 0 } },
        value: "Hidden",
      }),
    ).toThrow("visible merged-cell payload");
    expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
  } finally {
    session.destroy();
  }
});
