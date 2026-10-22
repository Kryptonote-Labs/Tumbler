import * as Y from "yjs";
import { expect, test } from "bun:test";
import {
  fixture,
  cell,
  apply,
  exported,
  texts,
} from "./structured-table-fixtures.ts";
import { structuredGrid } from "../src/collaboration/structured/index.ts";

test("fit-table preserves existing column proportions when weights are absent", () => {
  const { session, table, doc } = fixture([[cell("A"), cell("B")]]);
  try {
    const target = structuredGrid(doc, table)[0]!.cells[0]!.address;
    apply(doc, {
      kind: "table-format",
      cell: target,
      patch: { scope: "table", columnWidths: [80, 240] },
    });
    session.commit(
      session.prepareOperation(
        { cell: target, range: { start: 0, end: 0 } },
        { name: "fit-table", input: { cellId: "source-21", fraction: 1 } },
        { availableWidthPoints: 400 },
      ),
    );
    expect(exported(session).columnWidths).toEqual([100, 300]);
  } finally {
    session.destroy();
  }
});
test("move-object destinations stay local to source cells", () => {
  const { session, table, doc } = fixture([[cell("A"), cell("B")]]);
  try {
    const target = structuredGrid(doc, table)[0]!.cells[1]!.address;
    session.commit(
      session.prepareOperation(
        { cell: target, range: { start: 1, end: 1 } },
        {
          name: "insert-shape",
          input: {
            shape: {
              preset: "rect",
              width: 20,
              height: 10,
              fill: "#ffffff",
              outline: "#000000",
              outlineWidth: 1,
            },
          },
        },
      ),
    );
    const selected = session.commit(
      session.prepareOperation(
        { cell: target, range: { start: 1, end: 2 } },
        { name: "move-object", input: { destination: 0 } },
      ),
    );
    expect(exported(session).rows[0]!.map((c) => texts(c.blocks))).toEqual([
      ["A"],
      ["\uFFFCB"],
    ]);
    expect(selected?.range).toEqual({ start: 0, end: 1 });
  } finally {
    session.destroy();
  }
});
test("out-of-cell move destinations reject without touching another cell", () => {
  const { session, table, doc } = fixture([[cell("A"), cell("B")]]);
  try {
    const target = structuredGrid(doc, table)[0]!.cells[1]!.address;
    session.commit(
      session.prepareOperation(
        { cell: target, range: { start: 1, end: 1 } },
        {
          name: "insert-shape",
          input: {
            shape: {
              preset: "rect",
              width: 20,
              height: 10,
              fill: "#ffffff",
              outline: "#000000",
              outlineWidth: 1,
            },
          },
        },
      ),
    );
    const before = Y.encodeStateAsUpdate(doc);
    expect(() =>
      session.prepareOperation(
        { cell: target, range: { start: 1, end: 2 } },
        { name: "move-object", input: { destination: 3 } },
      ),
    ).toThrow("outside the cell");
    expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
  } finally {
    session.destroy();
  }
});
