import { expect, test } from "bun:test";
import { createWordArtifact, importWordContent } from "../src/index.ts";
import { openWordOperationDocument } from "../src/operations/document.ts";
import { WordSharedText } from "../src/collaboration/structured/index.ts";
import { createWordCommands } from "../src/collaboration/commands.ts";
import { tableParagraphs } from "../src/collaboration/tables.ts";
import { apply, cell, derived, paragraph, texts } from "./structured-table-fixtures.ts";

type Scope = "body" | "source" | "canonical";
function joined(scope: Scope) {
  const seed = scope === "canonical" ? derived() : undefined;
  const content = [paragraph("Intro"), { kind: "table" as const, rows: [[cell("A"), cell("B")]] }, paragraph("After")];
  const session = seed?.session ?? openWordOperationDocument(createWordArtifact({ blocks: scope === "body"
    ? content : [{ kind: "table", rows: [[{ blocks: content }, cell("Other")]] }] }));
  if (seed) {
    apply(seed.doc, { kind: "replace", selection: { cell: seed.target, range: { start: 0, end: 0 } }, value: "Intro\nAfter" });
    session.commit(session.prepareOperation({ cell: seed.target, range: { start: 5, end: 5 } }, {
      name: "insert-table", input: { rows: [["A", "B"]] },
    }));
  }
  const view = new WordSharedText(session.text.doc!, "body");
  view.commit(view.prepareMigration());
  const at = view.text.toString().indexOf("Intro");
  view.commit(view.prepareDelta([{ retain: at + 5 }, { delete: 5 }]));
  const blocks = () => {
    const result = importWordContent(session.artifact());
    if (scope === "body") return result;
    const table = result[0]!;
    if (table.kind !== "table") throw Error("parent table");
    return table.rows[0]![scope === "source" ? 0 : 1]!.blocks;
  };
  return { session, view, at, blocks };
}

for (const scope of ["body", "source", "canonical"] as const) {
  test(`${scope} operations replace across a joined paragraph and undo atomically`, () => {
    const { session, view, at, blocks } = joined(scope), history = session.history();
    try {
      const edit = view.prepareOperation({ start: at + 3, end: at + 7 }, { name: "replace", input: { value: "X" } });
      view.commit(edit, history.origin);
      expect(texts(blocks())).toEqual(["IntXter"]);
      expect(view.range(edit.selection!)).toEqual(edit.range);
      expect(history.undo()).toBe(true);
      expect(texts(blocks())).toEqual(["IntroAfter"]);
      expect(history.redo()).toBe(true);
      expect(texts(blocks())).toEqual(["IntXter"]);
    } finally { history.destroy(); view.destroy(); session.destroy(); }
  });
  test(`${scope} paragraph formatting targets the visible terminator after a join`, () => {
    const { session, view, at, blocks } = joined(scope);
    try {
      const range = { start: at + 2, end: at + 2 };
      view.commit(view.prepareOperation(range, { name: "paragraph", input: { align: "center" } }));
      expect(createWordCommands().wordFormats(view.text, range).align).toBe("center");
      expect(blocks()[0]).toMatchObject({ kind: "paragraph", alignment: "center" });
    } finally { view.destroy(); session.destroy(); }
  });
  test(`${scope} inserts a table after the complete joined paragraph`, () => {
    const { session, view, at, blocks } = joined(scope), history = session.history();
    try {
      const edit = view.prepareOperation({ start: at + 2, end: at + 2 }, { name: "insert-table", input: { rows: [["X", "Y"]] } });
      view.commit(edit, history.origin);
      expect(blocks()[0]?.kind).toBe("paragraph");
      expect(texts(blocks().slice(0, 1))).toEqual(["IntroAfter"]);
      const table = blocks()[1]!;
      expect(table.kind).toBe("table");
      if (table.kind === "table") expect(table.rows[0]!.map(cell => texts(cell.blocks))).toEqual([["X"], ["Y"]]);
      expect(view.range(edit.selection!)).toEqual(edit.range);
      expect(view.text.toString().slice(edit.range.start, edit.range.start + 1)).toBe("X");
      expect(history.undo()).toBe(true);
      expect(texts(blocks())).toEqual(["IntroAfter"]);
      expect(history.redo()).toBe(true);
      view.commit(view.prepareOperation(edit.range, { name: "replace", input: { value: "Z" } }));
      const updated = blocks()[1]!;
      if (updated.kind !== "table") throw Error("inserted table");
      expect(texts(updated.rows[0]![0]!.blocks)).toEqual(["ZX"]);
    } finally { history.destroy(); view.destroy(); session.destroy(); }
  });
}

for (const scope of ["source", "canonical"] as const) {
  for (const route of ["scoped", "linear"] as const) {
    test(`${route} clear of a joined ${scope} parent preserves retained separators and undo`, () => {
      const { session, view, at, blocks } = joined(scope), history = session.history();
      try {
        const parent = tableParagraphs(view.text).find(p => p.start === at)!;
        const operation = { name: "edit-table", input: { action: "clear-cell", cellId: parent.table!.cell } } as const;
        const range = { start: at, end: at };
        const edit = route === "scoped" ? session.prepareOperation(view.selection(range), operation) : view.prepareOperation(range, operation);
        const selection = view.commit(edit, history.origin)!;
        expect(texts(blocks())).toEqual([""]);
        expect(() => view.range(selection)).not.toThrow();
        expect(history.undo()).toBe(true);
        expect(texts(blocks())).toEqual(["IntroAfter"]);
        expect(history.redo()).toBe(true);
        expect(texts(blocks())).toEqual([""]);
      } finally { history.destroy(); view.destroy(); session.destroy(); }
    });
  }
}

test("formatting across a physical gap keeps the linear range without returning an unusable scoped range", () => {
  const { session, view } = joined("body");
  try {
    const range = { start: 3, end: 7 };
    const edit = view.prepareOperation(range, { name: "format", input: { bold: true } });
    view.commit(edit);
    expect(edit.range).toEqual(range);
    expect(edit.selection).toBeUndefined();
    view.commit(view.prepareOperation(edit.range, { name: "replace", input: { value: "X" } }));
    expect(view.text.toString()).toBe("IntXter\n");
  } finally { view.destroy(); session.destroy(); }
});
