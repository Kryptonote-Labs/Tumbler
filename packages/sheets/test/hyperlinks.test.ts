import { describe, expect, test } from "bun:test";
import { openOpcPackage } from "@tumbler/opc";
import {
  openSpreadsheet,
  openWorksheet,
  parseSpreadsheetHyperlinkLocation,
  SpreadsheetError,
} from "../src/index.ts";
import { buildWorkbookFixture } from "./workbook-fixture.ts";

const profiles = [
  {
    conformance: "strict" as const,
    spreadsheet: "http://purl.oclc.org/ooxml/spreadsheetml/main",
    relationships: "http://purl.oclc.org/ooxml/officeDocument/relationships",
  },
  {
    conformance: "transitional" as const,
    spreadsheet: "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    relationships: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
  },
];

describe("SpreadsheetML hyperlinks", () => {
  for (const profile of profiles) {
    test(`reads internal and external ${profile.conformance} hyperlinks`, () => {
      const workbook = openSpreadsheet(openOpcPackage(buildWorkbookFixture({
        conformance: profile.conformance,
        sheets: [
          {
            name: "Read Me",
            sheetId: 1,
            relationshipId: "read-me",
            xml: `<worksheet xmlns="${profile.spreadsheet}" xmlns:r="${profile.relationships}"><sheetData/><hyperlinks><hyperlink ref="A3" location="'Project Plan'!$B$4" display="Plan" tooltip="Open the plan"/><hyperlink ref="B3:C3" r:id="website"/></hyperlinks></worksheet>`,
            relationships: [{ id: "website", type: `${profile.relationships}/hyperlink`, target: "https://example.test/docs?q=1", targetMode: "External" }],
          },
          { name: "Project Plan", sheetId: 2, relationshipId: "plan" },
        ],
      })));
      const worksheet = openWorksheet(workbook, workbook.sheet("Read Me")!);

      expect(worksheet.hyperlinks).toEqual([
        {
          kind: "internal",
          range: { start: { row: 3, column: 1 }, end: { row: 3, column: 1 } },
          display: "Plan",
          tooltip: "Open the plan",
          location: "'Project Plan'!$B$4",
          destination: { sheet: "Project Plan", range: { start: { row: 4, column: 2 }, end: { row: 4, column: 2 } } },
        },
        {
          kind: "external",
          range: { start: { row: 3, column: 2 }, end: { row: 3, column: 3 } },
          display: undefined,
          tooltip: undefined,
          relationshipId: "website",
          target: "https://example.test/docs?q=1",
          location: undefined,
        },
      ]);
      expect(worksheet.hyperlink("C3")).toBe(worksheet.hyperlinks[1]);
    });
  }

  test("resolves current-sheet, quoted, escaped, and absolute locations", () => {
    expect(parseSpreadsheetHyperlinkLocation("$C$7", "Current")).toEqual({
      sheet: "Current",
      range: { start: { row: 7, column: 3 }, end: { row: 7, column: 3 } },
    });
    expect(parseSpreadsheetHyperlinkLocation("#'Alex''s Plan'!$A$1:$B$2", "Current")).toEqual({
      sheet: "Alex's Plan",
      range: { start: { row: 1, column: 1 }, end: { row: 2, column: 2 } },
    });
    expect(parseSpreadsheetHyperlinkLocation("NamedRange", "Current")).toBeUndefined();
  });

  test("rejects missing and non-hyperlink relationships", () => {
    const bytes = buildWorkbookFixture({
      sheets: [{
        name: "Sheet1",
        sheetId: 1,
        relationshipId: "sheet1",
        xml: `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetData/><hyperlinks><hyperlink ref="A1" r:id="bad"/></hyperlinks></worksheet>`,
        relationships: [{ id: "bad", type: "https://example.test/not-a-hyperlink", target: "https://example.test", targetMode: "External" }],
      }],
    });
    const workbook = openSpreadsheet(openOpcPackage(bytes));
    expect(() => openWorksheet(workbook, workbook.sheets[0]!)).toThrow(SpreadsheetError);
  });
});
