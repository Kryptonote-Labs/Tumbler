import { describe, expect, test } from "bun:test";
import { openOpcPackage } from "@tumblerjs/opc";
import { openSpreadsheet, openWorksheet, SpreadsheetError } from "../src/index.ts";
import { buildWorkbookFixture } from "./workbook-fixture.ts";

const DRAWING_TYPE = "application/vnd.openxmlformats-officedocument.drawing+xml";
const profiles = [
  {
    conformance: "strict" as const,
    spreadsheet: "http://purl.oclc.org/ooxml/spreadsheetml/main",
    relationships: "http://purl.oclc.org/ooxml/officeDocument/relationships",
    drawing: "http://purl.oclc.org/ooxml/drawingml/spreadsheetDrawing",
  },
  {
    conformance: "transitional" as const,
    spreadsheet: "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    relationships: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    drawing: "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing",
  },
];

describe("SpreadsheetML Drawing discovery", () => {
  for (const profile of profiles) {
    test(`discovers a ${profile.conformance} worksheet Drawing part`, () => {
      const worksheet = openFixture(profile, `<xdr:wsDr xmlns:xdr="${profile.drawing}"/>`);
      expect(worksheet.drawing).toMatchObject({ relationshipId: "drawing1" });
      expect(worksheet.drawing?.partName.value).toBe("/xl/drawings/drawing1.xml");
      expect(worksheet.drawing?.document.root.localName).toBe("wsDr");
    });
  }

  test("leaves worksheets without a drawing relationship untouched", () => {
    const workbook = openSpreadsheet(openOpcPackage(buildWorkbookFixture()));
    expect(openWorksheet(workbook, workbook.sheets[0]!).drawing).toBeUndefined();
  });

  test("rejects a Drawing part with the wrong root vocabulary", () => {
    expect(() => openFixture(profiles[1]!, '<wsDr xmlns="urn:not-drawing"/>')).toThrow(SpreadsheetError);
  });
});

function openFixture(profile: typeof profiles[number], drawingXml: string) {
  const bytes = buildWorkbookFixture({
    conformance: profile.conformance,
    sheets: [{
      name: "Sheet1",
      sheetId: 1,
      relationshipId: "sheet1",
      xml: `<worksheet xmlns="${profile.spreadsheet}" xmlns:r="${profile.relationships}"><sheetData/><drawing r:id="drawing1"/></worksheet>`,
      relationships: [{ id: "drawing1", type: `${profile.relationships}/drawing`, target: "../drawings/drawing1.xml" }],
    }],
    parts: [{ itemName: "xl/drawings/drawing1.xml", contentType: DRAWING_TYPE, xml: drawingXml }],
  });
  const workbook = openSpreadsheet(openOpcPackage(bytes));
  return openWorksheet(workbook, workbook.sheets[0]!);
}
