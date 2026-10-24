import { test, expect } from "bun:test";
import {
  fixture,
  cell,
  apply,
  exported,
  texts,
} from "./structured-table-fixtures.ts";
import {
  structuredGrid,
  validateWordSharedDocument,
} from "../src/collaboration/structured/index.ts";

test("splitting a shrunk imported span preserves source content", () => {
  const { session, doc, table } = fixture(
    [[{ ...cell("Retain A"), gridSpan: 3 }, cell("B")]],
    4,
  );
  try {
    apply(doc, {
      kind: "delete-axis",
      table,
      dimension: "column",
      id: "base-0",
    });
    const target = structuredGrid(doc, table)[0]!.cells[0]!.address;
    expect(texts(exported(session).rows[0]![0]!.blocks)).toEqual(["Retain A"]);
    apply(doc, { kind: "split-cell", cell: target });
    validateWordSharedDocument(doc);
    expect(doc.getText("body").toString()).toContain("Retain A");
    expect(
      texts(exported(session).rows[0]!.flatMap((c) => c.blocks)),
    ).toContain("Retain A");
  } finally {
    session.destroy();
  }
});

test("restoring the original coordinate after a surviving split never duplicates content", () => {
  const { session, doc, table } = fixture(
    [[{ ...cell("Retain A"), gridSpan: 3 }, cell("B")]],
    4,
  );
  try {
    apply(doc, {
      kind: "delete-axis",
      table,
      dimension: "column",
      id: "base-0",
    });
    const target = structuredGrid(doc, table)[0]!.cells[0]!.address;
    apply(doc, { kind: "split-cell", cell: target });
    apply(doc, {
      kind: "restore-axis",
      table,
      dimension: "column",
      id: "base-0",
    });
    expect(texts(exported(session).rows[0]!.flatMap((c) => c.blocks))).toEqual([
      "",
      "Retain A",
      "",
      "B",
    ]);
    apply(doc, {
      kind: "delete-axis",
      table,
      dimension: "column",
      id: target.column,
    });
    expect(texts(exported(session).rows[0]!.flatMap((c) => c.blocks))).toEqual([
      "",
      "",
      "B",
    ]);
    apply(doc, {
      kind: "restore-axis",
      table,
      dimension: "column",
      id: target.column,
    });
    expect(texts(exported(session).rows[0]!.flatMap((c) => c.blocks))).toEqual([
      "",
      "Retain A",
      "",
      "B",
    ]);
  } finally {
    session.destroy();
  }
});
test("concurrent splits with different surviving owners retain conflicting evidence", async () => {
  const { clone, sync } = await import("./structured-table-fixtures.ts");
  const { session, doc, table } = fixture(
      [[{ ...cell("Retain A"), gridSpan: 3 }, cell("B")]],
      4,
    ),
    remote = clone(doc);
  try {
    apply(doc, {
      kind: "split-cell",
      cell: structuredGrid(doc, table)[0]!.cells[0]!.address,
    });
    apply(remote, {
      kind: "delete-axis",
      table,
      dimension: "column",
      id: "base-0",
    });
    const surviving = structuredGrid(remote, table)[0]!.cells[0]!.address;
    apply(remote, { kind: "split-cell", cell: surviving });
    sync(doc, remote);
    expect(() => validateWordSharedDocument(doc)).toThrow("split ownership");
    apply(doc, { kind: "split-cell", cell: surviving });
    validateWordSharedDocument(doc);
    expect(texts(exported(session).rows[0]!.flatMap((c) => c.blocks))).toEqual([
      "Retain A",
      "",
      "B",
    ]);
  } finally {
    session.destroy();
    remote.destroy();
  }
});
