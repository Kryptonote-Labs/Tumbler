import { describe, expect, test } from "bun:test";
import {
  applySpreadsheetCommand,
  createSpreadsheet,
  createSpreadsheetNativeArchive,
  openSpreadsheetArtifact,
  openSpreadsheetNativeArchive,
  type SpreadsheetArtifact,
  type SpreadsheetCommand,
} from "../src/index.ts";
import { buildWorkbookFixture } from "./workbook-fixture.ts";

const namespace = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const run = (artifact: SpreadsheetArtifact, ...commands: SpreadsheetCommand[]) => commands.reduce(applySpreadsheetCommand, artifact);
const reopen = (artifact: SpreadsheetArtifact) => openSpreadsheetArtifact(artifact.bytes());
const stylesXml = (artifact: SpreadsheetArtifact) =>
  new TextDecoder().decode(artifact.workbook.package.readPart(artifact.workbook.package.getPart(artifact.worksheet.styles.partName!)!));

describe("spreadsheet cell formatting", () => {
  test("writes strike, theme colours, fills, wrap, rotation and indent that survive export and native archives", () => {
    const formatted = run(themed(), {
      name: "format-cells", sheetId: "1", range: "A1:B2", patch: {
        text: { strike: { set: true }, color: { set: { type: "theme", slot: "accent1", tint: -0.25 } } },
        cell: {
          fill: { set: { type: "solid", color: { type: "theme", slot: "accent2", tint: 0.6 } } },
          wrapText: { set: true },
          textRotation: { set: -45 },
          indent: { set: 2 },
        },
      },
    });
    const expected = {
      text: {
        strike: { state: "value", value: true },
        color: { state: "value", value: { type: "theme", slot: "accent1", tint: -0.25, value: "#376092" } },
      },
      cell: {
        fill: { state: "value", value: { type: "solid", color: { type: "theme", slot: "accent2", tint: 0.6 } } },
        wrapText: { state: "value", value: true },
        textRotation: { state: "value", value: -45 },
        indent: { state: "value", value: 2 },
      },
      block: { horizontalAlignment: { state: "value", value: "start" } },
    };
    const native = openSpreadsheetNativeArchive(createSpreadsheetNativeArchive(formatted));
    for (const artifact of [formatted, reopen(formatted), native]) {
      expect(artifact.formattingState("A1:B2")).toMatchObject(expected);
      expect(artifact.worksheet.cellStyle("B2").alignment.textRotation).toBe(135);
      expect(artifact.worksheet.cellStyle("A1").font.color).toEqual({ type: "theme", index: 4, tint: -0.25 });
    }
    expect(stylesXml(formatted)).toContain('uri="keep-styles"');
    expect(formatted.worksheet.cell("A1")?.value).toMatchObject({ type: "number", value: 5 });
  });

  test("reports vertical text, no fill and mixed selections", () => {
    const formatted = run(createSpreadsheet(),
      { name: "format-cells", sheetId: "1", range: "A1", patch: { cell: { textRotation: { set: "vertical" }, fill: { set: { type: "solid", color: { type: "rgb", value: "#ffcc00" } } } } } },
      { name: "format-cells", sheetId: "1", range: "B1", patch: { cell: { fill: { set: { type: "none" } } } } },
    );
    expect(formatted.worksheet.cellStyle("A1").alignment.textRotation).toBe(255);
    expect(formatted.formattingState("A1").cell?.textRotation).toEqual({ state: "value", value: "vertical" });
    expect(formatted.formattingState("B1").cell?.fill).toEqual({ state: "value", value: { type: "none" } });
    expect(formatted.formattingState("A1:B1").cell).toMatchObject({ fill: { state: "mixed" }, textRotation: { state: "mixed" } });
    const cleared = run(formatted, { name: "format-cells", sheetId: "1", range: "A1", patch: { cell: { fill: { inherit: true } } } });
    expect(cleared.formattingState("A1:B1").cell?.fill).toEqual({ state: "value", value: { type: "none" } });
  });

  test("reserves Excel's none and gray125 fills before the first added fill", () => {
    const formatted = run(createSpreadsheet(), { name: "format-cells", sheetId: "1", range: "C3", patch: { cell: { fill: { set: { type: "solid", color: { type: "rgb", value: "#112233" } } } } } });
    const xml = stylesXml(formatted);
    expect(xml).toMatch(/<fills count="3"><fill><patternFill patternType="none"\/><\/fill><fill><patternFill patternType="gray125"\/><\/fill><fill><patternFill patternType="solid"><fgColor rgb="FF112233"\/>/);
    expect(xml).toContain('fillId="2"');
    expect(xml).toContain('applyFill="1"');
    expect(reopen(formatted).worksheet.cellStyle("C3").fill.foreground).toEqual({ type: "rgb", argb: "FF112233", tint: 0 });
  });
});

describe("spreadsheet borders", () => {
  test("applies range-aware presets and preserves edges they do not name", () => {
    let artifact = run(createSpreadsheet(), { name: "set-borders", sheetId: "1", range: "B2:D4", preset: "left", style: "thick", color: { type: "theme", slot: "accent1" } });
    artifact = run(artifact, { name: "set-borders", sheetId: "1", range: "B2:D4", preset: "outside", style: "dashed" });
    const edges = (reference: string) => {
      const border = artifact.worksheet.cellStyle(reference).border;
      return [border.top.style, border.right.style, border.bottom.style, border.left.style];
    };
    expect(edges("B2")).toEqual(["dashed", undefined, undefined, "dashed"]);
    expect(edges("C3")).toEqual([undefined, undefined, undefined, undefined]);
    expect(edges("D4")).toEqual([undefined, "dashed", "dashed", undefined]);
    artifact = run(artifact, { name: "set-borders", sheetId: "1", range: "B2:D4", preset: "inside", style: "thin" });
    expect(edges("C3")).toEqual(["thin", "thin", "thin", "thin"]);
    expect(edges("B2")).toEqual(["dashed", "thin", "thin", "dashed"]);
    artifact = run(artifact, { name: "set-borders", sheetId: "1", range: "C2:C4", preset: "none" });
    expect(edges("C3")).toEqual([undefined, undefined, undefined, undefined]);
    expect(edges("B3")).toEqual(["thin", "thin", "thin", "dashed"]);
    const reopened = reopen(artifact);
    expect(reopened.worksheet.cellStyle("B4").border.bottom).toEqual({ style: "dashed", color: { type: "automatic", tint: 0 } });
  });

  test("treats merged cells as one logical cell", () => {
    const merged = run(createSpreadsheet(), { name: "merge-cells", sheetId: "1", range: "B2:C3" });
    const inside = run(merged, { name: "set-borders", sheetId: "1", range: "B2:C3", preset: "inside" });
    expect(Object.values(inside.worksheet.cellStyle("B2").border).map((edge) => edge.style)).toEqual([undefined, undefined, undefined, undefined]);

    // Selecting part of a merge extends to the whole merged cell, as in Excel.
    const outside = run(merged, { name: "set-borders", sheetId: "1", range: "B2:D3", preset: "outside", style: "medium" });
    const border = (reference: string) => outside.worksheet.cellStyle(reference).border;
    expect(border("B2")).toMatchObject({ top: { style: "medium" }, left: { style: "medium" }, bottom: { style: "medium" }, right: { style: undefined } });
    expect(border("C3")).toMatchObject({ bottom: { style: "medium" }, right: { style: undefined }, top: { style: undefined } });
    expect(border("D3")).toMatchObject({ right: { style: "medium" }, bottom: { style: "medium" } });

    const all = run(merged, { name: "set-borders", sheetId: "1", range: "B2:C3", preset: "all" });
    expect(Object.values(all.worksheet.cellStyle("B2").border).map((edge) => edge.style)).toEqual(["thin", "thin", "thin", "thin"]);
    expect(all.worksheet.cellStyle("C3").border).toMatchObject({ top: { style: undefined }, left: { style: undefined }, right: { style: "thin" } });
  });

  test("borders whole columns and the whole sheet without materializing the grid", () => {
    const column = run(createSpreadsheet(), { name: "set-borders", sheetId: "1", range: "B1:B1048576", preset: "outside" });
    expect(column.worksheet.cellStyle("B1").border).toMatchObject({ top: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } });
    expect(column.worksheet.cellStyle("B500000").border).toMatchObject({ top: { style: undefined }, left: { style: "thin" }, right: { style: "thin" } });
    expect(column.worksheet.cellStyle("B1048576").border.bottom.style).toBe("thin");
    expect(column.worksheet.cellStyle("C2").border.left.style).toBeUndefined();
    expect(column.worksheet.rows.flatMap((row) => row.cells).length).toBeLessThan(10);

    const sheet = run(createSpreadsheet(), { name: "set-borders", sheetId: "1", range: "A1:XFD1048576", preset: "all", style: "hair" });
    expect(sheet.worksheet.cellStyle("XFD1048576").border.right.style).toBe("hair");
    expect(sheet.worksheet.rows.flatMap((row) => row.cells)).toHaveLength(0);
  });
});

describe("spreadsheet number formats", () => {
  test("sets presets and explicit codes, appending custom numFmt records", () => {
    let artifact = run(themed(),
      { name: "set-number-format", sheetId: "1", range: "A1", format: "long-date" },
      { name: "set-number-format", sheetId: "1", range: "B1", format: { code: '0.0" kg"' } },
      { name: "set-number-format", sheetId: "1", range: "C1", format: "accounting" },
    );
    artifact = reopen(artifact);
    const styles = artifact.worksheet.styles;
    expect(styles.numberFormats.get(164)).toBe("0.000");
    expect([...styles.numberFormats.values()]).toContain("dddd, mmmm d, yyyy");
    expect(artifact.worksheet.cellStyle("B1").numberFormatId).toBeGreaterThan(164);
    expect(artifact.worksheet.cellStyle("C1").numberFormatId).toBe(44);
    expect(artifact.numberFormatState("A1")).toEqual({ state: "value", value: { code: "dddd, mmmm d, yyyy", preset: "long-date", category: "date", decimals: undefined } });
    expect(artifact.numberFormatState("B1")).toMatchObject({ state: "value", value: { category: "number", decimals: 1, preset: undefined } });
    expect(artifact.numberFormatState("A1:B1")).toEqual({ state: "mixed" });
    expect(artifact.calculation.displayText("B1")).toBe("5.0 kg");
    expect(artifact.worksheet.cellStyle("A1").font.name).toBe("Aptos");
  });

  test("adjusts decimals from each cell's current format", () => {
    const decimals = (artifact: SpreadsheetArtifact, reference: string) => artifact.numberFormatState(reference);
    let artifact = run(createSpreadsheet(),
      { name: "set-range", sheetId: "1", reference: "A1", values: [[1.5, 0.125, -2, 3]] },
      { name: "set-number-format", sheetId: "1", range: "A1", format: "currency" },
      { name: "set-number-format", sheetId: "1", range: "B1", format: "percent" },
      { name: "set-number-format", sheetId: "1", range: "C1", format: "accounting" },
    );
    artifact = run(artifact, { name: "adjust-number-decimals", sheetId: "1", range: "A1:D1", direction: "increase" });
    expect(decimals(artifact, "A1")).toMatchObject({ value: { code: '"$"#,##0.000_);("$"#,##0.000)', category: "currency", decimals: 3 } });
    expect(decimals(artifact, "B1")).toMatchObject({ value: { code: "0.000%", decimals: 3 } });
    expect(decimals(artifact, "C1")).toMatchObject({ value: { code: '_("$"* #,##0.000_);_("$"* \\(#,##0.000\\);_("$"* "-"???_);_(@_)', category: "accounting" } });
    expect(decimals(artifact, "D1")).toMatchObject({ value: { code: "0.0" } });
    expect(artifact.calculation.displayText("A1")).toBe("$1.500");

    artifact = run(artifact,
      { name: "set-number-format", sheetId: "1", range: "B1", format: { code: '0.0%;[Red]-0.0%' } },
      { name: "adjust-number-decimals", sheetId: "1", range: "B1", direction: "decrease" },
    );
    expect(decimals(artifact, "B1")).toMatchObject({ value: { code: "0%;[Red]-0%", decimals: 0 } });
    expect(run(artifact, { name: "adjust-number-decimals", sheetId: "1", range: "B1", direction: "decrease" }).numberFormatState("B1")).toMatchObject({ value: { code: "0%;[Red]-0%" } });
  });

  test("leaves text and dates alone and rejects codes without a numeric section", () => {
    const artifact = run(createSpreadsheet(),
      { name: "set-number-format", sheetId: "1", range: "A1", format: "text" },
      { name: "set-number-format", sheetId: "1", range: "B1", format: "short-date" },
      { name: "set-number-format", sheetId: "1", range: "C1", format: { code: '"yes";"yes";"no"' } },
    );
    expect(run(artifact, { name: "adjust-number-decimals", sheetId: "1", range: "A1:B1", direction: "increase" })).toBe(artifact);
    expect(() => run(artifact, { name: "adjust-number-decimals", sheetId: "1", range: "C1", direction: "increase" })).toThrow("Cannot change decimal places");
  });

  test("keeps sparse whole-column number formats through other formatting", () => {
    let artifact = run(createSpreadsheet(), { name: "set-number-format", sheetId: "1", range: "A1:A1048576", format: "percent" });
    artifact = run(artifact,
      { name: "format-cells", sheetId: "1", range: "A1:A1048576", patch: { text: { bold: { set: true } } } },
      { name: "adjust-number-decimals", sheetId: "1", range: "A1:A1048576", direction: "increase" },
    );
    expect(artifact.worksheet.cellStyle("A900000")).toMatchObject({ numberFormatCode: "0.000%", font: { bold: true } });
    expect(artifact.worksheet.rows).toHaveLength(0);
    expect(artifact.numberFormatState("A1:A1048576")).toMatchObject({ state: "value", value: { code: "0.000%" } });
  });
});

describe("clear formatting", () => {
  test("resets every style component to Normal while keeping values, formulas and unknown style XML", () => {
    let artifact = run(themed(),
      { name: "set-formula", sheetId: "1", reference: "B1", formula: "A1*2" },
      { name: "set-borders", sheetId: "1", range: "A1:B1", preset: "all" },
      { name: "format-cells", sheetId: "1", range: "A1:B1", patch: { text: { italic: { set: true } }, cell: { wrapText: { set: true } } } },
    );
    artifact = run(artifact, { name: "clear-formatting", sheetId: "1", range: "A1:B1" });
    for (const reference of ["A1", "B1"]) expect(artifact.worksheet.effectiveStyleIndex(reference)).toBe(0);
    expect(artifact.worksheet.cell("A1")?.value).toMatchObject({ type: "number", value: 5 });
    expect(artifact.worksheet.cell("B1")?.formula).toBe("A1*2");
    expect(artifact.calculation.displayText("B1")).toBe("10");
    expect(stylesXml(artifact)).toContain('uri="keep-styles"');
  });

  test("clears whole columns sparsely", () => {
    const formatted = run(createSpreadsheet(), { name: "format-cells", sheetId: "1", range: "A1:B1048576", patch: { text: { bold: { set: true } } } });
    const cleared = run(formatted, { name: "clear-formatting", sheetId: "1", range: "B1:B1048576" });
    expect(cleared.worksheet.cellStyle("A1000").font.bold).toBeTrue();
    expect(cleared.worksheet.cellStyle("B1000").font.bold).toBeFalse();
    expect(cleared.worksheet.rows).toHaveLength(0);
  });
});

function themed(): SpreadsheetArtifact {
  return openSpreadsheetArtifact(buildWorkbookFixture({
    themeXml: `<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:themeElements><a:clrScheme name="Office">
      <a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
      <a:lt2><a:srgbClr val="EEECE1"/></a:lt2><a:dk2><a:srgbClr val="1F497D"/></a:dk2>
      <a:accent1><a:srgbClr val="4F81BD"/></a:accent1><a:accent2><a:srgbClr val="C0504D"/></a:accent2>
      <a:accent3><a:srgbClr val="9BBB59"/></a:accent3><a:accent4><a:srgbClr val="8064A2"/></a:accent4>
      <a:accent5><a:srgbClr val="4BACC6"/></a:accent5><a:accent6><a:srgbClr val="F79646"/></a:accent6>
      <a:hlink><a:srgbClr val="0000FF"/></a:hlink><a:folHlink><a:srgbClr val="800080"/></a:folHlink>
    </a:clrScheme><a:fontScheme name="Office"><a:majorFont><a:latin typeface="Aptos Display"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"/></a:themeElements></a:theme>`,
    stylesXml: `<styleSheet xmlns="${namespace}">
      <numFmts count="1"><numFmt numFmtId="164" formatCode="0.000"/></numFmts>
      <fonts count="1"><font><sz val="11"/><name val="Aptos"/></font></fonts>
      <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
      <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
      <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellXfs>
      <extLst><ext uri="keep-styles"/></extLst>
    </styleSheet>`,
    sheets: [{
      name: "Data",
      sheetId: 1,
      relationshipId: "data",
      xml: `<worksheet xmlns="${namespace}"><sheetData><row r="1"><c r="A1"><v>5</v></c><c r="B1"><v>5</v></c></row></sheetData></worksheet>`,
    }],
  }));
}
