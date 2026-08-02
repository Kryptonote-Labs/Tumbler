import { describe, expect, test } from "bun:test";
import { openOpcPackage } from "@tumbler/opc";
import { openSpreadsheet, SpreadsheetError, type SpreadsheetErrorCode } from "../src/index.ts";
import { buildWorkbookFixture } from "./workbook-fixture.ts";

describe("SpreadsheetML workbook discovery", () => {
  test.each(["strict", "transitional"] as const)("discovers ordered %s worksheets through relationships", (conformance) => {
    const workbook = openSpreadsheet(openOpcPackage(buildWorkbookFixture({
      conformance,
      workbookItemName: "office/data/book.xml",
      sheets: [
        { name: "January", sheetId: 7, relationshipId: "jan", target: "../tabs/january.xml" },
        { name: "Summary", sheetId: 2, relationshipId: "summary", target: "summary.xml", state: "hidden" },
        { name: "Internal", sheetId: 42, relationshipId: "internal", target: "../tabs/internal.xml", state: "veryHidden" },
      ],
    })));

    expect(workbook.conformance).toBe(conformance);
    expect(workbook.dateSystem).toBe("1900");
    expect(workbook.part.name.value).toBe("/office/data/book.xml");
    expect(workbook.sheets.map(({ name, state, partName }) => [name, state, partName.value])).toEqual([
      ["January", "visible", "/office/tabs/january.xml"],
      ["Summary", "hidden", "/office/data/summary.xml"],
      ["Internal", "veryHidden", "/office/tabs/internal.xml"],
    ]);
    expect(workbook.sheet("SUMMARY")).toBe(workbook.sheets[1]);
    expect(workbook.sheet(42)).toBe(workbook.sheets[2]);
    expect(new TextDecoder().decode(workbook.readSheet(workbook.sheets[0]!))).toContain("worksheet");
  });

  test("does not accept a sheet object from another workbook", () => {
    const first = openSpreadsheet(openOpcPackage(buildWorkbookFixture()));
    const second = openSpreadsheet(openOpcPackage(buildWorkbookFixture()));
    expect(() => first.readSheet(second.sheets[0]!)).toThrow(TypeError);
  });

  test.each([
    ["duplicate_sheet_name", [
      { name: "Data", sheetId: 1, relationshipId: "one" },
      { name: "data", sheetId: 2, relationshipId: "two" },
    ]],
    ["duplicate_sheet_id", [
      { name: "One", sheetId: 1, relationshipId: "one" },
      { name: "Two", sheetId: 1, relationshipId: "two" },
    ]],
    ["invalid_sheet", [{ name: "One", sheetId: -1, relationshipId: "one" }]],
    ["invalid_sheet", [{ name: "One", sheetId: 1, relationshipId: "one", state: "vanished" }]],
  ] as const)("rejects %s metadata", (code, sheets) => {
    expectSpreadsheetError(() => openSpreadsheet(openOpcPackage(buildWorkbookFixture({ sheets }))), code);
  });

  test("rejects external and non-worksheet sheet relationships", () => {
    expectSpreadsheetError(() => openSpreadsheet(openOpcPackage(buildWorkbookFixture({
      sheets: [{ name: "One", sheetId: 1, relationshipId: "one", target: "https://example.com/sheet.xml", targetMode: "External" }],
    }))), "missing_sheet_relationship");
    expectSpreadsheetError(() => openSpreadsheet(openOpcPackage(buildWorkbookFixture({
      sheets: [{ name: "One", sheetId: 1, relationshipId: "one", relationshipType: "urn:not-a-worksheet" }],
    }))), "unsupported_sheet");
  });

  test("requires exactly one sheets collection and a qualified relationship id", () => {
    const namespace = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
    const relationships = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    expectSpreadsheetError(() => openSpreadsheet(openOpcPackage(buildWorkbookFixture({
      workbookXml: `<workbook xmlns="${namespace}"/>`,
    }))), "invalid_workbook");
    expectSpreadsheetError(() => openSpreadsheet(openOpcPackage(buildWorkbookFixture({
      workbookXml: `<workbook xmlns="${namespace}" xmlns:r="${relationships}"><sheets><sheet name="One" sheetId="1" id="sheet1"/></sheets></workbook>`,
    }))), "invalid_sheet");
  });

  test("retains the workbook date system", () => {
    const namespace = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
    const relationships = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    const workbook = openSpreadsheet(openOpcPackage(buildWorkbookFixture({
      workbookXml: `<workbook xmlns="${namespace}" xmlns:r="${relationships}"><workbookPr date1904="true"/><sheets><sheet name="Sheet1" sheetId="1" r:id="sheet1"/></sheets></workbook>`,
    })));
    expect(workbook.dateSystem).toBe("1904");
    expect(() => openSpreadsheet(openOpcPackage(buildWorkbookFixture({
      workbookXml: `<workbook xmlns="${namespace}" xmlns:r="${relationships}"><workbookPr date1904="maybe"/><sheets><sheet name="Sheet1" sheetId="1" r:id="sheet1"/></sheets></workbook>`,
    })))).toThrow(SpreadsheetError);
  });
});

function expectSpreadsheetError(action: () => unknown, code: SpreadsheetErrorCode): void {
  try {
    action();
    throw new Error("Expected SpreadsheetError.");
  } catch (error) {
    expect(error).toBeInstanceOf(SpreadsheetError);
    expect((error as SpreadsheetError).code).toBe(code);
  }
}
