import { expect, test } from "bun:test";
import { createWordArtifact, importWordContent } from "../src/index.ts";
import { openWordOperationDocument } from "../src/operations/document.ts";
import { WordSharedText, structuredGrid } from "../src/collaboration/structured/index.ts";
import { createWordCommands } from "../src/collaboration/commands.ts";
import { tableParagraphs } from "../src/collaboration/tables.ts";
import { apply, cell, clone, derived, paragraph, sync, texts } from "./structured-table-fixtures.ts";

const commands = createWordCommands();
const withIntroduction = () => openWordOperationDocument(createWordArtifact({ blocks: [
  paragraph("Intro"), { kind: "table", rows: [[cell("A"), cell("B")]] }, paragraph("After"),
] }));

for (const start of [0, 5]) {
  for (const value of ["", "Replacement"]) {
    test(`replacement from ${start} across an introduction and table preserves flow, anchors and undo`, () => {
      const session = withIntroduction(), doc = session.text.doc!, view = new WordSharedText(doc, "body");
      view.commit(view.prepareMigration());
      const history = session.history();
      try {
        const after = view.anchor({ start: 10, end: 15 });
        view.commit(view.prepareDelta(commands.replaceWordDelta(view.text, { start, end: 10 }, value)), history.origin);
        const prefix = (start ? "Intro" : "") + value;
        expect(view.text.toString()).toBe(prefix + "After\n");
        expect(view.resolve(after)).toEqual({ start: prefix.length, end: prefix.length + 5 });
        expect(texts(importWordContent(session.artifact()))).toEqual([prefix + "After"]);
        expect(history.undo()).toBe(true);
        expect(view.text.toString()).toBe("Intro\nA\nB\nAfter\n");
        expect(history.redo()).toBe(true);
        expect(texts(importWordContent(session.artifact()))).toEqual([prefix + "After"]);
        const remote = clone(doc), other = new WordSharedText(remote, "body");
        try { expect(other.text.toDelta()).toEqual(view.text.toDelta()); }
        finally { other.destroy(); remote.destroy(); }
      } finally { history.destroy(); view.destroy(); session.destroy(); }
    });
  }
}

for (const nested of [false, true]) {
  test(`replacement extending into the next ${nested ? "nested" : "body"} table retains paragraph ownership`, () => {
    const children = [
      { kind: "table" as const, rows: [[cell("A"), cell("B")]] },
      { kind: "table" as const, rows: [[cell("CC"), cell("D")]] },
    ];
    const session = openWordOperationDocument(createWordArtifact({ blocks: nested
      ? [{ kind: "table", rows: [[{ blocks: [...children, paragraph("Tail")] }, cell("Other")]] }]
      : children }));
    const view = new WordSharedText(session.text.doc!, "body");
    try {
      view.commit(view.prepareMigration());
      view.commit(view.prepareDelta(commands.replaceWordDelta(view.text, { start: 0, end: 5 }, "Q\n")));
      let blocks = importWordContent(session.artifact());
      if (nested) {
        const parent = blocks[0]!;
        if (parent.kind !== "table") throw Error("parent");
        expect(texts(parent.rows[0]![1]!.blocks)).toEqual(["Other"]);
        blocks = [...parent.rows[0]![0]!.blocks];
      }
      expect(blocks[0]?.kind).toBe("paragraph");
      expect(texts(blocks.slice(0, 1))).toEqual(["Q"]);
      const table = blocks[1]!;
      expect(table.kind).toBe("table");
      if (table.kind === "table") expect(table.rows[0]!.map(cell => texts(cell.blocks))).toEqual([["C"], ["D"]]);
    } finally { view.destroy(); session.destroy(); }
  });
}

test("paragraph joins before a nested table work inside an inserted parent cell", () => {
  const seed = derived();
  apply(seed.doc, { kind: "replace", selection: { cell: seed.target, range: { start: 0, end: 0 } }, value: "Intro\nAfter" });
  seed.session.commit(seed.session.prepareOperation(
    { cell: seed.target, range: { start: 5, end: 5 } },
    { name: "insert-table", input: { rows: [["A", "B"]] } },
  ));
  const view = new WordSharedText(seed.doc, "body");
  try {
    const from = view.range({ cell: seed.target, range: { start: 5, end: 5 } }).start;
    const after = tableParagraphs(view.text).find(p => view.text.toString().slice(p.start, p.end) === "After\n")!;
    view.commit(view.prepareDelta([{ retain: from }, { delete: after.start - from }, { insert: "Joined", attributes: {} }]));
    const table = importWordContent(seed.session.artifact())[0]!;
    if (table.kind !== "table") throw Error("parent");
    expect(texts(table.rows[0]![1]!.blocks)).toEqual(["IntroJoinedAfter"]);
    expect(texts(table.rows[0]![2]!.blocks)).toEqual(["B"]);
  } finally { view.destroy(); seed.session.destroy(); }
});

test("concurrent whole-table deletions retain the paragraph join and undo independently", () => {
  const session = withIntroduction(), doc = session.text.doc!, view = new WordSharedText(doc, "body");
  view.commit(view.prepareMigration());
  const remote = clone(doc), other = new WordSharedText(remote, "body"), history = session.history();
  try {
    const cell = view.selection({ start: 6, end: 6 });
    if (!("cell" in cell)) throw Error("table cell");
    expect(structuredGrid(remote, cell.cell)[0]!.cells).toHaveLength(2);
    apply(remote, { kind: "delete-table", table: cell.cell });
    view.commit(view.prepareDelta(commands.replaceWordDelta(view.text, { start: 5, end: 10 }, "")), history.origin);
    sync(doc, remote);
    expect(view.text.toString()).toBe("IntroAfter\n");
    expect(other.text.toString()).toBe(view.text.toString());
    expect(texts(importWordContent(session.artifact()))).toEqual(["IntroAfter"]);
    expect(history.undo()).toBe(true);
    expect(view.text.toString()).toBe("Intro\nAfter\n");
    expect(texts(importWordContent(session.artifact()))).toEqual(["Intro", "After"]);
  } finally { history.destroy(); other.destroy(); remote.destroy(); view.destroy(); session.destroy(); }
});
