import { describe, expect, test } from "bun:test";
import { openOpcPackage } from "@tumbler/opc";
import { openSpreadsheet, readSpreadsheetSheetProperties, readSpreadsheetStyles } from "../src/index.ts";
import { buildWorkbookFixture } from "./workbook-fixture.ts";

describe("SpreadsheetML worksheet properties", () => {
  test.each(["strict", "transitional"] as const)("reads and resolves %s worksheet tab colors", (conformance) => {
    const namespace = conformance === "strict"
      ? "http://purl.oclc.org/ooxml/spreadsheetml/main"
      : "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
    const workbook = openSpreadsheet(openOpcPackage(buildWorkbookFixture({
      conformance,
      sheets: [
        { name: "RGB", sheetId: 1, relationshipId: "rgb", xml: `<worksheet xmlns="${namespace}"><sheetPr><tabColor rgb="FFFF9900"/></sheetPr><sheetData/></worksheet>` },
        { name: "Theme", sheetId: 2, relationshipId: "themed", xml: `<worksheet xmlns="${namespace}"><sheetPr><tabColor theme="4"/></sheetPr><sheetData/></worksheet>` },
        { name: "None", sheetId: 3, relationshipId: "none", xml: `<worksheet xmlns="${namespace}"><sheetData/></worksheet>` },
      ],
      stylesXml: `<styleSheet xmlns="${namespace}"><fonts count="1"><font/></fonts><fills count="1"><fill/></fills><borders count="1"><border/></borders><cellXfs count="1"><xf/></cellXfs></styleSheet>`,
      themeXml: `<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:themeElements><a:clrScheme name="Office"><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt2><a:srgbClr val="EEECE1"/></a:lt2><a:dk2><a:srgbClr val="1F497D"/></a:dk2><a:accent1><a:srgbClr val="4F81BD"/></a:accent1><a:accent2><a:srgbClr val="C0504D"/></a:accent2><a:accent3><a:srgbClr val="9BBB59"/></a:accent3><a:accent4><a:srgbClr val="8064A2"/></a:accent4><a:accent5><a:srgbClr val="4BACC6"/></a:accent5><a:accent6><a:srgbClr val="F79646"/></a:accent6><a:hlink><a:srgbClr val="0000FF"/></a:hlink><a:folHlink><a:srgbClr val="800080"/></a:folHlink></a:clrScheme><a:fontScheme name="Office"><a:majorFont><a:latin typeface="Aptos Display"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"/></a:themeElements></a:theme>`,
    })));
    const styles = readSpreadsheetStyles(workbook);

    expect(styles.resolveColor(readSpreadsheetSheetProperties(workbook, workbook.sheets[0]!).tabColor)).toBe("FFFF9900");
    expect(styles.resolveColor(readSpreadsheetSheetProperties(workbook, workbook.sheets[1]!).tabColor)).toBe("FF4F81BD");
    expect(readSpreadsheetSheetProperties(workbook, workbook.sheets[2]!).tabColor).toBeUndefined();
    expect(readSpreadsheetSheetProperties(workbook, workbook.sheets[0]!)).toBe(readSpreadsheetSheetProperties(workbook, workbook.sheets[0]!));
  });

  test("rejects repeated worksheet tab colors", () => {
    const namespace = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
    const workbook = openSpreadsheet(openOpcPackage(buildWorkbookFixture({
      sheets: [{ name: "Sheet1", sheetId: 1, relationshipId: "sheet1", xml: `<worksheet xmlns="${namespace}"><sheetPr><tabColor rgb="FFFF0000"/><tabColor rgb="FF00FF00"/></sheetPr><sheetData/></worksheet>` }],
    })));
    expect(() => readSpreadsheetSheetProperties(workbook, workbook.sheets[0]!)).toThrow("must not repeat tabColor");
  });
});
