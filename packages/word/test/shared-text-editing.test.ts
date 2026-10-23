import { expect, test } from "bun:test";
import { createWordCommands } from "../src/collaboration/commands.ts";
import { WordSharedText } from "../src/collaboration/structured/view.ts";
import { tableParagraphs } from "../src/collaboration/tables.ts";
import { apply, cell, fixture } from "./structured-table-fixtures.ts";

for (const action of ["delete-row", "delete-column", "delete-table"] as const) {
  test(`${action} at the beginning returns a surviving caret and permits the next edit`, () => {
    const seed = fixture([[cell("A"), cell("B")], [cell("C"), cell("D")]]);
    const view = new WordSharedText(seed.doc, "body");
    try {
      const first = tableParagraphs(view.text)[0]!;
      const edit = view.prepareOperation({ start: first.start, end: first.start }, {
        name: "edit-table", input: { action, cellId: first.table!.cell },
      });
      view.commit(edit);
      expect(view.text.toString()).not.toContain("A");
      expect(view.range(edit.selection!)).toEqual(edit.range);
      view.commit(view.prepareOperation(edit.range, { name: "replace", input: { value: "Here" } }));
      expect(view.text.toString()).toContain("Here");
      expect(() => seed.session.artifact()).not.toThrow();
    } finally { view.destroy(); seed.session.destroy(); }
  });
}

test("deleting an implicit column after an introductory paragraph returns the next visible cell", () => {
  const seed = fixture([[cell("A"), cell("B")]]);
  seed.doc.getText("body").insert(0, "Intro\n", {});
  apply(seed.doc, { kind: "insert-axis", table: seed.table, dimension: "column", at: 1 });
  const view = new WordSharedText(seed.doc, "body");
  try {
    const empty = tableParagraphs(view.text).find(p => p.table?.column === 1)!;
    const edit = view.prepareOperation({ start: empty.start, end: empty.start }, {
      name: "edit-table", input: { action: "delete-column", cellId: empty.table!.cell },
    });
    view.commit(edit);
    expect(tableParagraphs(view.text).filter(p => p.table)).toHaveLength(2);
    expect(view.range(edit.selection!)).toEqual(edit.range);
    expect(view.text.toString().slice(edit.range.start)).toBe("B\n\n");
  } finally { view.destroy(); seed.session.destroy(); }
});

test("browser deltas type, format, replace and delete body text after a leading migrated table", () => {
  const seed = fixture([[cell("A"), cell("B")]]);
  const view = new WordSharedText(seed.doc, "body");
  const commands = createWordCommands();
  try {
    const at = view.text.length - 1;
    view.commit(view.prepareDelta(commands.replaceWordDelta(view.text, { start: at, end: at }, "After")));
    view.commit(view.prepareDelta(commands.formatWordDelta(view.text, { start: at, end: at + 5 }, { bold: true })));
    expect(commands.wordFormats(view.text, { start: at, end: at + 5 }).bold).toBe(true);
    view.commit(view.prepareDelta(commands.replaceWordDelta(view.text, { start: at, end: at + 5 }, "Tail")));
    expect(view.text.toString()).toBe("A\nB\nTail\n");
    view.commit(view.prepareDelta(commands.replaceWordDelta(view.text, { start: at, end: at + 4 }, "")));
    expect(view.text.toString()).toBe("A\nB\n\n");
  } finally { view.destroy(); seed.session.destroy(); }
});
