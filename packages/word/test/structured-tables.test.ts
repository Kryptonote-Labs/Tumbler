import { expect, test } from "bun:test";
import * as Y from "yjs";
import {
  insertTableDelta,
  tableParagraphs,
} from "../src/collaboration/tables.ts";
import {
  prepareWordUpdate,
  commitWordUpdate,
  structuredGrid,
  WordStructuredUndo,
  validateWordSharedDocument,
  projectWordSharedDocument,
  anchorScopedSelection,
  resolveScopedAnchor,
  type WordStructuredChange,
} from "../src/collaboration/structured/index.ts";
import { createWordArtifact } from "../src/index.ts";
const source = createWordArtifact();
function setup() {
  const seed = new Y.Doc();
  const text = seed.getText("body");
  text.insert(0, "\n");
  text.applyDelta(
    insertTableDelta(text, 0, [
      ["A", "B"],
      ["C", "D"],
    ]).delta,
  );
  const table = {
    story: "body",
    table: tableParagraphs(text).find((p) => p.table)!.table!.id,
  };
  commitWordUpdate(seed, prepareWordUpdate(seed, [{ kind: "migrate", table }]));
  const peers = [100, 200, 300].map((id) => {
    const doc = new Y.Doc();
    doc.clientID = id;
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(seed));
    doc.getText("body");
    return doc;
  });
  seed.destroy();
  return { peers, table };
}
function apply(doc: Y.Doc, change: WordStructuredChange, origin?: unknown) {
  return commitWordUpdate(doc, prepareWordUpdate(doc, [change]), origin);
}
function sync(docs: Y.Doc[], reverse = false) {
  const updates = docs.map((d) => Y.encodeStateAsUpdate(d));
  if (reverse) updates.reverse();
  for (const doc of docs)
    for (const update of [...updates, ...updates]) Y.applyUpdate(doc, update);
}
for (const reverse of [false, true])
  test(`interior row/column insertion and concurrent first typing, reverse ${reverse}`, () => {
    const { peers, table } = setup();
    const [a, b] = peers as [Y.Doc, Y.Doc, Y.Doc];
    try {
      apply(a, { kind: "insert-axis", table, dimension: "row", at: 1 });
      apply(b, { kind: "insert-axis", table, dimension: "column", at: 1 });
      sync(peers, reverse);
      for (const doc of peers) {
        validateWordSharedDocument(doc);
        const grid = structuredGrid(doc, table);
        expect(grid.map((r) => r.cells.length)).toEqual([3, 3, 3]);
      }
      const cell = structuredGrid(a, table)[1]!.cells[1]!.address;
      const anchor = anchorScopedSelection(a, {
        cell,
        range: { start: 0, end: 0 },
      });
      const undoA = new WordStructuredUndo(a),
        undoB = new WordStructuredUndo(b);
      apply(
        a,
        {
          kind: "replace",
          selection: { cell, range: { start: 0, end: 0 } },
          value: "Alice",
        },
        undoA.origin,
      );
      apply(
        b,
        {
          kind: "replace",
          selection: { cell, range: { start: 0, end: 0 } },
          value: "Bob",
        },
        undoB.origin,
      );
      sync(peers, reverse);
      const projected = peers.map((doc) =>
        projectWordSharedDocument(doc, "body", source),
      );
      expect(projected[0]).toEqual(projected[1]);
      const block = projected[0]!.find((b) => b.kind === "table");
      if (block?.kind !== "table") throw Error("table");
      expect(block.rows[1]![1]!.blocks).toHaveLength(1);
      const paragraph = block.rows[1]![1]!.blocks[0]!;
      if (paragraph.kind !== "paragraph") throw Error("paragraph");
      expect(["AliceBob", "BobAlice"]).toContain(
        paragraph.runs.map((run) => run.text).join(""),
      );
      expect(resolveScopedAnchor(a, anchor)).toEqual({
        cell,
        range: { start: 0, end: 0 },
      });
      undoA.undo();
      sync(peers);
      expect(
        JSON.stringify(projectWordSharedDocument(a, "body", source)),
      ).not.toContain("Alice");
      expect(
        JSON.stringify(projectWordSharedDocument(a, "body", source)),
      ).toContain("Bob");
      undoA.redo();
      sync(peers);
      expect(
        JSON.stringify(projectWordSharedDocument(a, "body", source)),
      ).toContain("Alice");
      expect(
        JSON.stringify(projectWordSharedDocument(a, "body", source)),
      ).toContain("Bob");
      undoB.undo();
      sync(peers);
      expect(
        JSON.stringify(projectWordSharedDocument(a, "body", source)),
      ).toContain("Alice");
      expect(
        JSON.stringify(projectWordSharedDocument(a, "body", source)),
      ).not.toContain("Bob");
      undoA.destroy();
      undoB.destroy();
    } finally {
      peers.forEach((d) => d.destroy());
    }
  });
test("concurrent columns preserve original coordinates across every row", () => {
  const { peers, table } = setup();
  try {
    for (const doc of peers)
      apply(doc, { kind: "insert-axis", table, dimension: "column", at: 1 });
    sync(peers);
    const grids = peers.map((doc) => structuredGrid(doc, table));
    expect(grids[0]).toEqual(grids[1]);
    expect(grids[1]).toEqual(grids[2]);
    expect(
      grids[0]!.map((row) => row.cells.map((c) => c.address.column)),
    ).toEqual([
      grids[0]![0]!.cells.map((c) => c.address.column),
      grids[0]![0]!.cells.map((c) => c.address.column),
    ]);
    expect(grids[0]![0]!.cells.at(-1)!.address.column).toBe("base-1");
  } finally {
    peers.forEach((d) => d.destroy());
  }
});
test("scoped adapter selects, formats, exports and reopens a newly derived cell", async () => {
  const { openWordOperationDocument } = await import(
    "../src/operations/index.ts"
  );
  const { openWordArtifact, importWordContent } = await import(
    "../src/index.ts"
  );
  const session = openWordOperationDocument(source);
  const remote = new Y.Doc();
  try {
    session.commit(
      session.prepareOperation(
        { story: "body", range: { start: 0, end: 0 } },
        {
          name: "insert-table",
          input: {
            rows: [
              ["A", "B"],
              ["C", "D"],
            ],
          },
        },
      ),
    );
    const tableId = tableParagraphs(session.text).find((p) => p.table)!.table!
      .id;
    const table = { story: "body", table: tableId };
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(session.text.doc!));
    remote.getText("body");
    session.commit(
      session.prepare([
        { kind: "insert-axis", table, dimension: "row", at: 1 },
      ]),
    );
    apply(remote, { kind: "insert-axis", table, dimension: "column", at: 1 });
    sync([session.text.doc!, remote]);
    const cell = session.grid(tableId)[1]!.cells[1]!.address;
    const selected = session.commit(
      session.prepareOperation(
        { cell, range: { start: 0, end: 0 } },
        { name: "replace", input: { value: "Hello" } },
      ),
    )!;
    expect(selected).toEqual({ cell, range: { start: 5, end: 5 } });
    session.commit(
      session.prepareOperation(
        { cell, range: { start: 0, end: 5 } },
        { name: "format", input: { bold: true } },
      ),
    );
    session.commit(
      session.prepareOperation(
        { cell, range: { start: 0, end: 0 } },
        { name: "paragraph", input: { paragraph: { keepNext: true } } },
      ),
    );
    const reopened = importWordContent(
      openWordArtifact(session.artifact().bytes()),
    );
    const block = reopened.find((b) => b.kind === "table");
    if (block?.kind !== "table") throw Error("table");
    expect(block.rows.map((r) => r.length)).toEqual([3, 3, 3]);
    const paragraph = block.rows[1]![1]!.blocks[0]!;
    if (paragraph.kind !== "paragraph") throw Error("paragraph");
    expect(paragraph.runs.map((r) => r.text).join("")).toBe("Hello");
    expect(paragraph.runs[0]!.format?.bold).toBe(true);
    expect(paragraph.paragraph?.keepNext).toBe(true);
  } finally {
    session.destroy();
    remote.destroy();
  }
});
test("undo of an axis with remote payload fails atomically and keeps content addressable", () => {
  const { peers, table } = setup();
  const a = peers[0]!,
    b = peers[1]!;
  const undo = new WordStructuredUndo(a);
  try {
    apply(
      a,
      { kind: "insert-axis", table, dimension: "column", at: 1 },
      undo.origin,
    );
    sync(peers);
    const cell = structuredGrid(b, table)[0]!.cells[1]!.address;
    apply(b, {
      kind: "replace",
      selection: { cell, range: { start: 0, end: 0 } },
      value: "remote",
    });
    sync(peers);
    const before = Y.encodeStateAsUpdate(a);
    expect(() => undo.undo()).toThrow("detach");
    expect(Y.encodeStateAsUpdate(a)).toEqual(before);
    expect(
      JSON.stringify(projectWordSharedDocument(a, "body", source)),
    ).toContain("remote");
  } finally {
    undo.destroy();
    peers.forEach((d) => d.destroy());
  }
});
test("concurrent deletion and typing is recoverable by restoring the axis", () => {
  const { peers, table } = setup();
  try {
    const cell = structuredGrid(peers[0]!, table)[0]!.cells[0]!.address;
    apply(peers[0]!, {
      kind: "delete-axis",
      table,
      dimension: "column",
      id: cell.column,
    });
    apply(peers[1]!, {
      kind: "replace",
      selection: { cell, range: { start: 1, end: 1 } },
      value: "remote",
    });
    sync(peers);
    expect(() => projectWordSharedDocument(peers[0]!, "body", source)).toThrow(
      "Deleted axis",
    );
    apply(peers[0]!, {
      kind: "restore-axis",
      table,
      dimension: "column",
      id: cell.column,
    });
    sync(peers);
    peers.forEach(validateWordSharedDocument);
    expect(
      JSON.stringify(projectWordSharedDocument(peers[0]!, "body", source)),
    ).toContain("remote");
  } finally {
    peers.forEach((d) => d.destroy());
  }
});
for (const order of [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
])
  test(`three active peers, delivery ${order.join("")}`, () => {
    const { peers, table } = setup();
    try {
      apply(peers[0]!, { kind: "insert-axis", table, dimension: "row", at: 1 });
      apply(peers[1]!, {
        kind: "insert-axis",
        table,
        dimension: "column",
        at: 1,
      });
      apply(peers[2]!, {
        kind: "insert-axis",
        table,
        dimension: "column",
        at: 1,
      });
      const updates = peers.map((d) => Y.encodeStateAsUpdate(d));
      for (const peer of peers)
        for (const i of [...order, ...order]) Y.applyUpdate(peer, updates[i]!);
      const views = peers.map((doc) =>
        projectWordSharedDocument(doc, "body", source),
      );
      expect(views[0]).toEqual(views[1]);
      expect(views[1]).toEqual(views[2]);
      const grid = structuredGrid(peers[0]!, table);
      expect(grid.map((row) => row.cells.length)).toEqual([4, 4, 4]);
      expect(grid[0]!.cells.at(-1)!.address.column).toBe("base-1");
      const block = views[0]!.find((b) => b.kind === "table");
      if (block?.kind !== "table") throw Error("table");
      const texts = block.rows.map((row) =>
        row.map((cell) =>
          cell.blocks
            .flatMap((b) =>
              b.kind === "paragraph" ? b.runs.map((r) => r.text) : [],
            )
            .join(""),
        ),
      );
      expect(texts).toEqual([
        ["A", "", "", "B"],
        ["", "", "", ""],
        ["C", "", "", "D"],
      ]);
    } finally {
      peers.forEach((d) => d.destroy());
    }
  });
test("concurrent migration preserves characters, metadata and legacy projection", () => {
  const seed = new Y.Doc();
  const text = seed.getText("body");
  text.insert(0, "\n");
  text.applyDelta(
    insertTableDelta(text, 0, [
      ["A", "B"],
      ["C", "D"],
    ]).delta,
  );
  const table = {
    story: "body",
    table: tableParagraphs(text).find((p) => p.table)!.table!.id,
  };
  const before = projectWordSharedDocument(seed, "body", source),
    chars = text.toString();
  const peers = [new Y.Doc(), new Y.Doc()];
  try {
    for (const doc of peers) {
      Y.applyUpdate(doc, Y.encodeStateAsUpdate(seed));
      doc.getText("body");
      apply(doc, { kind: "migrate", table });
    }
    sync(peers);
    for (const doc of peers) {
      expect(doc.getText("body").toString()).toBe(chars);
      const after = projectWordSharedDocument(doc, "body", source);
      const old = before.find((b) => b.kind === "table"),
        now = after.find((b) => b.kind === "table");
      if (old?.kind !== "table" || now?.kind !== "table") throw Error("table");
      expect(
        JSON.parse(
          JSON.stringify(now.rows, (key, value) =>
            key === "table" ? undefined : value,
          ),
        ),
      ).toEqual(
        JSON.parse(
          JSON.stringify(old.rows, (key, value) =>
            key === "table" ? undefined : value,
          ),
        ),
      );
      expect(structuredGrid(doc, table).map((r) => r.cells.length)).toEqual([
        2, 2,
      ]);
    }
  } finally {
    seed.destroy();
    peers.forEach((d) => d.destroy());
  }
});
test("conflicting migration baselines refuse projection without removing either state", () => {
  const seed = new Y.Doc();
  const text = seed.getText("body");
  text.insert(0, "\n");
  text.applyDelta(insertTableDelta(text, 0, [["A", "B"]]).delta);
  const table = {
    story: "body",
    table: tableParagraphs(text).find((p) => p.table)!.table!.id,
  };
  const a = new Y.Doc(),
    b = new Y.Doc();
  try {
    for (const doc of [a, b]) {
      Y.applyUpdate(doc, Y.encodeStateAsUpdate(seed));
      doc.getText("body");
    }
    const paragraphs = tableParagraphs(b.getText("body")).filter(
      (p) => p.table,
    );
    for (const p of paragraphs)
      b.getText("body").format(p.end - 1, 1, {
        table: { ...p.table!, widths: [50, 100] },
      });
    apply(a, { kind: "migrate", table });
    apply(b, { kind: "migrate", table });
    sync([a, b]);
    expect(() => projectWordSharedDocument(a, "body", source)).toThrow(
      "baselines",
    );
    expect(a.getText("body").toString()).toContain("A");
    expect(a.getText("body").toString()).toContain("B");
  } finally {
    seed.destroy();
    a.destroy();
    b.destroy();
  }
});
test("merge versus interior insertion reports recoverable coverage conflict", () => {
  const { peers, table } = setup();
  try {
    const cell = structuredGrid(peers[0]!, table)[0]!.cells[0]!.address;
    apply(peers[0]!, { kind: "merge-right", cell });
    apply(peers[1]!, {
      kind: "insert-axis",
      table,
      dimension: "column",
      at: 1,
    });
    sync(peers);
    expect(() => projectWordSharedDocument(peers[0]!, "body", source)).toThrow(
      "coverage",
    );
    apply(peers[0]!, { kind: "split-cell", cell });
    sync(peers);
    peers.forEach(validateWordSharedDocument);
  } finally {
    peers.forEach((d) => d.destroy());
  }
});
test("table deletion retains payloads, restores, and does not export a deleted table", () => {
  const { peers, table } = setup();
  try {
    apply(peers[0]!, { kind: "delete-table", table });
    sync(peers);
    expect(
      projectWordSharedDocument(peers[0]!, "body", source).some(
        (b) => b.kind === "table",
      ),
    ).toBe(false);
    expect(peers[0]!.getText("body").toString()).toContain("A");
    apply(peers[0]!, { kind: "restore-table", table });
    expect(
      projectWordSharedDocument(peers[0]!, "body", source).some(
        (b) => b.kind === "table",
      ),
    ).toBe(true);
  } finally {
    peers.forEach((d) => d.destroy());
  }
});
test("nested migrated tables preserve ancestry through concurrent column insertions and export", async () => {
  const { openWordOperationDocument } = await import(
    "../src/operations/index.ts"
  );
  const { openWordArtifact, importWordContent } = await import(
    "../src/index.ts"
  );
  const nested = createWordArtifact({
    blocks: [
      {
        kind: "table",
        columnWidths: [100, 200],
        rows: [
          [
            {
              blocks: [
                {
                  kind: "table",
                  columnWidths: [40, 60],
                  rows: [
                    [
                      {
                        blocks: [
                          { kind: "paragraph", runs: [{ text: "Inner A" }] },
                        ],
                      },
                      {
                        blocks: [
                          { kind: "paragraph", runs: [{ text: "Inner B" }] },
                        ],
                      },
                    ],
                  ],
                },
              ],
            },
            { blocks: [{ kind: "paragraph", runs: [{ text: "Outer B" }] }] },
          ],
        ],
      },
    ],
  });
  const session = openWordOperationDocument(nested),
    remote = new Y.Doc();
  try {
    const tables = [
      ...new Set(
        tableParagraphs(session.text).flatMap((p) =>
          p.table
            ? [...(p.table.parents ?? []).map((t) => t.id), p.table.id]
            : [],
        ),
      ),
    ];
    session.commit(
      session.prepare(
        tables.map((table) => ({
          kind: "migrate",
          table: { story: "body", table },
        })),
      ),
    );
    const inner = tableParagraphs(session.text).find((p) => p.table?.parents)
      ?.table!.id!;
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(session.text.doc!));
    remote.getText("body");
    const table = { story: "body", table: inner };
    session.commit(
      session.prepare([
        { kind: "insert-axis", table, dimension: "column", at: 1 },
      ]),
    );
    apply(remote, { kind: "insert-axis", table, dimension: "column", at: 1 });
    sync([session.text.doc!, remote]);
    const blocks = importWordContent(
      openWordArtifact(session.artifact().bytes()),
    );
    const outer = blocks.find((b) => b.kind === "table");
    if (outer?.kind !== "table") throw Error("outer");
    expect(outer.rows[0]).toHaveLength(2);
    const child = outer.rows[0]![0]!.blocks.find((b) => b.kind === "table");
    if (child?.kind !== "table") throw Error("inner");
    expect(child.rows[0]).toHaveLength(4);
    expect(outer.columnWidths).toEqual([100, 200]);
  } finally {
    session.destroy();
    remote.destroy();
  }
});
test("vertical merged rows extend through insertion and restart after the first row is deleted", async () => {
  const { openWordOperationDocument } = await import(
    "../src/operations/index.ts"
  );
  const { importWordContent } = await import("../src/index.ts");
  const input = createWordArtifact({
    blocks: [
      {
        kind: "table",
        columnWidths: [80, 80],
        rows: [
          [
            {
              verticalMerge: "restart",
              blocks: [{ kind: "paragraph", runs: [{ text: "Merged" }] }],
            },
            { blocks: [{ kind: "paragraph", runs: [{ text: "B" }] }] },
          ],
          [
            {
              verticalMerge: "continue",
              blocks: [{ kind: "paragraph", runs: [] }],
            },
            { blocks: [{ kind: "paragraph", runs: [{ text: "D" }] }] },
          ],
        ],
      },
    ],
  });
  const session = openWordOperationDocument(input);
  try {
    const table = {
      story: "body",
      table: tableParagraphs(session.text).find((p) => p.table)!.table!.id,
    };
    session.commit(session.prepare([{ kind: "migrate", table }]));
    const first = session.grid(table.table)[0]!.id;
    session.commit(
      session.prepare([
        { kind: "insert-axis", table, dimension: "row", at: 1 },
      ]),
    );
    let block = importWordContent(session.artifact()).find(
      (b) => b.kind === "table",
    );
    if (block?.kind !== "table") throw Error("table");
    expect(block.rows.map((r) => r[0]!.verticalMerge)).toEqual([
      "restart",
      "continue",
      "continue",
    ]);
    session.commit(
      session.prepare([
        { kind: "delete-axis", table, dimension: "row", id: first },
      ]),
    );
    block = importWordContent(session.artifact()).find(
      (b) => b.kind === "table",
    );
    if (block?.kind !== "table") throw Error("table");
    expect(block.rows.map((r) => r[0]!.verticalMerge)).toEqual([
      "restart",
      "continue",
    ]);
  } finally {
    session.destroy();
  }
});
test("over-limit union retains data and can be resolved by explicit axis deletion", async () => {
  const { inspectWordTableState } = await import(
    "../src/collaboration/structured/index.ts"
  );
  const seed = new Y.Doc(),
    text = seed.getText("body");
  text.insert(0, "\n");
  text.applyDelta(
    insertTableDelta(text, 0, [Array.from({ length: 62 }, (_, i) => `C${i}`)])
      .delta,
  );
  const table = {
    story: "body",
    table: tableParagraphs(text).find((p) => p.table)!.table!.id,
  };
  apply(seed, { kind: "migrate", table });
  const peers = [new Y.Doc(), new Y.Doc()];
  try {
    for (const doc of peers) {
      Y.applyUpdate(doc, Y.encodeStateAsUpdate(seed));
      doc.getText("body");
      apply(doc, { kind: "insert-axis", table, dimension: "column", at: 1 });
    }
    sync(peers);
    expect(() => projectWordSharedDocument(peers[0]!, "body", source)).toThrow(
      "63",
    );
    expect(peers[0]!.getText("body").toString()).toContain("C61");
    const column = inspectWordTableState(peers[0]!, table).columns.find(
      (c) => !c.startsWith("base-"),
    )!;
    apply(peers[0]!, {
      kind: "delete-axis",
      table,
      dimension: "column",
      id: column,
    });
    sync(peers);
    peers.forEach(validateWordSharedDocument);
  } finally {
    seed.destroy();
    peers.forEach((d) => d.destroy());
  }
});
