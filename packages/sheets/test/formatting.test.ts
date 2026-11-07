import { describe, expect, test } from "bun:test";
import { openOpcPackage } from "@tumblerjs/opc";
import {
  formatSpreadsheetCells,
  MAX_FORMATTED_CELLS,
  openSpreadsheet,
  openWorksheet,
  spreadsheetFormattingState,
} from "../src/index.ts";
import { buildWorkbookFixture } from "./workbook-fixture.ts";

const namespace = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

describe("SpreadsheetML formatting", () => {
  test("applies combined formatting to values and blank cells and reopens it", () => {
    const source = fixture();
    const before = openOpcPackage(source);
    const workbook = openSpreadsheet(before);
    const sheet = workbook.sheets[0]!;
    const saved = formatSpreadsheetCells(workbook, sheet, "A1:B2", {
      text: {
        fontSize: { set: 18 },
        bold: { set: true },
        italic: { set: true },
        underline: { set: "single" },
        color: { set: { type: "rgb", value: "#c62828" } },
      },
      block: {
        horizontalAlignment: { set: "center" },
        verticalAlignment: { set: "bottom" },
      },
    });
    const reopenedPackage = openOpcPackage(saved);
    const reopened = openSpreadsheet(reopenedPackage);
    const worksheet = openWorksheet(reopened, reopened.sheets[0]!);

    for (const reference of ["A1", "B1"]) {
      expect(worksheet.cellStyle(reference)).toMatchObject({
        font: {
          name: "Aptos",
          size: 18,
          bold: true,
          italic: true,
          underline: "single",
          color: { type: "rgb", argb: "FFC62828" },
        },
        alignment: { horizontal: "center", vertical: "bottom" },
        numberFormatId: 4,
        fill: { patternType: "solid" },
        border: { left: { style: "thin" } },
      });
    }
    for (const reference of ["A2", "B2"]) {
      expect(worksheet.cellStyle(reference)).toMatchObject({
        font: { size: 18, bold: true, italic: true, underline: "single", color: { type: "rgb", argb: "FFC62828" } },
        alignment: { horizontal: "center", vertical: "bottom" },
        numberFormatId: 0,
        fill: { patternType: "none" },
      });
    }
    expect(worksheet.cell("A1")?.value).toMatchObject({ type: "number", value: 12 });
    expect(worksheet.cell("B2")?.value).toEqual({ type: "blank" });
    expect(worksheet.dimension).toEqual({ start: { row: 1, column: 1 }, end: { row: 2, column: 2 } });
    expect(worksheet.document.source).toContain('<extLst><ext uri="keep-sheet"/></extLst>');
    const stylesPart = reopenedPackage.getPart(worksheet.styles.partName!);
    expect(stylesPart).toBeDefined();
    expect(new TextDecoder().decode(reopenedPackage.readPart(stylesPart!))).toContain('uri="keep-styles"');
    expect(reopenedPackage.archive.compressedBytes(reopenedPackage.archive.get("xl/workbook.xml")!))
      .toEqual(before.archive.compressedBytes(before.archive.get("xl/workbook.xml")!));
  });

  test("does not mutate a shared source style or duplicate equivalent styles", () => {
    const workbook = openSpreadsheet(openOpcPackage(fixture()));
    const sheet = workbook.sheets[0]!;
    const once = formatSpreadsheetCells(workbook, sheet, "A1", { text: { bold: { set: true } } });
    const reopenedOnce = openSpreadsheet(openOpcPackage(once));
    const worksheetOnce = openWorksheet(reopenedOnce, reopenedOnce.sheets[0]!);
    expect(worksheetOnce.cellStyle("A1").font.bold).toBeTrue();
    expect(worksheetOnce.cellStyle("B1").font.bold).toBeFalse();
    const count = worksheetOnce.styles.cellFormats.length;

    const twice = formatSpreadsheetCells(reopenedOnce, reopenedOnce.sheets[0]!, "B1", { text: { bold: { set: true } } });
    const reopenedTwice = openSpreadsheet(openOpcPackage(twice));
    const worksheetTwice = openWorksheet(reopenedTwice, reopenedTwice.sheets[0]!);
    expect(worksheetTwice.cell("A1")?.styleIndex).toBe(worksheetTwice.cell("B1")?.styleIndex);
    expect(worksheetTwice.styles.cellFormats).toHaveLength(count);
  });

  test("supports explicit false and inheritance without erasing unrelated formatting", () => {
    const workbook = openSpreadsheet(openOpcPackage(fixture()));
    const sheet = workbook.sheets[0]!;
    const bold = openSpreadsheet(openOpcPackage(formatSpreadsheetCells(workbook, sheet, "A1", {
      text: { bold: { set: true }, italic: { set: true } },
    })));
    const cleared = openSpreadsheet(openOpcPackage(formatSpreadsheetCells(bold, bold.sheets[0]!, "A1", {
      text: { bold: { set: false }, italic: { inherit: true } },
    })));
    const style = openWorksheet(cleared, cleared.sheets[0]!).cellStyle("A1");
    expect(style.font).toMatchObject({ bold: false, italic: false });
    expect(style.numberFormatId).toBe(4);
    expect(style.fill.patternType).toBe("solid");
    expect(style.border.left.style).toBe("thin");
  });

  test("reports uniform and mixed selection state", () => {
    const workbook = openSpreadsheet(openOpcPackage(fixture()));
    const sheet = workbook.sheets[0]!;
    const formatted = openSpreadsheet(openOpcPackage(formatSpreadsheetCells(workbook, sheet, "A1", {
      text: { bold: { set: true }, color: { set: { type: "rgb", value: "#123456" } } },
      block: { horizontalAlignment: { set: "end" } },
    })));
    const worksheet = openWorksheet(formatted, formatted.sheets[0]!);
    expect(spreadsheetFormattingState(worksheet, "A1")).toMatchObject({
      text: { bold: { state: "value", value: true }, color: { state: "value", value: { type: "rgb", value: "#123456" } } },
      block: { horizontalAlignment: { state: "value", value: "end" } },
    });
    expect(spreadsheetFormattingState(worksheet, "A1:B1").text.bold).toEqual({ state: "mixed" });
  });

  test("reads a merged range through its logical top-left cell", () => {
    const workbook = openSpreadsheet(openOpcPackage(buildWorkbookFixture({
      stylesXml: `<styleSheet xmlns="${namespace}">
        <fonts count="2"><font><name val="Aptos"/><sz val="11"/></font><font><name val="Aptos Display"/><sz val="24"/><b/></font></fonts>
        <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
        <borders count="1"><border/></borders>
        <cellXfs count="2"><xf fontId="0" fillId="0" borderId="0" numFmtId="0"/><xf fontId="1" fillId="0" borderId="0" numFmtId="0"/></cellXfs>
      </styleSheet>`,
      sheets: [{
        name: "Dashboard",
        sheetId: 1,
        relationshipId: "dashboard",
        xml: `<worksheet xmlns="${namespace}"><dimension ref="A1:C2"/><sheetData><row r="1"><c r="A1" s="1" t="inlineStr"><is><t>Metric</t></is></c></row></sheetData><mergeCells count="1"><mergeCell ref="A1:B2"/></mergeCells></worksheet>`,
      }],
    })));
    const worksheet = openWorksheet(workbook, workbook.sheets[0]!);

    for (const target of ["B2", "A1:B2"]) {
      expect(spreadsheetFormattingState(worksheet, target).text).toMatchObject({
        fontFamily: { state: "value", value: "Aptos Display" },
        fontSize: { state: "value", value: 24 },
        bold: { state: "value", value: true },
      });
    }
    expect(spreadsheetFormattingState(worksheet, "A1:C2").text.fontSize).toEqual({ state: "mixed" });
  });

  test.each(["strict", "transitional"] as const)("adds a valid Styles part to a style-less %s workbook", (conformance) => {
    const workbook = openSpreadsheet(openOpcPackage(buildWorkbookFixture({
      conformance,
      sheets: [{ name: "Data", sheetId: 1, relationshipId: "data", xml: `<worksheet xmlns="${conformance === "strict" ? "http://purl.oclc.org/ooxml/spreadsheetml/main" : namespace}"><sheetData/></worksheet>` }],
    })));
    const saved = formatSpreadsheetCells(workbook, workbook.sheets[0]!, "C3", { text: { bold: { set: true } } });
    const reopened = openSpreadsheet(openOpcPackage(saved));
    const worksheet = openWorksheet(reopened, reopened.sheets[0]!);
    expect(worksheet.cellStyle("C3").font.bold).toBeTrue();
    expect(worksheet.styles.partName).toBeDefined();
  });

  test("bounds client-side formatting work", () => {
    const workbook = openSpreadsheet(openOpcPackage(fixture()));
    expect(() => formatSpreadsheetCells(workbook, workbook.sheets[0]!, `A1:A${MAX_FORMATTED_CELLS + 1}`, {
      text: { bold: { set: true } },
    })).toThrow(RangeError);
  });
});

function fixture(): Uint8Array {
  return buildWorkbookFixture({
    stylesXml: `<styleSheet xmlns="${namespace}">
      <fonts count="1"><font><name val="Aptos"/><sz val="11"/></font></fonts>
      <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFFF00"/></patternFill></fill></fills>
      <borders count="2"><border/><border><left style="thin"/></border></borders>
      <cellXfs count="2"><xf fontId="0" fillId="0" borderId="0" numFmtId="0"/><xf fontId="0" fillId="1" borderId="1" numFmtId="4"><alignment horizontal="left"/></xf></cellXfs>
      <extLst><ext uri="keep-styles"/></extLst>
    </styleSheet>`,
    sheets: [{
      name: "Data",
      sheetId: 1,
      relationshipId: "data",
      xml: `<worksheet xmlns="${namespace}"><dimension ref="A1:B1"/><sheetData><row r="1"><c r="A1" s="1"><v>12</v></c><c r="B1" s="1"><v>24</v></c></row></sheetData><extLst><ext uri="keep-sheet"/></extLst></worksheet>`,
    }],
  });
}

test('spreadsheet font validation keeps its own Excel range',()=>{
 const workbook=openSpreadsheet(openOpcPackage(fixture())),sheet=workbook.sheets[0]!;
 expect(()=>formatSpreadsheetCells(workbook,sheet,'A1',{text:{fontSize:{set:800}}})).toThrow('409');
});

test('whole columns format sparsely and keep explicit cell styles through native edits', async () => {
  const {createSpreadsheet, applySpreadsheetCommand} = await import('../src/commands.ts');
  let artifact = applySpreadsheetCommand(createSpreadsheet(),{name:'set-cell',sheetId:'1',reference:'A1',value:12.5});
  artifact = artifact.formatCells('A1:A1048576',{text:{bold:{set:true}}});
  expect(artifact.worksheet.cellStyle('A1048576').font.bold).toBeTrue();
  expect(artifact.worksheet.rows).toHaveLength(1);
  expect(artifact.worksheet.columns).toHaveLength(1);
  expect(artifact.formattingState('A1:A1048576').text.bold).toEqual({state:'value',value:true});
  const reopened = openSpreadsheet(openOpcPackage(artifact.bytes()));
  expect(openWorksheet(reopened,reopened.sheets[0]!).cellStyle('A1048576').font.bold).toBeTrue();
});

test('number formatting preserves cell contents and recalculates display text', async () => {
  const {createSpreadsheet, applySpreadsheetCommand} = await import('../src/commands.ts');
  const {formatSpreadsheetNumbersPackage} = await import('../src/formatting.ts');
  const {SpreadsheetArtifact} = await import('../src/artifact.ts');
  const original = applySpreadsheetCommand(createSpreadsheet(),{name:'set-cell',sheetId:'1',reference:'A1',value:0.125}).formatCells('A1',{text:{bold:{set:true}}});
  const workbook = openSpreadsheet(formatSpreadsheetNumbersPackage(original.workbook,original.activeSheet,'A1:A1048576','percent'));
  const artifact = new SpreadsheetArtifact(workbook,workbook.sheets[0]!);
  expect(artifact.calculation.displayText('A1')).toBe('12.50%');
  expect(artifact.worksheet.cellStyle('A1').font.bold).toBeTrue();
  expect(artifact.worksheet.cellStyle('A1000000').numberFormatId).toBe(10);
  expect(artifact.worksheet.cell('A1')?.value).toMatchObject({value:0.125});
});

test('almost-sheet formatting uses column defaults and preserves the excluded final row', async () => {
  const {createSpreadsheet} = await import('../src/commands.ts');
  const artifact=createSpreadsheet().formatCells('A1:XFD1048575',{text:{bold:{set:true}}});
  expect(artifact.worksheet.cellStyle('A1000000').font.bold).toBeTrue();
  expect(artifact.worksheet.cellStyle('XFD1048575').font.bold).toBeTrue();
  expect(artifact.worksheet.cellStyle('A1048576').font.bold).toBeFalse();
  expect(artifact.worksheet.rows).toHaveLength(1);
});

test('whole row formatting uses sparse row defaults and preserves column styles', async () => {
  const {createSpreadsheet} = await import('../src/commands.ts');
  let original=createSpreadsheet().formatCells('B1:B1048576',{text:{italic:{set:true}}});
  original=original.formatCells('C2',{text:{underline:{set:'double'}}});
  const artifact=original.formatCells('A2:XFD4',{text:{bold:{set:true}}});
  expect(artifact.worksheet.cellStyle('A2').font.bold).toBeTrue();
  expect(artifact.worksheet.cellStyle('B3').font.italic).toBeTrue();
  expect(artifact.worksheet.cellStyle('B3').font.bold).toBeTrue();
  expect(artifact.worksheet.cellStyle('C2').font.underline).toBe('double');
  expect(artifact.worksheet.cellStyle('XFD4').font.bold).toBeTrue();
  expect(artifact.worksheet.cellStyle('A5').font.bold).toBeFalse();
  expect(artifact.worksheet.rows.flatMap(row=>row.cells).length).toBeLessThan(10);
});

test('wide rectangles preserve excluded columns using sparse row defaults', async () => {
  const {createSpreadsheet} = await import('../src/commands.ts');
  const artifact=createSpreadsheet().formatCells('B2:XFC100',{text:{bold:{set:true}}});
  expect(artifact.worksheet.cellStyle('B2').font.bold).toBeTrue();
  expect(artifact.worksheet.cellStyle('XFC100').font.bold).toBeTrue();
  expect(artifact.worksheet.cellStyle('A2').font.bold).toBeFalse();
  expect(artifact.worksheet.cellStyle('XFD100').font.bold).toBeFalse();
  expect(artifact.worksheet.cellStyle('B1').font.bold).toBeFalse();
  expect(artifact.worksheet.rows.flatMap(r=>r.cells).length).toBe(198);
});

test('whole rows inherit the predominant column format without materializing cells', async () => {
  const {createSpreadsheet} = await import('../src/commands.ts');
  const original=createSpreadsheet().formatCells('A1:XFD1048576',{text:{italic:{set:true}}});
  const artifact=original.formatCells('A1:XFD2',{text:{bold:{set:true}}});
  expect(artifact.worksheet.cellStyle('B2').font).toMatchObject({bold:true,italic:true});
  expect(artifact.worksheet.rows.flatMap(row=>row.cells)).toHaveLength(0);
});

test('full-sheet formatting updates custom row styles with inferred row indexes', async () => {
  const {createSpreadsheet,openSpreadsheetArtifact} = await import('../src/index.ts');
  const {beginPackageTransaction} = await import('@tumblerjs/opc');
  const original=createSpreadsheet().formatCells('A1:XFD1',{text:{italic:{set:true}}});
  const xml=original.worksheet.document.source.replace('r="1"','');
  const pkg=beginPackageTransaction(original.workbook.package).replacePart(original.activeSheet.partName,new TextEncoder().encode(xml)).commitPackage();
  const artifact=openSpreadsheetArtifact(pkg.archive.originalBytes()).formatCells('A1:XFD1048576',{text:{bold:{set:true}}});
  expect(artifact.worksheet.cellStyle('A1').font).toMatchObject({bold:true,italic:true});
});
