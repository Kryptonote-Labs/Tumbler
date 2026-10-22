import { expect, test } from "bun:test";
import * as Y from "yjs";
import { createWordArtifact, importWordContent } from "../src/index.ts";
import { openWordOperationDocument } from "../src/operations/index.ts";

import { structuredGrid } from "../src/collaboration/structured/index.ts";
import { tableAddresses } from "../src/collaboration/structured/state.ts";
import {
  cell,
  apply,
  clone,
  sync,
  exported,
  texts,
  derived,
} from "./structured-table-fixtures.ts";
test("review 5: newly inserted tables undo and redo", () => {
  const session = openWordOperationDocument(createWordArtifact());
  const history = session.history();
  try {
    session.commit(
      session.prepareOperation(
        { story: "body", range: { start: 0, end: 0 } },
        { name: "insert-table", input: { rows: [["A", "B"]] } },
      ),
      history.origin,
    );
    expect(
      importWordContent(session.artifact()).some((b) => b.kind === "table"),
    ).toBe(true);
    history.undo();
    expect(
      importWordContent(session.artifact()).some((b) => b.kind === "table"),
    ).toBe(false);
    history.redo();
    expect(texts(exported(session).rows[0]!.flatMap((c) => c.blocks))).toEqual([
      "A",
      "B",
    ]);
  } finally {
    history.destroy();
    session.destroy();
  }
});
test("undo newly inserted table refuses to detach remote derived payload", () => {
  const session = openWordOperationDocument(createWordArtifact());
  const history = session.history();
  let remote: Y.Doc | undefined;
  try {
    session.commit(
      session.prepareOperation(
        { story: "body", range: { start: 0, end: 0 } },
        { name: "insert-table", input: { rows: [["A", "B"]] } },
      ),
      history.origin,
    );
    const doc = session.text.doc!,
      table = tableAddresses(doc)[0]!;
    remote = clone(doc);
    apply(remote, { kind: "insert-axis", table, dimension: "column", at: 1 });
    const target = structuredGrid(remote, table)[0]!.cells[1]!.address;
    apply(remote, {
      kind: "replace",
      selection: { cell: target, range: { start: 0, end: 0 } },
      value: "Keep remote",
    });
    sync(doc, remote);
    const before = Y.encodeStateAsUpdate(doc);
    expect(() => history.undo()).toThrow();
    expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
    expect(texts(exported(session).rows[0]![1]!.blocks)).toEqual([
      "Keep remote",
    ]);
  } finally {
    history.destroy();
    session.destroy();
    remote?.destroy();
  }
});
