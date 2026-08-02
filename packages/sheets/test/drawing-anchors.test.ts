import { describe, expect, test } from "bun:test";
import { SparseAxisGeometry } from "@tumbler/core";
import { openOpcPackage } from "@tumbler/opc";
import { emuToCssPixels, openSpreadsheet, openWorksheet, spreadsheetDrawingBounds } from "../src/index.ts";
import { buildWorkbookFixture } from "./workbook-fixture.ts";

const XDR = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing";
const anchors = `
  <xdr:absoluteAnchor><xdr:pos x="9525" y="19050"/><xdr:ext cx="952500" cy="476250"/><xdr:clientData/></xdr:absoluteAnchor>
  <xdr:oneCellAnchor><xdr:from><xdr:col>1</xdr:col><xdr:colOff>9525</xdr:colOff><xdr:row>2</xdr:row><xdr:rowOff>19050</xdr:rowOff></xdr:from><xdr:ext cx="190500" cy="285750"/><xdr:clientData/></xdr:oneCellAnchor>
  <xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>2</xdr:col><xdr:colOff>9525</xdr:colOff><xdr:row>3</xdr:row><xdr:rowOff>19050</xdr:rowOff></xdr:to><xdr:clientData/></xdr:twoCellAnchor>`;

describe("SpreadsheetDrawingML anchors", () => {
  test("parses absolute, one-cell, and two-cell anchors", () => {
    const worksheet = fixture(anchors);
    expect(worksheet.drawing?.anchors).toEqual([
      { kind: "absolute", elementId: expect.any(Number), xEmu: 9_525, yEmu: 19_050, widthEmu: 952_500, heightEmu: 476_250 },
      { kind: "one-cell", elementId: expect.any(Number), from: { column: 1, row: 2, columnOffsetEmu: 9_525, rowOffsetEmu: 19_050 }, widthEmu: 190_500, heightEmu: 285_750 },
      { kind: "two-cell", elementId: expect.any(Number), from: { column: 0, row: 0, columnOffsetEmu: 0, rowOffsetEmu: 0 }, to: { column: 2, row: 3, columnOffsetEmu: 9_525, rowOffsetEmu: 19_050 }, editAs: "oneCell" },
    ]);
  });

  test("projects anchors through sparse row and column geometry", () => {
    const worksheet = fixture(anchors);
    const rows = new SparseAxisGeometry(20, 20, [{ index: 2, size: 40 }]);
    const columns = new SparseAxisGeometry(20, 50, [{ index: 2, size: 75 }]);
    const parsed = worksheet.drawing!.anchors;
    expect(spreadsheetDrawingBounds(parsed[0]!, rows, columns)).toEqual({ x: 1, y: 2, width: 100, height: 50 });
    expect(spreadsheetDrawingBounds(parsed[1]!, rows, columns)).toEqual({ x: 51, y: 62, width: 20, height: 30 });
    expect(spreadsheetDrawingBounds(parsed[2]!, rows, columns)).toEqual({ x: 0, y: 0, width: 126, height: 82 });
  });

  test("uses the exact 96-DPI EMU conversion", () => {
    expect(emuToCssPixels(914_400)).toBe(96);
    expect(emuToCssPixels(-9_525)).toBe(-1);
  });

  test("rejects incomplete and out-of-grid markers", () => {
    expect(() => fixture('<xdr:oneCellAnchor><xdr:from><xdr:col>16384</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="1" cy="1"/></xdr:oneCellAnchor>')).toThrow("drawing column");
  });

  test("accepts signed ST_Coordinate marker offsets", () => {
    const worksheet = fixture('<xdr:oneCellAnchor><xdr:from><xdr:col>1</xdr:col><xdr:colOff>-9525</xdr:colOff><xdr:row>1</xdr:row><xdr:rowOff>-19050</xdr:rowOff></xdr:from><xdr:ext cx="9525" cy="9525"/></xdr:oneCellAnchor>');
    expect(spreadsheetDrawingBounds(worksheet.drawing!.anchors[0]!, new SparseAxisGeometry(5, 20), new SparseAxisGeometry(5, 50))).toEqual({ x: 49, y: 18, width: 1, height: 1 });
  });
});

function fixture(body: string) {
  const relationships = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const bytes = buildWorkbookFixture({
    sheets: [{ name: "Sheet1", sheetId: 1, relationshipId: "sheet1", xml: `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${relationships}"><sheetData/><drawing r:id="drawing1"/></worksheet>`, relationships: [{ id: "drawing1", type: `${relationships}/drawing`, target: "../drawings/drawing1.xml" }] }],
    parts: [{ itemName: "xl/drawings/drawing1.xml", contentType: "application/vnd.openxmlformats-officedocument.drawing+xml", xml: `<xdr:wsDr xmlns:xdr="${XDR}">${body}</xdr:wsDr>` }],
  });
  const workbook = openSpreadsheet(openOpcPackage(bytes));
  return openWorksheet(workbook, workbook.sheets[0]!);
}
