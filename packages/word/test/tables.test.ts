import { describe, expect, test } from "bun:test";
import { layoutWordDocument, openWordArtifact, resolveWordTableGrid } from "../src/index.ts";
import { buildWordDocumentFixture } from "./document-fixture.ts";

const word = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

describe("WordprocessingML tables", () => {
  test("resolves omitted columns, horizontal spans, and vertical merges without losing source identity", () => {
    const table = openTable(`<w:tbl><w:tblPr><w:tblW w:type="pct" w:w="5000"/><w:jc w:val="center"/><w:tblCellMar><w:left w:type="dxa" w:w="100"/><w:right w:type="dxa" w:w="100"/></w:tblCellMar></w:tblPr><w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="3000"/><w:gridCol w:w="1000"/></w:tblGrid><w:tr><w:trPr><w:gridBefore w:val="1"/><w:tblHeader/></w:trPr><w:tc><w:tcPr><w:gridSpan w:val="2"/><w:vMerge w:val="restart"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:r><w:t>Header</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:trPr><w:gridBefore w:val="1"/></w:trPr><w:tc><w:tcPr><w:gridSpan w:val="2"/><w:vMerge/></w:tcPr><w:p/></w:tc></w:tr></w:tbl>`);
    expect(table.gridColumnWidthsTwips).toEqual([2000, 3000, 1000]);
    expect(table.rows[0]?.gridBefore).toBe(1);
    expect(table.rows[0]?.repeatHeader).toBe(true);
    const grid = resolveWordTableGrid(table);
    expect(grid.columnCount).toBe(3);
    expect(grid.rows[0]?.cells[0]).toMatchObject({ column: 1, columnSpan: 2, rowSpan: 2 });
    expect(grid.rows[0]?.cells[0]?.continuationElementIds).toEqual([table.rows[1]!.cells[0]!.elementId]);
    expect(grid.rows[1]?.cells).toHaveLength(0);
  });

  test("lays out cell paragraphs with resolved geometry and vertical alignment", () => {
    const artifact = open(`<w:tbl><w:tblGrid><w:gridCol w:w="3000"/><w:gridCol w:w="3000"/></w:tblGrid><w:tr><w:trPr><w:trHeight w:val="600" w:hRule="atLeast"/></w:trPr><w:tc><w:tcPr><w:vAlign w:val="bottom"/></w:tcPr><w:p><w:r><w:t>Left</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Right wraps into more text</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`);
    const layout = layoutWordDocument(artifact.document, { measure: (text, format) => ({ width: text.length * format.fontSizePoints, ascent: 8, descent: 2 }) });
    const rendered = layout.pages[0]?.columns[0]?.tables[0];
    expect(rendered?.cells).toHaveLength(2);
    expect(rendered?.height).toBeGreaterThanOrEqual(30);
    expect(rendered?.cells[0]?.lines[0]?.fragments[0]?.text).toBe("Left");
    expect(rendered?.cells[0]?.lines[0]?.y).toBeGreaterThan(rendered?.cells[0]?.y ?? 0);
    expect(layout.pages[0]?.columns[0]?.unsupportedBlocks).toHaveLength(0);
  });

  test("paginates at row boundaries and repeats leading header rows", () => {
    const rows = ["Header", "One", "Two", "Three", "Four"].map((value, index) =>
      `<w:tr><w:trPr>${index === 0 ? "<w:tblHeader/>" : ""}<w:trHeight w:val="500" w:hRule="exact"/></w:trPr><w:tc><w:p><w:r><w:t>${value}</w:t></w:r></w:p></w:tc></w:tr>`
    ).join("");
    const artifact = open(`<w:tbl><w:tblGrid><w:gridCol w:w="4000"/></w:tblGrid>${rows}</w:tbl><w:sectPr><w:pgSz w:w="5000" w:h="1800"/><w:pgMar w:top="100" w:right="100" w:bottom="100" w:left="100"/></w:sectPr>`);
    const layout = layoutWordDocument(artifact.document, { measure: (text) => ({ width: text.length * 5, ascent: 8, descent: 2 }) });
    expect(layout.pages.length).toBeGreaterThan(1);
    for (const page of layout.pages) {
      const table = page.columns[0]?.tables[0];
      expect(table?.cells[0]?.lines[0]?.fragments[0]?.text).toBe("Header");
      expect(table?.y).toBeGreaterThanOrEqual(page.columns[0]!.y);
      expect((table?.y ?? 0) + (table?.height ?? 0)).toBeLessThanOrEqual(page.columns[0]!.y + page.columns[0]!.height);
    }
  });

  test("honours exact row height instead of expanding it to cell content", () => {
    const artifact = open(`<w:tbl><w:tblGrid><w:gridCol w:w="1200"/></w:tblGrid><w:tr><w:trPr><w:trHeight w:val="200" w:hRule="exact"/></w:trPr><w:tc><w:p><w:r><w:t>Several words which wrap</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`);
    const layout = layoutWordDocument(artifact.document, { measure: (text) => ({ width: text.length * 8, ascent: 8, descent: 2 }) });
    expect(layout.pages[0]?.columns[0]?.tables[0]?.height).toBe(10);
  });

  test("rejects vertical merge continuations without matching restart cells", () => {
    expect(() => resolveWordTableGrid(openTable(`<w:tbl><w:tr><w:tc><w:tcPr><w:vMerge/></w:tcPr><w:p/></w:tc></w:tr></w:tbl>`))).toThrow("no matching restart");
  });
});

function open(body: string) {
  return openWordArtifact(buildWordDocumentFixture({ documentXml: `<w:document xmlns:w="${word}"><w:body>${body}</w:body></w:document>` }));
}

function openTable(markup: string) {
  const table = open(markup).document.blocks[0];
  if (table?.kind !== "table") throw new Error("Expected table.");
  return table;
}
