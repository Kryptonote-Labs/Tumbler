import { describe, expect, test } from "bun:test";
import { layoutWordDocument, openWordArtifact, wordLineAtPoint } from "../src/index.ts";
import { buildWordDocumentFixture } from "./document-fixture.ts";

const word = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const paragraph = (text = "") => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
const cell = (content = paragraph(), properties = "") => `<w:tc><w:tcPr>${properties}</w:tcPr>${content}</w:tc>`;
const row = (cells: string, properties = "") => `<w:tr><w:trPr>${properties}</w:trPr>${cells}</w:tr>`;
const table = (rows: string, columns = 3) => `<w:tbl><w:tblGrid>${'<w:gridCol w:w="2400"/>'.repeat(columns)}</w:tblGrid>${rows}</w:tbl>`;

function layout(body: string, height = 16000) {
  const artifact = openWordArtifact(buildWordDocumentFixture({
    documentXml: `<w:document xmlns:w="${word}"><w:body>${body}<w:sectPr><w:pgSz w:w="10000" w:h="${height}"/><w:pgMar w:top="200" w:right="200" w:bottom="200" w:left="200"/></w:sectPr></w:body></w:document>`,
  }));
  return layoutWordDocument(artifact.document, {
    measure: text => ({ width: text.length * 5, ascent: 8, descent: 2 }),
  });
}

describe("Word pointer hit testing", () => {
  test("keeps clicks throughout empty cells within their borders", () => {
    const page = layout(table(row(cell().repeat(3)).repeat(3))).pages[0]!;
    const cells = page.columns[0]!.tables[0]!.cells;
    expect(cells).toHaveLength(9);
    for (const cell of cells) {
      for (const x of [cell.x + 0.1, cell.x + cell.width * 0.49, cell.x + cell.width * 0.75, cell.x + cell.width - 0.1]) {
        for (const y of [cell.y + 0.1, cell.y + cell.height / 2, cell.y + cell.height - 0.1]) {
          expect(wordLineAtPoint(page, x, y)).toBe(cell.lines[0]);
        }
      }
    }
    const right = cells[1]!;
    expect(wordLineAtPoint(page, right.x, right.y)).toBe(right.lines[0]);
    const below = cells[3]!;
    expect(wordLineAtPoint(page, below.x, below.y)).toBe(below.lines[0]);
  });

  test("resolves multiline content and vertical padding before neighbouring text", () => {
    const page = layout(table(row(
      cell(paragraph("First") + paragraph("Second"), '<w:vAlign w:val="bottom"/>') + cell(paragraph("Neighbour")),
      '<w:trHeight w:val="1800" w:hRule="atLeast"/>',
    ), 2)).pages[0]!;
    const left = page.columns[0]!.tables[0]!.cells[0]!;
    expect(left.lines).toHaveLength(2);
    const x = left.x + left.width - 0.1;
    expect(wordLineAtPoint(page, x, left.y + 0.1)).toBe(left.lines[0]);
    for (const line of left.lines) {
      expect(wordLineAtPoint(page, x, line.y + line.height / 2)).toBe(line);
    }
    expect(wordLineAtPoint(page, x, left.y + left.height - 0.1)).toBe(left.lines[1]);
  });

  test("uses the innermost cell while preserving outer cell paragraphs", () => {
    const nested = table(row(cell() + cell()), 2);
    const page = layout(table(row(cell(paragraph("Outer") + nested + paragraph()) + cell()), 2)).pages[0]!;
    const outer = page.columns[0]!.tables[0]!.cells[0]!;
    const inner = outer.tables[0]!;
    for (const cell of inner.cells) {
      expect(wordLineAtPoint(page, cell.x + cell.width - 0.1, cell.y + cell.height / 2)).toBe(cell.lines[0]);
    }
    const line = outer.lines[0]!;
    expect(wordLineAtPoint(page, outer.x + outer.width - 0.1, line.y + line.height / 2)).toBe(line);
  });

  test("uses the full bounds of horizontally and vertically merged cells", () => {
    const page = layout(table(
      row(cell(paragraph(), '<w:gridSpan w:val="2"/><w:vMerge w:val="restart"/>') + cell()) +
      row(cell(paragraph(), '<w:gridSpan w:val="2"/><w:vMerge/>') + cell()),
    )).pages[0]!;
    const cells = page.columns[0]!.tables[0]!.cells;
    const merged = cells[0]!;
    expect(merged).toMatchObject({ columnSpan: 2, rowSpan: 2 });
    expect(wordLineAtPoint(page, merged.x + merged.width - 0.1, merged.y + merged.height - 0.1)).toBe(merged.lines[0]);
    const neighbour = cells.at(-1)!;
    expect(wordLineAtPoint(page, neighbour.x + 0.1, neighbour.y + 0.1)).toBe(neighbour.lines[0]);
  });

  test("resolves repeated table headers within the requested page", () => {
    const rows = row(cell(paragraph("Header")), '<w:tblHeader/><w:trHeight w:val="500" w:hRule="exact"/>') +
      Array.from({ length: 8 }, (_, index) => row(cell(paragraph(String(index))), '<w:trHeight w:val="500" w:hRule="exact"/>')).join("");
    const pages = layout(table(rows, 1), 1800).pages;
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) {
      const header = page.columns[0]!.tables[0]!.cells[0]!;
      expect(wordLineAtPoint(page, header.x + header.width - 0.1, header.y + header.height / 2)).toBe(header.lines[0]);
    }
  });

  test("keeps nearest-line behaviour outside tables and handles pages without body lines", () => {
    const page = layout(paragraph("Before") + table(row(cell())) + paragraph("After")).pages[0]!;
    for (const line of page.columns[0]!.lines) {
      expect(wordLineAtPoint(page, page.width + 100, line.y + line.height / 2)).toBe(line);
    }
    expect(wordLineAtPoint({ ...page, columns: [] }, 0, 0)).toBeUndefined();
  });
});
