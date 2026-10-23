import { expect, test } from "bun:test";
import { importWordContent, openWordArtifact } from "../src/index.ts";
import { openWordOperationDocument } from "../src/operations/document.ts";
import { tableParagraphs } from "../src/collaboration/tables.ts";
import { projectWordSharedDocument } from "../src/collaboration/structured/index.ts";
import { buildWordDocumentFixture } from "./document-fixture.ts";
import { apply } from "./structured-table-fixtures.ts";

test("inserting first rows and columns preserves original table, row and cell XML ownership", () => {
  const source = openWordArtifact(buildWordDocumentFixture({ documentXml:
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:tbl><w:tblPr><w:tblCaption w:val="Keep caption"/></w:tblPr><w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/></w:tblGrid><w:tr><w:trPr><w:cantSplit/><w:trHeight w:val="800"/></w:trPr><w:tc><w:tcPr><w:noWrap/></w:tcPr><w:p><w:r><w:t>A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>B</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>',
  }));
  const session = openWordOperationDocument(source), doc = session.text.doc!;
  const table = { story: "body", table: tableParagraphs(session.text)[0]!.table!.id };
  try {
    session.commit(session.prepareOperation({ story: "body", range: { start: 0, end: 1 } }, {
      name: "format-table", input: {
        cellId: tableParagraphs(session.text)[0]!.table!.cell,
        patch: { scope: "row", row: { heightTwips: 1200, heightRule: "atLeast" } },
      },
    }));
    session.commit(session.prepare([{ kind: "migrate", table }]));
    const before = importWordContent(source)[0]!;
    if (before.kind !== "table") throw Error("source table");
    apply(doc, { kind: "insert-axis", table, dimension: "column", at: 0 });
    apply(doc, { kind: "insert-axis", table, dimension: "row", at: 0 });
    const projected = projectWordSharedDocument(doc, "body", source)[0]!;
    if (projected.kind !== "table") throw Error("projected table");
    expect(projected.source).toBe(before.source);
    expect(projected.rowSources).toEqual([undefined, before.rowSources![0]]);
    expect(projected.rows[1]![0]!.source).toBeUndefined();
    expect(projected.rows[1]![1]!.source).toBe(before.rows[0]![0]!.source);
    expect(projected.rowFormats?.[1]?.heightTwips).toBe(1200);
    const exported = session.artifact().document.source.source;
    expect(exported).toContain("Keep caption");
    expect(exported).toContain("cantSplit");
    expect(exported.match(/noWrap/g)).toHaveLength(1);
  } finally { session.destroy(); }
});
