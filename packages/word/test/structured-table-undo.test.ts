import { expect, test } from "bun:test";
import * as Y from "yjs";
import { createWordArtifact, importWordContent } from "../src/index.ts";
import { openWordOperationDocument } from "../src/operations/index.ts";

import { structuredGrid, validateWordSharedDocument } from "../src/collaboration/structured/index.ts";
import { tableAddresses } from "../src/collaboration/structured/state.ts";
import {
  cell,
  apply,
  clone,
  sync,
  exported,
  texts,
  derived,
  fixture,
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

for (const kind of ["source", "derived"] as const) {
  test(`guarded undo follows restored ${kind} characters after remote axis deletion`, () => {
    const seed = kind === "source" ? fixture([[cell("A"), cell("B")]]) : derived();
    const history = seed.session.history();
    let remote: Y.Doc | undefined;
    try {
      const target = seed.session.grid(seed.table.table)[0]!.cells[kind === "source" ? 0 : 1]!.address;
      const replace = (start: number, end: number, value: string) => seed.session.commit(seed.session.prepare([
        { kind: "replace", selection: { cell: target, range: { start, end } }, value },
      ]), history.origin);
      replace(0, 0, "XYZ");
      replace(0, 2, "");
      history.undo();
      history.redo();
      history.undo();
      remote = clone(seed.doc);
      apply(remote, { kind: "delete-axis", table: seed.table, dimension: "column", id: target.column });
      sync(seed.doc, remote);
      validateWordSharedDocument(seed.doc);
      const before = Y.encodeStateAsUpdate(seed.doc);
      expect(() => history.undo()).toThrow("Deleted axis contains edits not observed");
      expect(() => validateWordSharedDocument(seed.doc)).not.toThrow();
      expect(Y.encodeStateAsUpdate(seed.doc)).toEqual(before);
      apply(seed.doc, { kind: "restore-axis", table: seed.table, dimension: "column", id: target.column });
      expect(history.undo()).toBe(true);
      expect(() => validateWordSharedDocument(seed.doc)).not.toThrow();
      expect(JSON.stringify(exported(seed.session))).not.toContain("XYZ");
    } finally { history.destroy(); remote?.destroy(); seed.session.destroy(); }
  });
}
