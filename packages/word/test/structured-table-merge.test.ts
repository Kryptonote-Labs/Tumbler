import * as Y from "yjs";
import { expect, test } from "bun:test";
import {
  fixture,
  cell,
  apply,
  clone,
  sync,
  exported,
  texts,
  vertical,
} from "./structured-table-fixtures.ts";
import {
  structuredGrid,
  validateWordSharedDocument,
} from "../src/collaboration/structured/index.ts";

import { layoutWordDocument } from "../src/index.ts";
test("sequential merge consumes an observed merge on its right", () => {
  const { session, table, doc } = fixture(
    [[cell("A"), cell("B"), cell("C")]],
    3,
  );
  try {
    const [a, b] = structuredGrid(doc, table)[0]!.cells;
    apply(doc, { kind: "merge-right", cell: b!.address });
    apply(doc, { kind: "merge-right", cell: a!.address });
    expect(texts(exported(session).rows[0]![0]!.blocks)).toEqual([
      "A",
      "B",
      "C",
    ]);
  } finally {
    session.destroy();
  }
});
test("distinct concurrent merge coverage at the same anchor conflicts", () => {
  const { session, table, doc } = fixture(
      [[cell("A"), cell("B"), cell("C")]],
      3,
    ),
    remote = clone(doc);
  try {
    const target = structuredGrid(doc, table)[0]!.cells[0]!.address;
    apply(doc, { kind: "merge-right", cell: target });
    apply(remote, { kind: "merge-right", cell: target });
    apply(remote, { kind: "merge-right", cell: target });
    sync(doc, remote);
    expect(() => validateWordSharedDocument(doc)).toThrow();
  } finally {
    session.destroy();
    remote.destroy();
  }
});
test("vertical continuation typing is rejected atomically and restart typing is visible", () => {
  const { session, table, doc } = vertical();
  try {
    apply(doc, { kind: "insert-axis", table, dimension: "row", at: 1 });
    const target = structuredGrid(doc, table)[1]!.cells[0]!.address;
    const before = Y.encodeStateAsUpdate(doc);
    expect(() =>
      session.prepareOperation(
        { cell: target, range: { start: 0, end: 0 } },
        { name: "replace", input: { value: "Hidden typed text" } },
      ),
    ).toThrow("restart cell");
    expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
    const owner = structuredGrid(doc, table)[0]!.cells[0]!.address;
    session.commit(
      session.prepareOperation(
        { cell: owner, range: { start: 0, end: 0 } },
        { name: "replace", input: { value: "Visible typed text" } },
      ),
    );
    const layout = layoutWordDocument(session.artifact().document, {
      measure: (text) => ({ width: text.length * 5, ascent: 8, descent: 2 }),
    });
    const visible = layout.pages.flatMap((p) =>
      p.columns.flatMap((c) =>
        c.tables.flatMap((t) =>
          t.cells.flatMap((c) =>
            c.lines.flatMap((l) => l.fragments.map((f) => f.text)),
          ),
        ),
      ),
    );
    expect(visible.join(" ")).toContain("Visible typed text");
  } finally {
    session.destroy();
  }
});
test("deleting a second vertical restart does not join its surviving continuation to the first group", () => {
  const { session, table, doc } = fixture([
    [{ ...cell("First group"), gridSpan: 2, verticalMerge: "restart" }],
    [{ ...cell(""), gridSpan: 2, verticalMerge: "continue" }],
    [{ ...cell("Second group"), gridSpan: 2, verticalMerge: "restart" }],
    [{ ...cell(""), gridSpan: 2, verticalMerge: "continue" }],
  ]);
  try {
    const id = structuredGrid(doc, table)[2]!.id;
    apply(doc, { kind: "delete-axis", table, dimension: "row", id });
    expect(exported(session).rows.map((r) => r[0]!.verticalMerge)).toEqual([
      "restart",
      "continue",
      "restart",
    ]);
  } finally {
    session.destroy();
  }
});
for (const order of [
  [0, 1, 2],
  [2, 0, 1],
  [1, 2, 0],
]) {
  test(`equivalent concurrent merges coalesce and contradictory coverage conflicts, delivery ${order.join("")}`, () => {
    const { session, table, doc } = fixture(
      [[cell("A"), cell("B"), cell("C")]],
      3,
    );
    const peers = [doc, clone(doc), clone(doc)];
    try {
      const target = structuredGrid(doc, table)[0]!.cells[0]!.address;
      for (const peer of peers)
        apply(peer, { kind: "merge-right", cell: target });
      const equal = peers.map((peer) => Y.encodeStateAsUpdate(peer));
      for (const peer of peers)
        for (const i of [...order, ...order]) Y.applyUpdate(peer, equal[i]!);
      for (const peer of peers) {
        validateWordSharedDocument(peer);
        expect(
          structuredGrid(peer, table)[0]!.cells.map((c) => c.columns.length),
        ).toEqual([2, 1]);
      }
      // A sequential extension consumes all equivalent observed records.
      apply(doc, { kind: "merge-right", cell: target });
      expect(texts(exported(session).rows[0]![0]!.blocks)).toEqual([
        "A",
        "B",
        "C",
      ]);
      // A separately prepared shorter merge must remain evidence, not overwrite it.
      apply(peers[1]!, { kind: "split-cell", cell: target });
      apply(peers[1]!, { kind: "merge-right", cell: target });
      const changed = peers.map((peer) => Y.encodeStateAsUpdate(peer));
      for (const peer of peers)
        for (const i of [...order, ...order]) Y.applyUpdate(peer, changed[i]!);
      for (const peer of peers)
        expect(() => validateWordSharedDocument(peer)).toThrow(
          "Overlapping merges",
        );
      apply(doc, { kind: "split-cell", cell: target });
      validateWordSharedDocument(doc);
      expect(
        texts(exported(session).rows[0]!.flatMap((c) => c.blocks)),
      ).toEqual(["A", "B", "C"]);
    } finally {
      session.destroy();
      peers.slice(1).forEach((peer) => peer.destroy());
    }
  });
}
