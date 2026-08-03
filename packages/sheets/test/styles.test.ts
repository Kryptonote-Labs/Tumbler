import { describe, expect, test } from "bun:test";
import { openOpcPackage } from "@tumblerjs/opc";
import { openSpreadsheet, readSpreadsheetStyles, SpreadsheetError } from "../src/index.ts";
import { buildWorkbookFixture } from "./workbook-fixture.ts";

describe("SpreadsheetML styles", () => {
  test.each(["strict", "transitional"] as const)("resolves inherited and direct %s cell formats", (conformance) => {
    const namespace = conformance === "strict"
      ? "http://purl.oclc.org/ooxml/spreadsheetml/main"
      : "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
    const styles = readSpreadsheetStyles(openSpreadsheet(openOpcPackage(buildWorkbookFixture({
      conformance,
      stylesXml: styleSheet(namespace),
    }))));

    expect(styles.fonts).toHaveLength(2);
    expect(styles.resolve(0)).toMatchObject({ numberFormatId: 0, font: { name: "Aptos", bold: false } });
    expect(styles.resolve(1)).toEqual({
      font: { name: "Aptos Display", scheme: undefined, size: 14, bold: true, italic: true, underline: "double", strike: false, color: { type: "rgb", argb: "FF12AB34", tint: 0 } },
      fill: { patternType: "solid", foreground: { type: "theme", index: 4, tint: 0.25 }, background: undefined },
      border: {
        left: { style: "thin", color: { type: "indexed", index: 64, tint: 0 } },
        right: { style: undefined, color: undefined },
        top: { style: undefined, color: undefined },
        bottom: { style: "double", color: { type: "automatic", tint: 0 } },
      },
      numberFormatId: 164,
      numberFormatCode: `£#,##0.00`,
      alignment: { horizontal: "center", vertical: "top", wrapText: true, shrinkToFit: false, textRotation: 45, indent: 2, readingOrder: 0 },
    });
    expect(() => styles.resolve(2)).toThrow(SpreadsheetError);
  });

  test("supplies a General default when a workbook has no Styles part", () => {
    const styles = readSpreadsheetStyles(openSpreadsheet(openOpcPackage(buildWorkbookFixture())));
    expect(styles.partName).toBeUndefined();
    expect(styles.resolve(undefined)).toMatchObject({ numberFormatId: 0, numberFormatCode: undefined });
  });

  test("renders cell RGB colors as opaque and resolves theme, indexed, and tinted colors", () => {
    const namespace = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
    const styles = readSpreadsheetStyles(openSpreadsheet(openOpcPackage(buildWorkbookFixture({
      stylesXml: colorStyleSheet(namespace),
      themeXml: officeTheme(),
    }))));

    expect(styles.resolveColor(styles.fonts[1]?.color)).toBe("FFFFFFFF");
    expect(styles.resolveColor(styles.fills[1]?.foreground)).toBe("FF347DB7");
    expect(styles.resolveColor(styles.fonts[2]?.color)).toBe("FFFFFFFF");
    expect(styles.resolveColor(styles.fills[2]?.foreground)).toBe("FF95B3D7");
    expect(styles.resolveColor(styles.fonts[3]?.color)).toBe("FF112233");
    expect(styles.resolveColor({ type: "automatic", tint: 0 })).toBeUndefined();
  });

  test("resolves scheme fonts through the workbook theme with source fallbacks", () => {
    const namespace = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
    const styles = readSpreadsheetStyles(openSpreadsheet(openOpcPackage(buildWorkbookFixture({
      stylesXml: `<styleSheet xmlns="${namespace}"><fonts count="3"><font><name val="Cached Minor"/><scheme val="minor"/></font><font><name val="Cached Major"/><scheme val="major"/></font><font><name val="Literal"/></font></fonts><fills count="1"><fill/></fills><borders count="1"><border/></borders><cellXfs count="3"><xf fontId="0"/><xf fontId="1"/><xf fontId="2"/></cellXfs></styleSheet>`,
      themeXml: officeTheme(),
    }))));

    expect(styles.resolveFontName(styles.resolve(0).font)).toBe("Aptos");
    expect(styles.resolveFontName(styles.resolve(1).font)).toBe("Aptos Display");
    expect(styles.resolveFontName(styles.resolve(2).font)).toBe("Literal");
    expect(styles.resolveFontName(styles.resolve(0).font, "eastAsian")).toBe("Cached Minor");
  });

  test("honours explicit xf apply flags while retaining producer-compatible defaults", () => {
    const namespace = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
    const styles = readSpreadsheetStyles(openSpreadsheet(openOpcPackage(buildWorkbookFixture({
      stylesXml: `<styleSheet xmlns="${namespace}">
        <fonts count="2"><font><name val="Default"/></font><font><name val="Direct"/></font></fonts>
        <fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders>
        <cellStyleXfs count="1"><xf fontId="1" numFmtId="10"><alignment horizontal="center"/></xf></cellStyleXfs>
        <cellXfs count="3">
          <xf xfId="0" fontId="0" numFmtId="0"><alignment horizontal="left"/></xf>
          <xf xfId="0" fontId="0" numFmtId="0" applyFont="0" applyNumberFormat="false" applyAlignment="0"><alignment horizontal="left"/></xf>
          <xf xfId="0" applyFont="1" applyNumberFormat="true" applyAlignment="1"/>
        </cellXfs>
      </styleSheet>`,
    }))));

    expect(styles.resolve(0)).toMatchObject({ font: { name: "Default" }, numberFormatId: 0, alignment: { horizontal: "left" } });
    expect(styles.resolve(1)).toMatchObject({ font: { name: "Direct" }, numberFormatId: 10, alignment: { horizontal: "center" } });
    expect(styles.resolve(2)).toMatchObject({ font: { name: "Default" }, numberFormatId: 0, alignment: { horizontal: undefined } });
  });

  test.each([
    `<styleSheet xmlns="NS"><fonts count="2"><font/></fonts><fills><fill/></fills><borders><border/></borders><cellXfs><xf/></cellXfs></styleSheet>`,
    `<styleSheet xmlns="NS"><fonts><font/></fonts><fills><fill/></fills><borders><border/></borders><cellXfs><xf fontId="2"/></cellXfs></styleSheet>`,
    `<styleSheet xmlns="NS"><fonts><font><color rgb="FF000000" theme="1"/></font></fonts><fills><fill/></fills><borders><border/></borders><cellXfs><xf/></cellXfs></styleSheet>`,
    `<styleSheet xmlns="NS"><fonts><font/></fonts><fills><fill/></fills><borders><border/></borders><cellStyleXfs><xf/></cellStyleXfs><cellXfs><xf xfId="3"/></cellXfs></styleSheet>`,
    `<styleSheet xmlns="NS"><fonts><font/></fonts><fills><fill/></fills><borders><border/></borders><cellXfs><xf><alignment horizontal="sideways"/></xf></cellXfs></styleSheet>`,
    `<styleSheet xmlns="NS"><fonts><font/></fonts><fills><fill/></fills><borders><border/></borders><cellXfs><xf><alignment textRotation="181"/></xf></cellXfs></styleSheet>`,
    `<styleSheet xmlns="NS"><fonts><font/></fonts><fills><fill/></fills><borders><border/></borders><cellXfs><xf><alignment readingOrder="3"/></xf></cellXfs></styleSheet>`,
  ])("rejects malformed style tables", (template) => {
    const namespace = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
    const workbook = openSpreadsheet(openOpcPackage(buildWorkbookFixture({ stylesXml: template.replace("NS", namespace) })));
    expect(() => readSpreadsheetStyles(workbook)).toThrow(SpreadsheetError);
  });
});

function styleSheet(namespace: string): string {
  return `<styleSheet xmlns="${namespace}">
    <numFmts count="1"><numFmt numFmtId="164" formatCode="£#,##0.00"/></numFmts>
    <fonts count="2">
      <font><name val="Aptos"/><sz val="11"/></font>
      <font><name val="Aptos Display"/><sz val="14"/><b/><i val="1"/><u val="double"/><color rgb="12AB34"/></font>
    </fonts>
    <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor theme="4" tint="0.25"/></patternFill></fill></fills>
    <borders count="2"><border><left/><right/><top/><bottom/></border><border><left style="thin"><color indexed="64"/></left><right/><top/><bottom style="double"><color auto="1"/></bottom></border></borders>
    <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
    <cellXfs count="2"><xf xfId="0"/><xf xfId="0" numFmtId="164" fontId="1" fillId="1" borderId="1"><alignment horizontal="center" vertical="top" wrapText="1" textRotation="45" indent="2"/></xf></cellXfs>
  </styleSheet>`;
}

function colorStyleSheet(namespace: string): string {
  return `<styleSheet xmlns="${namespace}">
    <fonts count="4">
      <font/>
      <font><color rgb="00FFFFFF"/></font>
      <font><color theme="0"/></font>
      <font><color indexed="0"/></font>
    </fonts>
    <fills count="3">
      <fill><patternFill patternType="none"/></fill>
      <fill><patternFill patternType="solid"><fgColor rgb="00347DB7"/></patternFill></fill>
      <fill><patternFill patternType="solid"><fgColor theme="4" tint="0.4"/></patternFill></fill>
    </fills>
    <borders count="1"><border/></borders>
    <cellXfs count="1"><xf fontId="0" fillId="0" borderId="0"/></cellXfs>
    <colors><indexedColors><rgbColor rgb="00112233"/></indexedColors></colors>
  </styleSheet>`;
}

function officeTheme(): string {
  return `<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:themeElements><a:clrScheme name="Office">
    <a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
    <a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
    <a:lt2><a:srgbClr val="EEECE1"/></a:lt2><a:dk2><a:srgbClr val="1F497D"/></a:dk2>
    <a:accent1><a:srgbClr val="4F81BD"/></a:accent1><a:accent2><a:srgbClr val="C0504D"/></a:accent2>
    <a:accent3><a:srgbClr val="9BBB59"/></a:accent3><a:accent4><a:srgbClr val="8064A2"/></a:accent4>
    <a:accent5><a:srgbClr val="4BACC6"/></a:accent5><a:accent6><a:srgbClr val="F79646"/></a:accent6>
    <a:hlink><a:srgbClr val="0000FF"/></a:hlink><a:folHlink><a:srgbClr val="800080"/></a:folHlink>
  </a:clrScheme><a:fontScheme name="Office"><a:majorFont><a:latin typeface="Aptos Display"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"/></a:themeElements></a:theme>`;
}
