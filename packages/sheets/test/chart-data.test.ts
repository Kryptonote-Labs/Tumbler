import { describe, expect, test } from "bun:test";
import type { SupportedChartModel } from "@tumbler/charts";
import { openOpcPackage } from "@tumbler/opc";
import { beginSpreadsheetEdit, openSpreadsheet, openWorksheet, parseSpreadsheetChartReference, resolveSpreadsheetChartData } from "../src/index.ts";
import { buildWorkbookFixture } from "./workbook-fixture.ts";

describe("Spreadsheet chart data binding", () => {
  test("parses quoted, escaped, absolute, and current-sheet chart formulas", () => {
    expect(parseSpreadsheetChartReference("'Alex''s Plan'!$A$2:$B$3", "Current")).toEqual({ sheet: "Alex's Plan", range: { start: { row: 2, column: 1 }, end: { row: 3, column: 2 } } });
    expect(parseSpreadsheetChartReference("=$C$4", "Current")).toEqual({ sheet: "Current", range: { start: { row: 4, column: 3 }, end: { row: 4, column: 3 } } });
    expect(parseSpreadsheetChartReference("[External.xlsx]Sheet1!A1", "Current")).toBeUndefined();
    expect(parseSpreadsheetChartReference("NamedRange", "Current")).toBeUndefined();
  });

  test("replaces caches with calculated internal workbook cells", () => {
    const workbook = fixture();
    const worksheet = openWorksheet(workbook, workbook.sheet("Dashboard")!);
    const resolved = resolveSpreadsheetChartData(worksheet, model());
    if (resolved.status !== "supported") throw new Error("Expected supported chart");
    expect(resolved.series[0]?.title).toBe("Live values");
    expect(resolved.series[0]?.categories?.points.map((point) => point.value)).toEqual(["One", "Two", "Three"]);
    expect(resolved.series[0]?.values?.points.map((point) => point.value)).toEqual([2, 3, 5]);
  });

  test("refreshes chart values after a worksheet edit without changing chart XML", () => {
    const workbook = fixture();
    const edited = beginSpreadsheetEdit(workbook).setCellValue(workbook.sheet("Data")!, "B3", 11).commit();
    const reopened = openSpreadsheet(openOpcPackage(edited));
    const resolved = resolveSpreadsheetChartData(openWorksheet(reopened, reopened.sheet("Dashboard")!), model());
    if (resolved.status !== "supported") throw new Error("Expected supported chart");
    expect(resolved.series[0]?.values?.points.map((point) => point.value)).toEqual([2, 11, 13]);
  });

  test("retains producer caches when a reference is unsupported", () => {
    const workbook = fixture();
    const cached = model("NamedRange");
    const resolved = resolveSpreadsheetChartData(openWorksheet(workbook, workbook.sheet("Dashboard")!), cached);
    if (resolved.status !== "supported") throw new Error("Expected supported chart");
    expect(resolved.series[0]?.values).toBe(cached.series[0]?.values);
    expect(resolved.series[0]?.values?.points).toEqual([{ index: 0, value: 999 }]);
  });
});

function fixture() {
  const spreadsheet = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  return openSpreadsheet(openOpcPackage(buildWorkbookFixture({ sheets: [
    { name: "Dashboard", sheetId: 1, relationshipId: "dashboard" },
    { name: "Data", sheetId: 2, relationshipId: "data", xml: `<worksheet xmlns="${spreadsheet}"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Live values</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>One</t></is></c><c r="B2"><v>2</v></c></row><row r="3"><c r="A3" t="inlineStr"><is><t>Two</t></is></c><c r="B3"><v>3</v></c></row><row r="4"><c r="A4" t="inlineStr"><is><t>Three</t></is></c><c r="B4"><f>SUM(B2:B3)</f><v>99</v></c></row></sheetData></worksheet>` },
  ] })));
}

function model(formula = "Data!$B$2:$B$4"): SupportedChartModel {
  return Object.freeze({
    status: "supported", kind: "column", grouping: "clustered", holeSize: undefined, title: "Chart", legend: undefined, axes: Object.freeze([]),
    series: Object.freeze([{ index: 0, order: 0, title: "Cached", titleFormula: "Data!$A$1", fill: undefined, line: undefined,
      categories: Object.freeze({ kind: "string", formula: "Data!$A$2:$A$4", formatCode: undefined, points: Object.freeze([{ index: 0, value: "Old" }]) }),
      values: Object.freeze({ kind: "number", formula, formatCode: "0", points: Object.freeze([{ index: 0, value: 999 }]) }),
    }]),
  });
}
