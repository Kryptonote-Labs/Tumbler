import { expect, test } from "bun:test";
import { createWordArtifact, importWordContent, openWordArtifact } from "../src/index.ts";
import { openWordOperationDocument } from "../src/operations/document.ts";
import { WordSharedText } from "../src/collaboration/structured/view.ts";
import { createWordCommands } from "../src/collaboration/commands.ts";
import { tableParagraphs } from "../src/collaboration/tables.ts";
import { cell, paragraph, texts } from "./structured-table-fixtures.ts";

for (const nested of [false, true]) {
  for (const order of ["insert-first", "delete-first"] as const) {
    test(`${order} replacement preserves adjacent ${nested ? "nested" : "body"} table ownership`, () => {
      const children = [
        { kind: "table" as const, rows: [[cell("A"), cell("B")]] },
        { kind: "table" as const, rows: [[cell("C"), cell("D")]] },
      ];
      const session = openWordOperationDocument(createWordArtifact({ blocks: nested
        ? [{ kind: "table", rows: [[{ blocks: [...children, paragraph("Parent")] }, cell("Other")]] }]
        : children }));
      const view = new WordSharedText(session.text.doc!, "body");
      try {
        view.commit(view.prepareMigration());
        const rows = tableParagraphs(view.text);
        const first = rows.find(p => p.table && (nested ? p.table.parents?.length === 1 : !p.table.parents))!;
        const end = rows.filter(p => p.table?.id === first.table!.id).at(-1)!.end;
        const inserts = [{ insert: "Rich ", attributes: { bold: true } }, { insert: "replacement\nSuffix", attributes: { italic: true } }];
        const deletes = [{ delete: 1 }, { delete: end - first.start - 1 }];
        view.commit(view.prepareDelta([
          ...(first.start ? [{ retain: first.start }] : []),
          ...(order === "insert-first" ? [...inserts, ...deletes] : [...deletes, ...inserts]),
        ]));
        let blocks = importWordContent(openWordArtifact(session.artifact().bytes()));
        if (nested) {
          const parent = blocks[0]!;
          if (parent.kind !== "table") throw Error("parent table");
          expect(texts(parent.rows[0]![1]!.blocks)).toEqual(["Other"]);
          blocks = [...parent.rows[0]![0]!.blocks];
        }
        expect(blocks[0]?.kind).toBe("paragraph");
        expect(texts(blocks.slice(0, 1))).toEqual(["Rich replacement"]);
        if (blocks[0]?.kind === "paragraph") {
          expect(blocks[0].runs[0]?.format?.bold).toBe(true);
          expect(blocks[0].runs[1]?.format?.italic).toBe(true);
        }
        expect(blocks[1]?.kind).toBe("table");
        if (blocks[1]?.kind === "table")
          expect(blocks[1].rows[0]!.map(c => texts(c.blocks))).toEqual([["SuffixC"], ["D"]]);
        if (nested) expect(texts(blocks.slice(2))).toEqual(["Parent"]);
      } finally { view.destroy(); session.destroy(); }
    });
  }
}
