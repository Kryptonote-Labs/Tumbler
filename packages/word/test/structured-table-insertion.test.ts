import { expect, test } from "bun:test";
import type { WordOperation } from "../src/operations/definitions.ts";
import { WordSharedText, structuredGrid } from "../src/collaboration/structured/index.ts";
import { cellName, tableAddresses } from "../src/collaboration/structured/state.ts";
import { apply, cell, derived, exported, fixture, texts } from "./structured-table-fixtures.ts";

const insertion = { name: "insert-table", input: { rows: [["Child"]] } } satisfies WordOperation;

for (const content of ["", "Parent"])
  for (const storage of ["source", "canonical"] as const)
    for (const route of ["scoped", "linear"] as const)
      test(`${route} nested insertion in ${storage} ${JSON.stringify(content)} preserves parent blocks and history`, () => {
        const seed = storage === "source" ? fixture([[cell(content), cell("Sibling")]]) : derived();
        const column = storage === "source" ? 0 : 1;
        const target = structuredGrid(seed.doc, seed.table)[0]!.cells[column]!.address;
        if (storage === "canonical" && content)
          apply(seed.doc, { kind: "replace", selection: { cell: target, range: { start: 0, end: 0 } }, value: content });
        const view = new WordSharedText(seed.doc, "body");
        const history = seed.session.history();
        const blocks = () => exported(seed.session).rows[0]![column]!.blocks;
        const assertInserted = () => {
          expect(blocks().map(block => block.kind)).toEqual(["paragraph", "table", "paragraph"]);
          expect(texts(blocks())).toEqual([content, "Child", ""]);
          expect(texts(exported(seed.session).rows[0]![storage === "source" ? 1 : 2]!.blocks))
            .toEqual([storage === "source" ? "Sibling" : "B"]);
        };
        try {
          const selection = { cell: target, range: { start: 0, end: 0 } };
          const edit = route === "scoped"
            ? seed.session.prepareOperation(selection, insertion)
            : view.prepareOperation(view.range(selection), insertion);
          seed.session.commit(edit, history.origin);
          assertInserted();
          expect(edit.selection).toBeDefined();
          const caret = view.range(edit.selection!);
          expect(view.text.toString().slice(caret.start, caret.start + 5)).toBe("Child");
          expect(history.undo()).toBe(true);
          expect(blocks().map(block => block.kind)).toEqual(["paragraph"]);
          expect(texts(blocks())).toEqual([content]);
          expect(history.redo()).toBe(true);
          assertInserted();
          const childTable = tableAddresses(seed.doc).find(address => address.table !== seed.table.table)!;
          const child = structuredGrid(seed.doc, childTable)[0]!.cells[0]!.address;
          seed.session.commit(seed.session.prepareOperation(
            { cell: child, range: { start: 0, end: 0 } }, { name: "replace", input: { value: "New " } },
          ));
          expect(texts(blocks())).toEqual([content, "New Child", ""]);
        } finally {
          history.destroy(); view.destroy(); seed.session.destroy();
        }
      });

test("scoped source-cell nesting inside a canonical story retains its enclosing tables", () => {
  const seed = derived();
  try {
    seed.session.commit(seed.session.prepareOperation({ cell: seed.target, range: { start: 0, end: 0 } }, insertion));
    const childTable = tableAddresses(seed.doc).find(address => address.story === cellName(seed.target))!;
    const child = structuredGrid(seed.doc, childTable)[0]!.cells[0]!.address;
    seed.session.commit(seed.session.prepareOperation({ cell: child, range: { start: 0, end: 0 } }, insertion));
    const blocks = exported(seed.session).rows[0]![1]!.blocks;
    expect(blocks.map(block => block.kind)).toEqual(["paragraph", "table", "paragraph"]);
    const nested = blocks[1];
    if (nested?.kind !== "table") throw new Error("Expected nested table");
    expect(nested.rows[0]![0]!.blocks.map(block => block.kind)).toEqual(["paragraph", "table", "paragraph"]);
    expect(texts(nested.rows[0]![0]!.blocks)).toEqual(["Child", "Child", ""]);
  } finally { seed.session.destroy(); }
});
