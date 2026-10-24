import { test, expect } from "bun:test";
import { fixture, cell, apply, exported } from "./structured-table-fixtures.ts";
import { structuredGrid } from "../src/collaboration/structured/index.ts";

test("undo inserting a column must retain remote empty-cell paragraph formatting", async () => {
  const { clone, sync } = await import("./structured-table-fixtures.ts");
  const { prepareWordScopedOperation } =
    await import("../src/operations/index.ts");
  const { commitWordUpdate } =
    await import("../src/collaboration/structured/index.ts");
  const { session, doc, table } = fixture([[cell("A"), cell("B")]]);
  const history = session.history();
  let remote;
  try {
    session.commit(
      session.prepare([
        { kind: "insert-axis", table, dimension: "column", at: 1 },
      ]),
      history.origin,
    );
    const target = structuredGrid(doc, table)[0]!.cells[1]!.address;
    remote = clone(doc);
    apply(remote, {
      kind: "replace",
      selection: { cell: target, range: { start: 0, end: 0 } },
      value: "X",
    });
    apply(remote, {
      kind: "replace",
      selection: { cell: target, range: { start: 0, end: 1 } },
      value: "",
    });
    commitWordUpdate(
      remote,
      prepareWordScopedOperation(
        remote,
        { cell: target, range: { start: 0, end: 0 } },
        { name: "paragraph", input: { paragraph: { keepNext: true } } },
      ),
    );
    sync(doc, remote);
    const paragraph = exported(session).rows[0]![1]!.blocks[0]!;
    expect(
      paragraph.kind === "paragraph" && paragraph.paragraph?.keepNext,
    ).toBe(true);
    let rejected = false;
    try {
      history.undo();
    } catch {
      rejected = true;
    }
    if (!rejected)
      expect(
        structuredGrid(doc, table)[0]!.cells.some(
          (c) => c.address.column === target.column,
        ),
      ).toBe(true);
  } finally {
    history.destroy();
    session.destroy();
    remote?.destroy();
  }
});

test("formatting an untouched implicit empty cell projects its paragraph properties", () => {
  const { session, doc, table } = fixture([[cell("A"), cell("B")]]);
  try {
    apply(doc, { kind: "insert-axis", table, dimension: "column", at: 1 });
    const target = structuredGrid(doc, table)[0]!.cells[1]!.address;
    session.commit(
      session.prepareOperation(
        { cell: target, range: { start: 0, end: 0 } },
        { name: "paragraph", input: { paragraph: { keepNext: true } } },
      ),
    );
    const paragraph = exported(session).rows[0]![1]!.blocks[0]!;
    expect(
      paragraph.kind === "paragraph" && paragraph.paragraph?.keepNext,
    ).toBe(true);
  } finally {
    session.destroy();
  }
});
test("format-only roots survive synchronization and block structural undo without prior typing", async () => {
  const { clone, sync } = await import("./structured-table-fixtures.ts");
  const { cellName } = await import("../src/collaboration/structured/state.ts");
  const { prepareWordScopedOperation } =
    await import("../src/operations/index.ts");
  const { commitWordUpdate } =
    await import("../src/collaboration/structured/index.ts");
  const { session, doc, table } = fixture([[cell("A"), cell("B")]]),
    history = session.history();
  let remote;
  try {
    session.commit(
      session.prepare([
        { kind: "insert-axis", table, dimension: "column", at: 1 },
      ]),
      history.origin,
    );
    const target = structuredGrid(doc, table)[0]!.cells[1]!.address;
    remote = clone(doc);
    commitWordUpdate(
      remote,
      prepareWordScopedOperation(
        remote,
        { cell: target, range: { start: 0, end: 0 } },
        { name: "paragraph", input: { paragraph: { keepNext: true } } },
      ),
    );
    sync(doc, remote);
    expect(doc.share.has(cellName(target))).toBe(false);
    const paragraph = exported(session).rows[0]![1]!.blocks[0]!;
    expect(
      paragraph.kind === "paragraph" && paragraph.paragraph?.keepNext,
    ).toBe(true);
    expect(doc.share.has(cellName(target))).toBe(false);
    expect(() => history.undo()).toThrow("detach retained");
  } finally {
    history.destroy();
    session.destroy();
    remote?.destroy();
  }
});
