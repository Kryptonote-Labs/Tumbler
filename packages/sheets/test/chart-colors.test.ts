import { describe, expect, test } from "bun:test";
import { openOpcPackage } from "@tumblerjs/opc";
import { openSpreadsheet, openWorksheet, resolveSpreadsheetChartColor } from "../src/index.ts";
import { buildWorkbookFixture } from "./workbook-fixture.ts";

describe("spreadsheet chart theme colors", () => {
  test("resolves explicit and scheme colors without losing their source identity", () => {
    const namespace = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
    const workbook = openSpreadsheet(openOpcPackage(buildWorkbookFixture({
      stylesXml: `<styleSheet xmlns="${namespace}"><fonts count="1"><font/></fonts><fills count="1"><fill/></fills><borders count="1"><border/></borders><cellXfs count="1"><xf/></cellXfs></styleSheet>`,
      themeXml: theme(),
    })));
    const styles = openWorksheet(workbook, workbook.sheets[0]!).styles;
    expect(resolveSpreadsheetChartColor(styles, { kind: "rgb", value: "#102030" })).toBe("#102030");
    expect(resolveSpreadsheetChartColor(styles, { kind: "scheme", value: "accent1" })).toBe("#4472C4");
    expect(resolveSpreadsheetChartColor(styles, { kind: "scheme", value: "tx1" })).toBe("#000000");
    expect(resolveSpreadsheetChartColor(styles, { kind: "scheme", value: "phClr" })).toBeUndefined();
  });
});

function theme() {
  const a = "http://schemas.openxmlformats.org/drawingml/2006/main";
  return `<a:theme xmlns:a="${a}"><a:themeElements><a:clrScheme name="Office"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F497D"/></a:dk2><a:lt2><a:srgbClr val="EEECE1"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="Office"><a:majorFont><a:latin typeface="Aptos Display"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"/></a:themeElements></a:theme>`;
}
