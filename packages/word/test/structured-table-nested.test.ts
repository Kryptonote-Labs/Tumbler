import { expect, test } from "bun:test";
import * as Y from "yjs";

import { prepareWordScopedOperation } from "../src/operations/index.ts";

import {
  commitWordUpdate,
  structuredGrid,
} from "../src/collaboration/structured/index.ts";
import {
  cellName,
  tableAddresses,
} from "../src/collaboration/structured/state.ts";
import {
  cell,
  apply,
  clone,
  sync,
  exported,
  texts,
  derived,
} from "./structured-table-fixtures.ts";
test("review 6: nested insertion retains a separate parent paragraph", () => {
  const { session, doc, target } = derived();
  try {
    apply(doc, {
      kind: "replace",
      selection: { cell: target, range: { start: 0, end: 0 } },
      value: "Parent",
    });
    session.commit(
      session.prepareOperation(
        { cell: target, range: { start: 6, end: 6 } },
        { name: "insert-table", input: { rows: [["Child A", "Child B"]] } },
      ),
    );
    const blocks = exported(session).rows[0]![1]!.blocks;
    expect(blocks[0]?.kind).toBe("paragraph");
    expect(texts(blocks.slice(0, 1))).toEqual(["Parent"]);
    const nested = blocks.find((b) => b.kind === "table");
    expect(nested?.kind).toBe("table");
    if (nested?.kind === "table")
      expect(texts(nested.rows[0]![0]!.blocks)).toEqual(["Child A"]);
  } finally {
    session.destroy();
  }
});
test("review 3: deleting a parent detects concurrent nested derived-root edits", () => {
  const { session, doc, table, target } = derived();
  let remote: Y.Doc | undefined;
  try {
    session.commit(
      session.prepareOperation(
        { cell: target, range: { start: 0, end: 0 } },
        { name: "insert-table", input: { rows: [["Child A", "Child B"]] } },
      ),
    );
    const nested = tableAddresses(doc).find(
      (a) => a.story === cellName(target),
    )!;
    remote = clone(doc);
    apply(doc, {
      kind: "delete-axis",
      table,
      dimension: "column",
      id: target.column,
    });
    apply(remote, {
      kind: "insert-axis",
      table: nested,
      dimension: "column",
      at: 1,
    });
    const child = structuredGrid(remote, nested)[0]!.cells[1]!.address;
    commitWordUpdate(
      remote,
      prepareWordScopedOperation(
        remote,
        { cell: child, range: { start: 0, end: 0 } },
        { name: "replace", input: { value: "Remote child" } },
      ),
    );
    sync(doc, remote);
    expect(() => {
      session.artifact();
    }).toThrow("Deleted axis");
    expect(doc.getText(cellName(child)).toString()).toBe("Remote child");
  } finally {
    session.destroy();
    remote?.destroy();
  }
});
test("nested deletion witnesses recurse through derived grandchildren", () => {
  const { session, doc, table, target } = derived();
  let remote: Y.Doc | undefined;
  try {
    const insert = (target: Parameters<typeof cellName>[0]) => {
      session.commit(
        session.prepareOperation(
          { cell: target, range: { start: 0, end: 0 } },
          { name: "insert-table", input: { rows: [["Nested"]] } },
        ),
      );
      return tableAddresses(doc).find((a) => a.story === cellName(target))!;
    };
    const child = insert(target);
    apply(doc, {
      kind: "insert-axis",
      table: child,
      dimension: "column",
      at: 1,
    });
    const childCell = structuredGrid(doc, child)[0]!.cells[1]!.address;
    const grandchild = insert(childCell);
    apply(doc, {
      kind: "insert-axis",
      table: grandchild,
      dimension: "column",
      at: 1,
    });
    const grandchildCell = structuredGrid(doc, grandchild)[0]!.cells[1]!
      .address;
    remote = clone(doc);
    apply(doc, {
      kind: "delete-axis",
      table,
      dimension: "column",
      id: target.column,
    });
    apply(remote, {
      kind: "replace",
      selection: { cell: grandchildCell, range: { start: 0, end: 0 } },
      value: "Deep remote",
    });
    sync(doc, remote);
    expect(() => {
      session.artifact();
    }).toThrow("Deleted axis");
    apply(doc, {
      kind: "restore-axis",
      table,
      dimension: "column",
      id: target.column,
    });
    expect(texts(exported(session).rows[0]![1]!.blocks)).toContain(
      "Deep remote",
    );
  } finally {
    session.destroy();
    remote?.destroy();
  }
});
