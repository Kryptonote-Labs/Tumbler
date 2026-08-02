import { describe, expect, test } from "bun:test";
import { openOpcPackage } from "@tumbler/opc";
import { beginSpreadsheetEdit, openSpreadsheet, openWorksheet } from "../src/index.ts";
import { buildWorkbookFixture } from "./workbook-fixture.ts";

const profiles = [
  { conformance: "strict" as const, spreadsheet: "http://purl.oclc.org/ooxml/spreadsheetml/main", relationships: "http://purl.oclc.org/ooxml/officeDocument/relationships", xdr: "http://purl.oclc.org/ooxml/drawingml/spreadsheetDrawing", chart: "http://purl.oclc.org/ooxml/drawingml/chart", drawing: "http://purl.oclc.org/ooxml/drawingml/main" },
  { conformance: "transitional" as const, spreadsheet: "http://schemas.openxmlformats.org/spreadsheetml/2006/main", relationships: "http://schemas.openxmlformats.org/officeDocument/2006/relationships", xdr: "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing", chart: "http://schemas.openxmlformats.org/drawingml/2006/chart", drawing: "http://schemas.openxmlformats.org/drawingml/2006/main" },
];

describe("Spreadsheet Drawing chart frames", () => {
  for (const profile of profiles) {
    test(`resolves a ${profile.conformance} chart through Drawing relationships`, () => {
      const worksheet = fixture(profile, chartXml(profile));
      expect(worksheet.drawing?.charts).toHaveLength(1);
      expect(worksheet.drawing?.charts[0]).toMatchObject({
        relationshipId: "chart1",
        partName: { value: "/xl/charts/chart1.xml" },
        anchor: { kind: "two-cell" },
        model: { status: "supported", kind: "column", series: [{ values: { points: [{ index: 0, value: 8 }] } }] },
      });
    });
  }

  test("keeps a bounded unsupported frame for malformed chart XML", () => {
    const frame = fixture(profiles[1]!, '<bad xmlns="urn:bad"/>').drawing?.charts[0];
    expect(frame?.model).toMatchObject({ status: "unsupported", reason: expect.stringContaining("chartSpace") });
    expect(frame?.anchor.kind).toBe("two-cell");
  });

  test("never dereferences an external Chart relationship", () => {
    const frame = fixture(profiles[1]!, chartXml(profiles[1]!), true).drawing?.charts[0];
    expect(frame?.model).toMatchObject({ status: "unsupported", reason: expect.stringContaining("internal Chart part") });
    expect(frame?.partName).toBeUndefined();
  });

  test("preserves Chart and Drawing part bytes across an unrelated cell edit", () => {
    const worksheet = fixture(profiles[1]!, chartXml(profiles[1]!));
    const drawingBefore = worksheet.workbook.package.readPart(worksheet.drawing!.part);
    const chartPart = worksheet.workbook.package.getPart(worksheet.drawing!.charts[0]!.partName!)!;
    const chartBefore = worksheet.workbook.package.readPart(chartPart);
    const saved = beginSpreadsheetEdit(worksheet.workbook).setCellValue(worksheet.sheet, "A1", "changed").commit();
    const reopened = openSpreadsheet(openOpcPackage(saved));
    const after = openWorksheet(reopened, reopened.sheets[0]!);
    expect(after.workbook.package.readPart(after.drawing!.part)).toEqual(drawingBefore);
    expect(after.workbook.package.readPart(after.workbook.package.getPart(after.drawing!.charts[0]!.partName!)!)).toEqual(chartBefore);
  });
});

function fixture(profile: typeof profiles[number], chart: string, external = false) {
  const drawing = `<xdr:wsDr xmlns:xdr="${profile.xdr}" xmlns:a="${profile.drawing}" xmlns:c="${profile.chart}" xmlns:r="${profile.relationships}"><xdr:twoCellAnchor><xdr:from><xdr:col>1</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>1</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>6</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>12</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame><a:graphic><a:graphicData uri="${profile.chart}"><c:chart r:id="chart1"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>`;
  const bytes = buildWorkbookFixture({
    conformance: profile.conformance,
    sheets: [{ name: "Sheet1", sheetId: 1, relationshipId: "sheet1", xml: `<worksheet xmlns="${profile.spreadsheet}" xmlns:r="${profile.relationships}"><sheetData/><drawing r:id="drawing1"/></worksheet>`, relationships: [{ id: "drawing1", type: `${profile.relationships}/drawing`, target: "../drawings/drawing1.xml" }] }],
    parts: [
      { itemName: "xl/drawings/drawing1.xml", contentType: "application/vnd.openxmlformats-officedocument.drawing+xml", xml: drawing },
      { itemName: "xl/drawings/_rels/drawing1.xml.rels", xml: `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="chart1" Type="${profile.relationships}/chart" Target="${external ? "https://example.test/chart.xml" : "../charts/chart1.xml"}"${external ? ' TargetMode="External"' : ""}/></Relationships>` },
      { itemName: "xl/charts/chart1.xml", contentType: "application/vnd.openxmlformats-officedocument.drawingml.chart+xml", xml: chart },
    ],
  });
  const workbook = openSpreadsheet(openOpcPackage(bytes));
  return openWorksheet(workbook, workbook.sheets[0]!);
}

function chartXml(profile: typeof profiles[number]) {
  return `<c:chartSpace xmlns:c="${profile.chart}"><c:chart><c:plotArea><c:barChart><c:barDir val="col"/><c:ser><c:idx val="0"/><c:order val="0"/><c:val><c:numLit><c:pt idx="0"><c:v>8</c:v></c:pt></c:numLit></c:val></c:ser></c:barChart></c:plotArea></c:chart></c:chartSpace>`;
}
