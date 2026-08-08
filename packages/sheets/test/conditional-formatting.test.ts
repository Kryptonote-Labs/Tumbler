import { describe, expect, test } from "bun:test";
import {
  openSpreadsheetArtifact,
  projectSpreadsheetConditionalStyles,
  SpreadsheetError,
} from "../src/index.ts";
import { buildWorkbookFixture } from "./workbook-fixture.ts";

describe("SpreadsheetML conditional formatting", () => {
  test.each(["strict", "transitional"] as const)("parses and evaluates %s cell-is rules over multiple sparse ranges", (conformance) => {
    const namespace = spreadsheetNamespace(conformance);
    const artifact = openSpreadsheetArtifact(buildWorkbookFixture({
      conformance,
      stylesXml: styles(namespace, 2),
      sheets: [{ name: "Data", sheetId: 1, relationshipId: "data", xml: worksheet(namespace, `
        <sheetData>
          <row r="1"><c r="A1"><v>5</v></c><c r="C1"><v>6</v></c></row>
          <row r="3"><c r="A3"><v>2</v></c></row>
        </sheetData>
        <conditionalFormatting sqref="A1:A3 C1">
          <cfRule type="cellIs" dxfId="0" priority="1" operator="between"><formula>4</formula><formula>6</formula></cfRule>
          <cfRule type="cellIs" dxfId="1" priority="2" operator="lessThan"><formula>4</formula></cfRule>
        </conditionalFormatting>
      `) }],
    }));
    const projection = projectSpreadsheetConditionalStyles(artifact.worksheet, artifact.calculation);

    expect(artifact.worksheet.conditionalFormatting[0]?.ranges).toEqual([
      { start: { row: 1, column: 1 }, end: { row: 3, column: 1 } },
      { start: { row: 1, column: 3 }, end: { row: 1, column: 3 } },
    ]);
    expect(projection.formats("A1")).toEqual([artifact.worksheet.styles.differentialFormats[0]!]);
    expect(projection.formats("A2")).toEqual([artifact.worksheet.styles.differentialFormats[1]!]);
    expect(projection.formats("A3")).toEqual([artifact.worksheet.styles.differentialFormats[1]!]);
    expect(projection.formats("C1")).toEqual([artifact.worksheet.styles.differentialFormats[0]!]);
    expect(projection.formats("B1")).toEqual([]);
    expect(projection.diagnostics).toEqual([]);
  });

  test("applies priority globally and stops lower-priority rules only after a match", () => {
    const artifact = fixture(`
      <sheetData><row r="1"><c r="A1"><v>8</v></c></row><row r="2"><c r="A2"><v>3</v></c></row></sheetData>
      <conditionalFormatting sqref="A1:A2">
        <cfRule type="cellIs" dxfId="2" priority="3" operator="greaterThan"><formula>0</formula></cfRule>
        <cfRule type="cellIs" dxfId="0" priority="1" stopIfTrue="1" operator="greaterThan"><formula>5</formula></cfRule>
        <cfRule type="cellIs" dxfId="1" priority="2" operator="greaterThan"><formula>0</formula></cfRule>
      </conditionalFormatting>
    `, 3);
    const projection = projectSpreadsheetConditionalStyles(artifact.worksheet);

    expect(projection.formats("A1")).toEqual([artifact.worksheet.styles.differentialFormats[0]!]);
    expect(projection.formats("A2")).toEqual([
      artifact.worksheet.styles.differentialFormats[2]!,
      artifact.worksheet.styles.differentialFormats[1]!,
    ]);
  });

  test.each([
    ["equal", "5", true],
    ["notEqual", "5", false],
    ["greaterThan", "4", true],
    ["greaterThanOrEqual", "5", true],
    ["lessThan", "5", false],
    ["lessThanOrEqual", "5", true],
    ["between", "4</formula><formula>6", true],
    ["notBetween", "4</formula><formula>6", false],
  ] as const)("evaluates the %s cell-is operator", (operator, formulas, expected) => {
    const artifact = fixture(`<sheetData><row r="1"><c r="A1"><v>5</v></c></row></sheetData>
      <conditionalFormatting sqref="A1"><cfRule type="cellIs" dxfId="0" priority="1" operator="${operator}"><formula>${formulas}</formula></cfRule></conditionalFormatting>`);
    expect(projectSpreadsheetConditionalStyles(artifact.worksheet).formats("A1").length > 0).toBe(expected);
  });

  test("shifts relative expression references from the first sqref cell while retaining absolute axes", () => {
    const artifact = fixture(`
      <sheetData>
        <row r="1"><c r="A1"><v>10</v></c><c r="C1"><v>-1</v></c></row>
        <row r="2"><c r="A2"><v>-1</v></c><c r="B2"><v>1</v></c><c r="C2"><v>10</v></c><c r="D2"><v>1</v></c></row>
      </sheetData>
      <conditionalFormatting sqref="B1:B2 D1:D2">
        <cfRule type="expression" dxfId="0" priority="1"><formula>A1&gt;0</formula></cfRule>
        <cfRule type="expression" dxfId="1" priority="2"><formula>$A1&gt;0</formula></cfRule>
      </conditionalFormatting>
    `, 2);
    const projection = projectSpreadsheetConditionalStyles(artifact.worksheet);

    expect(projection.formats("B1")).toEqual([
      artifact.worksheet.styles.differentialFormats[1]!,
      artifact.worksheet.styles.differentialFormats[0]!,
    ]);
    expect(projection.formats("B2")).toEqual([]);
    expect(projection.formats("D1")).toEqual([artifact.worksheet.styles.differentialFormats[1]!]);
    expect(projection.formats("D2")).toEqual([artifact.worksheet.styles.differentialFormats[0]!]);
  });

  test("uses calculated formula values and refreshes after an edit", () => {
    const artifact = fixture(`
      <sheetData><row r="1"><c r="A1"><v>2</v></c><c r="B1"><f>A1*2</f><v>0</v></c></row></sheetData>
      <conditionalFormatting sqref="B1"><cfRule type="expression" dxfId="0" priority="1"><formula>B1&gt;5</formula></cfRule></conditionalFormatting>
    `);
    expect(projectSpreadsheetConditionalStyles(artifact.worksheet).formats("B1")).toEqual([]);
    expect(projectSpreadsheetConditionalStyles(artifact.worksheet, artifact.calculation).formats("B1")).toEqual([]);

    const edited = artifact.editCell("A1", 4);
    expect(projectSpreadsheetConditionalStyles(edited.worksheet, edited.calculation).formats("B1")).toEqual([
      edited.worksheet.styles.differentialFormats[0]!,
    ]);
  });

  test("keeps unsupported rules and formulas inert with explicit diagnostics", () => {
    const artifact = fixture(`
      <sheetData><row r="1"><c r="A1"><v>5</v></c></row></sheetData>
      <conditionalFormatting sqref="A1">
        <cfRule type="colorScale" dxfId="0" priority="1"><colorScale/></cfRule>
        <cfRule type="expression" dxfId="0" priority="2"><formula>XLOOKUP(A1,A1:A2,A1:A2)&gt;0</formula></cfRule>
        <cfRule type="cellIs" dxfId="0" priority="3" operator="containsText"><formula>5</formula></cfRule>
      </conditionalFormatting>
    `);
    expect(artifact.worksheet.conditionalFormatting[0]?.rules.map((rule) => rule.kind)).toEqual([
      "unsupported", "expression", "unsupported",
    ]);
    const projection = projectSpreadsheetConditionalStyles(artifact.worksheet);
    expect(projection.formats("A1")).toEqual([]);
    expect(projection.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "unsupported-rule", "unsupported-formula", "unsupported-rule",
    ]);
  });

  test("queries a whole-grid range sparsely and preserves the source package on a no-op", () => {
    const bytes = buildFixtureBytes(`<sheetData><row r="1048576"><c r="XFD1048576"><v>0</v></c></row></sheetData><conditionalFormatting sqref="A1:XFD1048576"><cfRule type="cellIs" dxfId="0" priority="1" operator="equal"><formula>0</formula></cfRule></conditionalFormatting>`);
    const artifact = openSpreadsheetArtifact(bytes);
    const projection = projectSpreadsheetConditionalStyles(artifact.worksheet);
    expect(projection.formats("XFD1048576")).toHaveLength(1);
    expect(artifact.bytes()).toEqual(bytes);
  });

  test.each([
    `<sheetData/><conditionalFormatting><cfRule type="cellIs" priority="1" operator="equal"><formula>1</formula></cfRule></conditionalFormatting>`,
    `<sheetData/><conditionalFormatting sqref="A0"><cfRule type="cellIs" priority="1" operator="equal"><formula>1</formula></cfRule></conditionalFormatting>`,
    `<sheetData/><conditionalFormatting sqref="A1"/>`,
    `<sheetData/><conditionalFormatting sqref="A1"><cfRule type="cellIs" priority="0" operator="equal"><formula>1</formula></cfRule></conditionalFormatting>`,
    `<sheetData/><conditionalFormatting sqref="A1"><cfRule type="cellIs" priority="1" stopIfTrue="yes" operator="equal"><formula>1</formula></cfRule></conditionalFormatting>`,
    `<sheetData/><conditionalFormatting sqref="A1"><cfRule type="cellIs" priority="1" dxfId="9" operator="equal"><formula>1</formula></cfRule></conditionalFormatting>`,
  ])("rejects malformed conditional-format structures", (body) => {
    expect(() => openSpreadsheetArtifact(buildFixtureBytes(body))).toThrow(SpreadsheetError);
  });
});

function fixture(body: string, differentialFormats = 1) {
  return openSpreadsheetArtifact(buildFixtureBytes(body, differentialFormats));
}

function buildFixtureBytes(body: string, differentialFormats = 1): Uint8Array {
  const namespace = spreadsheetNamespace("transitional");
  return buildWorkbookFixture({
    stylesXml: styles(namespace, differentialFormats),
    sheets: [{ name: "Data", sheetId: 1, relationshipId: "data", xml: worksheet(namespace, body) }],
  });
}

function spreadsheetNamespace(conformance: "strict" | "transitional"): string {
  return conformance === "strict"
    ? "http://purl.oclc.org/ooxml/spreadsheetml/main"
    : "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
}

function worksheet(namespace: string, body: string): string {
  return `<worksheet xmlns="${namespace}">${body}</worksheet>`;
}

function styles(namespace: string, differentialFormats: number): string {
  return `<styleSheet xmlns="${namespace}">
    <fonts count="1"><font/></fonts><fills count="1"><fill/></fills><borders count="1"><border/></borders><cellXfs count="1"><xf/></cellXfs>
    <dxfs count="${differentialFormats}">${Array.from({ length: differentialFormats }, (_, index) =>
      `<dxf><font><b/><color rgb="FF${String(index + 1).padStart(6, "0")}"/></font></dxf>`
    ).join("")}</dxfs>
  </styleSheet>`;
}
