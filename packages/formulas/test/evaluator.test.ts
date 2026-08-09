import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import {
  calculateFormulas,
  type FormulaCellAddress,
  type FormulaCellInput,
  type FormulaScalarValue,
  type FormulaWorkbookSource,
} from "../src/index.ts";

describe("bounded spreadsheet formula calculation", () => {
  test("calculates the generated document's IF and SUM formulas", () => {
    const workbook = source({
      "Sample Data!B5": value(13),
      "Sample Data!B6": value(4),
      "Sample Data!B7": value(1),
      "Sample Data!D5": formula(`IF(B5>0,"OK","Check")`),
      "Sample Data!D6": formula(`IF(B6>0,"OK","Check")`),
      "Sample Data!D7": formula(`IF(B7>0,"OK","Check")`),
      "Sample Data!C10": formula("SUM(B5:B7)"),
    });

    const calculation = calculateFormulas(workbook);

    expect(calculation.value(address("Sample Data!D5"))).toEqual({ type: "string", value: "OK" });
    expect(calculation.value(address("Sample Data!D6"))).toEqual({ type: "string", value: "OK" });
    expect(calculation.value(address("Sample Data!D7"))).toEqual({ type: "string", value: "OK" });
    expect(calculation.value(address("Sample Data!C10"))).toEqual({ type: "number", value: 18 });
    expect(calculation.dependencies(address("Sample Data!C10"))).toEqual([
      address("Sample Data!B5"), address("Sample Data!B6"), address("Sample Data!B7"),
    ]);
    expect(calculation.diagnostics).toEqual([]);
  });

  test("evaluates dependency order across sheets", () => {
    const workbook = source({
      "Inputs!A1": value(4),
      "Data Sheet!A1": formula("Inputs!A1*2"),
      "Data Sheet!A2": formula("A1+2"),
    });
    const calculation = calculateFormulas(workbook);
    expect(calculation.value(address("Data Sheet!A2"))).toEqual({ type: "number", value: 10 });
  });

  test("uses a source cache for unsupported dependencies without claiming it was calculated", () => {
    const workbook = source({
      "Sheet1!A1": formula("OFFSET(B1,0,0)", { type: "number", value: 42 }),
      "Sheet1!A2": formula("A1+1"),
    });
    const calculation = calculateFormulas(workbook);
    expect(calculation.value(address("Sheet1!A1"))).toBeUndefined();
    expect(calculation.value(address("Sheet1!A2"))).toEqual({ type: "number", value: 43 });
    expect(calculation.diagnostics).toMatchObject([{ code: "unsupported-function", formula: "OFFSET(B1,0,0)" }]);
  });

  test("keeps IF lazy and implements errors, aggregates, logicals, and coercion", () => {
    const workbook = source({
      "Sheet1!A1": formula("IF(TRUE,1,MISSING())"),
      "Sheet1!A2": formula("1/0"),
      "Sheet1!A3": formula("AVERAGE(1,2,3)"),
      "Sheet1!A4": formula("AND(1,TRUE,NOT(FALSE))"),
      "Sheet1!A5": formula(`"2"+3&"!"`),
      "Sheet1!A6": formula("MIN(4,2,9)+MAX(4,2,9)+COUNT(4,TRUE,\"x\")"),
    });
    const calculation = calculateFormulas(workbook);
    expect(calculation.value(address("Sheet1!A1"))).toEqual({ type: "number", value: 1 });
    expect(calculation.value(address("Sheet1!A2"))).toEqual({ type: "error", value: "#DIV/0!" });
    expect(calculation.value(address("Sheet1!A3"))).toEqual({ type: "number", value: 2 });
    expect(calculation.value(address("Sheet1!A4"))).toEqual({ type: "boolean", value: true });
    expect(calculation.value(address("Sheet1!A5"))).toEqual({ type: "string", value: "5!" });
    expect(calculation.value(address("Sheet1!A6"))).toEqual({ type: "number", value: 13 });
    expect(calculation.diagnostics).toEqual([]);
  });

  test("implements the ECMA-376 conditional aggregate examples", () => {
    const workbook = source({
      "Sheet1!A1": value(3),
      "Sheet1!B1": value(10),
      "Sheet1!C1": value(7),
      "Sheet1!D1": value(10),
      "Sheet1!A2": textValue("apples"),
      "Sheet1!B2": textValue("melons"),
      "Sheet1!C2": value(10),
      "Sheet1!D2": value(15),
      "Sheet1!F1": formula(`COUNTIF(A1:D1,"=10")`),
      "Sheet1!F2": formula(`COUNTIF(A1:D1,">5")`),
      "Sheet1!F3": formula(`SUMIF(A1:D1,"<>10")`),
      "Sheet1!F4": formula(`SUMIF(A2:B2,"*es",C2:D2)`),
      "Sheet1!F5": formula(`AVERAGEIF(A1:D1,">5")`),
    });

    const calculation = calculateFormulas(workbook);

    expect(calculation.value(address("Sheet1!F1"))).toEqual({ type: "number", value: 2 });
    expect(calculation.value(address("Sheet1!F2"))).toEqual({ type: "number", value: 3 });
    expect(calculation.value(address("Sheet1!F3"))).toEqual({ type: "number", value: 10 });
    expect(calculation.value(address("Sheet1!F4"))).toEqual({ type: "number", value: 10 });
    expect(calculation.value(address("Sheet1!F5"))).toEqual({ type: "number", value: 9 });
    expect(calculation.diagnostics).toEqual([]);
  });

  test("keeps error and multi-branch functions lazy", () => {
    const workbook = source({
      "Sheet1!A1": formula("IFERROR(1,MISSING())"),
      "Sheet1!A2": formula("IFERROR(1/0,5)"),
      "Sheet1!A3": formula("IFNA(#N/A,7)"),
      "Sheet1!A4": formula("IFNA(#VALUE!,7)"),
      "Sheet1!A5": formula(`IFS(FALSE,MISSING(),TRUE,"ready")`),
      "Sheet1!A6": formula(`SWITCH(2,1,MISSING(),2,"two",MISSING())`),
      "Sheet1!A7": formula("XOR(TRUE,FALSE,TRUE)"),
    });

    const calculation = calculateFormulas(workbook);

    expect(calculation.value(address("Sheet1!A1"))).toEqual({ type: "number", value: 1 });
    expect(calculation.value(address("Sheet1!A2"))).toEqual({ type: "number", value: 5 });
    expect(calculation.value(address("Sheet1!A3"))).toEqual({ type: "number", value: 7 });
    expect(calculation.value(address("Sheet1!A4"))).toEqual({ type: "error", value: "#VALUE!" });
    expect(calculation.value(address("Sheet1!A5"))).toEqual({ type: "string", value: "ready" });
    expect(calculation.value(address("Sheet1!A6"))).toEqual({ type: "string", value: "two" });
    expect(calculation.value(address("Sheet1!A7"))).toEqual({ type: "boolean", value: false });
    expect(calculation.diagnostics).toEqual([]);
  });

  test("evaluates multi-criteria aggregates across sheets without caches", () => {
    const workbook = source({
      "Sales Data!A1": textValue("North"), "Sales Data!B1": textValue("Open"), "Sales Data!C1": value(10),
      "Sales Data!A2": textValue("North"), "Sales Data!B2": textValue("Closed"), "Sales Data!C2": value(20),
      "Sales Data!A3": textValue("South"), "Sales Data!B3": textValue("Open"), "Sales Data!C3": value(30),
      "Sales Data!A4": textValue("North"), "Sales Data!B4": textValue("Open"), "Sales Data!C4": formula("#N/A"),
      "Summary!A1": formula(`SUMIFS('Sales Data'!C1:C4,'Sales Data'!A1:A4,"North",'Sales Data'!B1:B4,"Open")`),
      "Summary!A2": formula(`COUNTIFS('Sales Data'!A1:A4,"North",'Sales Data'!B1:B4,"Open")`),
      "Summary!A3": formula(`AVERAGEIFS('Sales Data'!C1:C3,'Sales Data'!A1:A3,"North")`),
      "Summary!A4": formula(`AVERAGEIFS('Sales Data'!C1:C3,'Sales Data'!A1:A3,"Missing")`),
      "Summary!A5": formula(`SUMIFS('Sales Data'!C1:C3,'Sales Data'!A1:A2,"North")`),
    });

    const calculation = calculateFormulas(workbook);

    expect(calculation.value(address("Summary!A1"))).toEqual({ type: "error", value: "#N/A" });
    expect(calculation.value(address("Summary!A2"))).toEqual({ type: "number", value: 2 });
    expect(calculation.value(address("Summary!A3"))).toEqual({ type: "number", value: 15 });
    expect(calculation.value(address("Summary!A4"))).toEqual({ type: "error", value: "#DIV/0!" });
    expect(calculation.value(address("Summary!A5"))).toEqual({ type: "error", value: "#VALUE!" });
    expect(calculation.diagnostics).toEqual([]);
  });

  test("calculates practical math and statistical families", () => {
    const workbook = source({
      "Sheet1!A1": value(1), "Sheet1!A2": value(2), "Sheet1!A3": value(3),
      "Sheet1!B1": value(4), "Sheet1!B2": value(5), "Sheet1!B3": value(6),
      "Sheet1!C1": formula("ABS(-3)+INT(-1.2)"),
      "Sheet1!C2": formula("ROUND(2.675,2)"),
      "Sheet1!C3": formula("ROUNDUP(-1.21,1)+ROUNDDOWN(-1.29,1)"),
      "Sheet1!C4": formula("MOD(-3,2)"),
      "Sheet1!C5": formula("CEILING.MATH(-4.3)+FLOOR.MATH(-4.3)"),
      "Sheet1!C6": formula("PRODUCT(A1:A3,2)"),
      "Sheet1!C7": formula("SUMPRODUCT(A1:A3,B1:B3)"),
      "Sheet1!C8": formula("MEDIAN(A1:A3)"),
      "Sheet1!C9": formula("VAR.P(A1:A3)"),
      "Sheet1!C10": formula("STDEV.S(A1:A3)"),
      "Sheet1!C11": formula("COUNTA(A1:A3,\"\")"),
      "Sheet1!C12": formula("COUNTBLANK(D1:D3)"),
    });

    const calculation = calculateFormulas(workbook);

    expect(calculation.value(address("Sheet1!C1"))).toEqual({ type: "number", value: 1 });
    expect(calculation.value(address("Sheet1!C2"))).toEqual({ type: "number", value: 2.68 });
    expect(calculation.value(address("Sheet1!C3"))).toEqual({ type: "number", value: -2.5 });
    expect(calculation.value(address("Sheet1!C4"))).toEqual({ type: "number", value: 1 });
    expect(calculation.value(address("Sheet1!C5"))).toEqual({ type: "number", value: -9 });
    expect(calculation.value(address("Sheet1!C6"))).toEqual({ type: "number", value: 12 });
    expect(calculation.value(address("Sheet1!C7"))).toEqual({ type: "number", value: 32 });
    expect(calculation.value(address("Sheet1!C8"))).toEqual({ type: "number", value: 2 });
    expect(calculation.value(address("Sheet1!C9"))?.type).toBe("number");
    expect(calculation.value(address("Sheet1!C10"))).toEqual({ type: "number", value: 1 });
    expect(calculation.value(address("Sheet1!C11"))).toEqual({ type: "number", value: 4 });
    expect(calculation.value(address("Sheet1!C12"))).toEqual({ type: "number", value: 3 });
    expect(calculation.diagnostics).toEqual([]);
  });

  test("calculates bounded text and type-predicate families", () => {
    const workbook = source({
      "Sheet1!A1": textValue("  hello   WORLD  "),
      "Sheet1!A2": formula("1/0"),
      "Sheet1!B1": formula("LEN(A1)"),
      "Sheet1!B2": formula("TRIM(A1)"),
      "Sheet1!B3": formula("UPPER(LEFT(TRIM(A1),5))"),
      "Sheet1!B4": formula("LOWER(RIGHT(TRIM(A1),5))"),
      "Sheet1!B5": formula(`MID("abcdef",2,3)`),
      "Sheet1!B6": formula(`PROPER("one TWO-three")`),
      "Sheet1!B7": formula(`SUBSTITUTE("a-b-a","a","x",2)`),
      "Sheet1!B8": formula(`FIND("WORLD",A1)`),
      "Sheet1!B9": formula(`SEARCH("world",A1)`),
      "Sheet1!B10": formula(`EXACT("A","a")`),
      "Sheet1!B11": formula(`CONCAT("A",1,TRUE)`),
      "Sheet1!B12": formula(`TEXTJOIN("-",TRUE,"A","",1)`),
      "Sheet1!B13": formula("ISNUMBER(1)+ISTEXT(\"x\")+ISLOGICAL(TRUE)+ISBLANK(C1)"),
      "Sheet1!B14": formula("ISERROR(A2)+ISERR(A2)+ISNA(#N/A)"),
    });

    const calculation = calculateFormulas(workbook);

    expect(calculation.value(address("Sheet1!B1"))).toEqual({ type: "number", value: 17 });
    expect(calculation.value(address("Sheet1!B2"))).toEqual({ type: "string", value: "hello WORLD" });
    expect(calculation.value(address("Sheet1!B3"))).toEqual({ type: "string", value: "HELLO" });
    expect(calculation.value(address("Sheet1!B4"))).toEqual({ type: "string", value: "world" });
    expect(calculation.value(address("Sheet1!B5"))).toEqual({ type: "string", value: "bcd" });
    expect(calculation.value(address("Sheet1!B6"))).toEqual({ type: "string", value: "One Two-Three" });
    expect(calculation.value(address("Sheet1!B7"))).toEqual({ type: "string", value: "a-b-x" });
    expect(calculation.value(address("Sheet1!B8"))).toEqual({ type: "number", value: 11 });
    expect(calculation.value(address("Sheet1!B9"))).toEqual({ type: "number", value: 11 });
    expect(calculation.value(address("Sheet1!B10"))).toEqual({ type: "boolean", value: false });
    expect(calculation.value(address("Sheet1!B11"))).toEqual({ type: "string", value: "A1TRUE" });
    expect(calculation.value(address("Sheet1!B12"))).toEqual({ type: "string", value: "A-1" });
    expect(calculation.value(address("Sheet1!B13"))).toEqual({ type: "number", value: 4 });
    expect(calculation.value(address("Sheet1!B14"))).toEqual({ type: "number", value: 3 });
  });

  test("calculates deterministic dates with Excel's 1900 compatibility leap day", () => {
    const workbook = source({
      "Sheet1!A1": formula("DATE(1900,1,1)"),
      "Sheet1!A2": formula("DATE(1900,3,1)"),
      "Sheet1!A3": formula("YEAR(60)&\"-\"&MONTH(60)&\"-\"&DAY(60)"),
      "Sheet1!A4": formula("DATEVALUE(\"2026-08-09\")"),
      "Sheet1!A5": formula("EDATE(DATE(2024,1,31),1)"),
      "Sheet1!A6": formula("EOMONTH(DATE(2024,1,15),1)"),
      "Sheet1!A7": formula("WEEKDAY(DATE(2026,8,9),2)"),
      "Sheet1!A8": formula("DAYS(DATE(2026,8,9),DATE(2026,8,1))"),
      "Sheet1!A9": formula("NETWORKDAYS(DATE(2026,8,3),DATE(2026,8,9),DATE(2026,8,5))"),
      "Sheet1!A10": formula("WORKDAY(DATE(2026,8,7),2,DATE(2026,8,10))"),
    });

    const calculation = calculateFormulas(workbook);

    expect(calculation.value(address("Sheet1!A1"))).toEqual({ type: "number", value: 1 });
    expect(calculation.value(address("Sheet1!A2"))).toEqual({ type: "number", value: 61 });
    expect(calculation.value(address("Sheet1!A3"))).toEqual({ type: "string", value: "1900-2-29" });
    expect(calculation.value(address("Sheet1!A4"))).toEqual({ type: "number", value: 46_243 });
    expect(calculation.value(address("Sheet1!A5"))).toEqual({ type: "number", value: 45_351 });
    expect(calculation.value(address("Sheet1!A6"))).toEqual({ type: "number", value: 45_351 });
    expect(calculation.value(address("Sheet1!A7"))).toEqual({ type: "number", value: 7 });
    expect(calculation.value(address("Sheet1!A8"))).toEqual({ type: "number", value: 8 });
    expect(calculation.value(address("Sheet1!A9"))).toEqual({ type: "number", value: 4 });
    expect(calculation.value(address("Sheet1!A10"))).toEqual({ type: "number", value: 46_246 });
    expect(calculation.diagnostics).toEqual([]);
  });

  test("uses the 1904 workbook date system when requested", () => {
    const calculation = calculateFormulas(source({
      "Sheet1!A1": formula("DATE(1904,1,1)"),
      "Sheet1!A2": formula("WEEKDAY(0,2)"),
    }), { dateSystem: "1904" });

    expect(calculation.value(address("Sheet1!A1"))).toEqual({ type: "number", value: 0 });
    expect(calculation.value(address("Sheet1!A2"))).toEqual({ type: "number", value: 5 });
  });

  test("calculates bounded lookup families across sheets without caches", () => {
    const workbook = source({
      "Data!A1": textValue("A"), "Data!B1": value(10), "Data!C1": textValue("low"),
      "Data!A2": textValue("B"), "Data!B2": value(20), "Data!C2": textValue("mid"),
      "Data!A3": textValue("C"), "Data!B3": value(30), "Data!C3": textValue("high"),
      "Data!D1": textValue("A"), "Data!E1": textValue("B"), "Data!F1": textValue("C"),
      "Data!D2": value(100), "Data!E2": value(200), "Data!F2": value(300),
      "Report!A1": formula(`XLOOKUP("B",Data!A1:A3,Data!B1:B3)`),
      "Report!A2": formula(`XLOOKUP("missing",Data!A1:A3,Data!B1:B3,"none")`),
      "Report!A3": formula(`MATCH(25,Data!B1:B3,1)`),
      "Report!A4": formula(`XMATCH("C",Data!A1:A3)`),
      "Report!A5": formula(`INDEX(Data!A1:C3,2,3)`),
      "Report!A6": formula(`VLOOKUP("B",Data!A1:C3,3,FALSE)`),
      "Report!A7": formula(`HLOOKUP("C",Data!D1:F2,2,FALSE)`),
      "Report!A8": formula(`CHOOSE(2,MISSING(),"selected",MISSING())`),
      "Report!A9": formula(`XLOOKUP("B*",Data!A1:A3,Data!B1:B3,"none",2)`),
      "Report!A10": formula(`XLOOKUP("B",Data!A1:A3,Data!B1:B3,"none",0,-1)`),
      "Report!A11": formula(`XLOOKUP("B",Data!A1:A3,Data!B1:B3,"none",9)`),
    });

    const calculation = calculateFormulas(workbook);

    expect(calculation.value(address("Report!A1"))).toEqual({ type: "number", value: 20 });
    expect(calculation.value(address("Report!A2"))).toEqual({ type: "string", value: "none" });
    expect(calculation.value(address("Report!A3"))).toEqual({ type: "number", value: 2 });
    expect(calculation.value(address("Report!A4"))).toEqual({ type: "number", value: 3 });
    expect(calculation.value(address("Report!A5"))).toEqual({ type: "string", value: "mid" });
    expect(calculation.value(address("Report!A6"))).toEqual({ type: "string", value: "mid" });
    expect(calculation.value(address("Report!A7"))).toEqual({ type: "number", value: 300 });
    expect(calculation.value(address("Report!A8"))).toEqual({ type: "string", value: "selected" });
    expect(calculation.value(address("Report!A9"))).toEqual({ type: "number", value: 20 });
    expect(calculation.value(address("Report!A10"))).toEqual({ type: "number", value: 20 });
    expect(calculation.value(address("Report!A11"))).toEqual({ type: "error", value: "#VALUE!" });
    expect(calculation.diagnostics).toEqual([]);
  });

  test("matches text case-insensitively with linear wildcards and tilde escaping", () => {
    const workbook = source({
      "Sheet1!A1": textValue("Alpha"),
      "Sheet1!A2": textValue("ALPINE"),
      "Sheet1!A3": textValue("a*"),
      "Sheet1!A4": textValue("a?"),
      "Sheet1!A5": textValue("a~"),
      "Sheet1!A6": textValue("beta"),
      "Sheet1!A7": textValue("A01"),
      "Sheet1!A8": textValue("A1"),
      "Sheet1!B1": formula(`COUNTIF(A1:A6,"alp*")`),
      "Sheet1!B2": formula(`COUNTIF(A1:A6,"a~*")`),
      "Sheet1!B3": formula(`COUNTIF(A1:A6,"a~?")`),
      "Sheet1!B4": formula(`COUNTIF(A1:A6,"a~~")`),
      "Sheet1!B5": formula(`COUNTIF(A1:A6,"<>*a")`),
      "Sheet1!B6": formula(`COUNTIF(A7:A8,"A01")`),
    });

    const calculation = calculateFormulas(workbook);

    expect(calculation.value(address("Sheet1!B1"))).toEqual({ type: "number", value: 2 });
    expect(calculation.value(address("Sheet1!B2"))).toEqual({ type: "number", value: 1 });
    expect(calculation.value(address("Sheet1!B3"))).toEqual({ type: "number", value: 1 });
    expect(calculation.value(address("Sheet1!B4"))).toEqual({ type: "number", value: 1 });
    expect(calculation.value(address("Sheet1!B5"))).toEqual({ type: "number", value: 4 });
    expect(calculation.value(address("Sheet1!B6"))).toEqual({ type: "number", value: 1 });
  });

  test("aligns a short result range from its top-left cell across sheets", () => {
    const workbook = source({
      "Criteria!A1": value(1),
      "Criteria!A2": value(0),
      "Criteria!A3": value(1),
      "Values!C2": value(10),
      "Values!C3": value(20),
      "Values!C4": value(30),
      "Results!A1": formula(`SUMIF(Criteria!A1:A3,1,Values!C2)`),
      "Results!A2": formula(`AVERAGEIF(Criteria!A1:A3,1,Values!C2:C2)`),
    });

    const calculation = calculateFormulas(workbook);

    expect(calculation.value(address("Results!A1"))).toEqual({ type: "number", value: 40 });
    expect(calculation.value(address("Results!A2"))).toEqual({ type: "number", value: 20 });
    expect(calculation.dependencies(address("Results!A1"))).toEqual([
      address("Criteria!A1"), address("Criteria!A2"), address("Criteria!A3"),
      address("Values!C2"), address("Values!C3"), address("Values!C4"),
    ]);
  });

  test("defines blank, boolean, text, and error behavior deliberately", () => {
    const workbook = source({
      "Sheet1!A2": literal({ type: "string", value: "" }),
      "Sheet1!A3": literal({ type: "boolean", value: true }),
      "Sheet1!A4": literal({ type: "number", value: 1 }),
      "Sheet1!A5": literal({ type: "string", value: "1" }),
      "Sheet1!A6": literal({ type: "error", value: "#N/A" }),
      "Sheet1!B1": value(100),
      "Sheet1!B2": value(200),
      "Sheet1!B3": literal({ type: "boolean", value: true }),
      "Sheet1!B4": literal({ type: "string", value: "400" }),
      "Sheet1!B5": value(500),
      "Sheet1!B6": literal({ type: "error", value: "#DIV/0!" }),
      "Sheet1!D1": formula(`COUNTIF(A1:A6,"")`),
      "Sheet1!D2": formula(`COUNTIF(A1:A6,TRUE)`),
      "Sheet1!D3": formula(`COUNTIF(A1:A6,"1")`),
      "Sheet1!D4": formula(`COUNTIF(A1:A6,"#N/A")`),
      "Sheet1!D5": formula(`SUMIF(A1:A6,"<>x",B1:B6)`),
      "Sheet1!D6": formula(`AVERAGEIF(A1:A2,"missing",B1:B2)`),
      "Sheet1!D7": formula(`COUNTIF(A1:A6,#N/A)`),
      "Sheet1!D8": formula(`AVERAGEIF(A1:A6,TRUE,B1:B6)`),
    });

    const calculation = calculateFormulas(workbook);

    expect(calculation.value(address("Sheet1!D1"))).toEqual({ type: "number", value: 2 });
    expect(calculation.value(address("Sheet1!D2"))).toEqual({ type: "number", value: 1 });
    expect(calculation.value(address("Sheet1!D3"))).toEqual({ type: "number", value: 1 });
    expect(calculation.value(address("Sheet1!D4"))).toEqual({ type: "number", value: 1 });
    expect(calculation.value(address("Sheet1!D5"))).toEqual({ type: "error", value: "#DIV/0!" });
    expect(calculation.value(address("Sheet1!D6"))).toEqual({ type: "error", value: "#DIV/0!" });
    expect(calculation.value(address("Sheet1!D7"))).toEqual({ type: "error", value: "#N/A" });
    expect(calculation.value(address("Sheet1!D8"))).toEqual({ type: "error", value: "#DIV/0!" });
  });

  test("ignores non-numeric result cells and does not read unmatched errors", () => {
    const calculation = calculateFormulas(source({
      "Sheet1!A1": value(1),
      "Sheet1!A2": value(-1),
      "Sheet1!A3": literal({ type: "error", value: "#N/A" }),
      "Sheet1!A4": value(2),
      "Sheet1!B1": literal({ type: "boolean", value: true }),
      "Sheet1!B2": literal({ type: "error", value: "#DIV/0!" }),
      "Sheet1!B3": literal({ type: "error", value: "#REF!" }),
      "Sheet1!B4": value(8),
      "Sheet1!D1": formula(`SUMIF(A1:A4,">0",B1:B4)`),
      "Sheet1!D2": formula(`AVERAGEIF(A1:A4,">0",B1:B4)`),
    }));

    expect(calculation.value(address("Sheet1!D1"))).toEqual({ type: "number", value: 8 });
    expect(calculation.value(address("Sheet1!D2"))).toEqual({ type: "number", value: 8 });
    expect(calculation.diagnostics).toEqual([]);
  });

  test("accepts scalar expression and reference criteria", () => {
    const calculation = calculateFormulas(source({
      "Sheet1!A1": value(0),
      "Sheet1!A2": value(2),
      "Sheet1!A3": value(3),
      "Sheet1!B1": formula(`COUNTIF(A1:A3,1+1)`),
      "Sheet1!B2": formula(`COUNTIF(A1:A3,A4)`),
    }));

    expect(calculation.value(address("Sheet1!B1"))).toEqual({ type: "number", value: 1 });
    expect(calculation.value(address("Sheet1!B2"))).toEqual({ type: "number", value: 1 });
  });

  test("rejects non-reference ranges and diagnoses projected ranges beyond the worksheet", () => {
    const calculation = calculateFormulas(source({
      "Sheet1!A1": formula(`COUNTIF(1,"=1")`, { type: "number", value: 91 }),
      "Sheet1!A2": formula(`SUMIF(A1:A2,1,XFD1048576)`, { type: "number", value: 92 }),
      "Sheet1!A3": formula(`AVERAGEIF(A1:A2,"never",XFD1048576)`, { type: "number", value: 93 }),
    }));

    expect(calculation.value(address("Sheet1!A1"))).toEqual({ type: "error", value: "#VALUE!" });
    expect(calculation.value(address("Sheet1!A2"))).toBeUndefined();
    expect(calculation.value(address("Sheet1!A3"))).toBeUndefined();
    expect(calculation.diagnostics).toMatchObject([
      { code: "unsupported-reference", formula: `SUMIF(A1:A2,1,XFD1048576)` },
      { code: "unsupported-reference", formula: `AVERAGEIF(A1:A2,"never",XFD1048576)` },
    ]);
  });

  test("keeps wildcard evaluation bounded on adversarial text", () => {
    const repeated = "a".repeat(20_000);
    const calculation = calculateFormulas(source({
      "Sheet1!A1": textValue(`${repeated}b`),
      "Sheet1!B1": formula(`COUNTIF(A1,"*a*a*a*a*a*c")`),
    }), { maxOperations: 20 });
    expect(calculation.value(address("Sheet1!B1"))).toEqual({ type: "number", value: 0 });
    expect(calculation.diagnostics).toEqual([]);
  });

  test("applies operation and criterion-size limits to conditional aggregates", () => {
    const limitedRange = calculateFormulas(source({
      "Sheet1!A1": value(1),
      "Sheet1!B1": formula(`COUNTIF(A1:A10,1)`, { type: "number", value: 7 }),
    }), { maxOperations: 8 });
    expect(limitedRange.value(address("Sheet1!B1"))).toBeUndefined();
    expect(limitedRange.diagnostics[0]?.code).toBe("evaluation-limit");

    const longCriterion = "a".repeat(8_193);
    const limitedCriterion = calculateFormulas(source({
      "Sheet1!A1": textValue("a"),
      "Sheet1!B1": formula(`COUNTIF(A1,"${longCriterion}")`, { type: "number", value: 8 }),
    }));
    expect(limitedCriterion.value(address("Sheet1!B1"))).toBeUndefined();
    expect(limitedCriterion.diagnostics[0]?.code).toBe("evaluation-limit");
  });

  test("diagnoses cycles and keeps their cached values source-owned", () => {
    const calculation = calculateFormulas(source({
      "Sheet1!A1": formula("A2+1"),
      "Sheet1!A2": formula("A1+1"),
    }));
    expect(calculation.value(address("Sheet1!A1"))).toBeUndefined();
    expect(calculation.value(address("Sheet1!A2"))).toBeUndefined();
    expect(calculation.diagnostics.map(({ code }) => code)).toEqual(["circular-reference", "circular-reference"]);
  });

  test("bounds ranges, operations, depth, and formula inventory", () => {
    const workbook = source({ "Sheet1!A1": formula("SUM(A2:XFD1048576)") });
    const calculation = calculateFormulas(workbook, { maxRangeCells: 20 });
    expect(calculation.value(address("Sheet1!A1"))).toBeUndefined();
    expect(calculation.diagnostics[0]?.code).toBe("evaluation-limit");
    expect(() => calculateFormulas(workbook, { maxFormulaCells: 0 })).toThrow(RangeError);
  });

  test("matches generated arithmetic expressions", () => {
    fc.assert(fc.property(
      fc.integer({ min: -1_000_000, max: 1_000_000 }),
      fc.integer({ min: -1_000_000, max: 1_000_000 }),
      (left, right) => {
        const workbook = source({ "Sheet1!A1": formula(`(${left})+(${right})`) });
        expect(calculateFormulas(workbook).value(address("Sheet1!A1"))).toEqual({ type: "number", value: left + right });
      },
    ), { numRuns: 500 });
  });

  test("matches generated numeric conditional aggregates", () => {
    fc.assert(fc.property(
      fc.array(fc.integer({ min: -100, max: 100 }), { minLength: 1, maxLength: 80 }),
      fc.integer({ min: -100, max: 100 }),
      (values, threshold) => {
        const cells: Record<string, FormulaCellInput> = {
          "Sheet1!C1": formula(`COUNTIF(A1:A${values.length},">=${threshold}")`),
          "Sheet1!C2": formula(`SUMIF(A1:A${values.length},">=${threshold}",B1)`),
          "Sheet1!C3": formula(`AVERAGEIF(A1:A${values.length},">=${threshold}",B1:B1)`),
        };
        values.forEach((current, index) => {
          cells[`Sheet1!A${index + 1}`] = value(current);
          cells[`Sheet1!B${index + 1}`] = value(current * 2);
        });
        const selected = values.filter((current) => current >= threshold).map((current) => current * 2);
        const calculation = calculateFormulas(source(cells));
        expect(calculation.value(address("Sheet1!C1"))).toEqual({ type: "number", value: selected.length });
        expect(calculation.value(address("Sheet1!C2"))).toEqual({
          type: "number",
          value: selected.reduce((sum, current) => sum + current, 0),
        });
        expect(calculation.value(address("Sheet1!C3"))).toEqual(selected.length === 0
          ? { type: "error", value: "#DIV/0!" }
          : { type: "number", value: selected.reduce((sum, current) => sum + current, 0) / selected.length });
      },
    ), { numRuns: 300 });
  });

  test("matches generated wildcard criteria against a small reference oracle", () => {
    const character = fc.constantFrom("a", "b", "A", "B", "x");
    const wildcardPart = fc.constantFrom("a", "b", "A", "B", "x", "*", "?", "~*", "~?", "~~");
    fc.assert(fc.property(
      fc.array(character, { maxLength: 20 }).map((parts) => parts.join("")),
      fc.array(wildcardPart, { maxLength: 12 }).map((parts) => parts.join("")),
      (candidate, pattern) => {
        const calculation = calculateFormulas(source({
          "Sheet1!A1": textValue(candidate),
          "Sheet1!B1": formula(`COUNTIF(A1,"${pattern}")`),
        }));
        expect(calculation.value(address("Sheet1!B1"))).toEqual({
          type: "number",
          value: referenceWildcardMatch(pattern, candidate) ? 1 : 0,
        });
      },
    ), { numRuns: 500 });
  });
});

function source(cells: Readonly<Record<string, FormulaCellInput>>): FormulaWorkbookSource {
  const entries = new Map(Object.entries(cells).map(([reference, cell]) => [key(address(reference)), cell]));
  const sheets = new Map(Object.keys(cells).map((reference) => {
    const sheet = reference.slice(0, reference.lastIndexOf("!"));
    return [sheet.toLocaleLowerCase("en-US"), sheet];
  }));
  return {
    formulaCells: [...entries].flatMap(([cellKey, cell]) => cell.formula === undefined ? [] : [{ address: addressFromKey(cellKey), formula: cell.formula }]),
    cell: (cellAddress) => entries.get(key(cellAddress)),
    resolveSheet: (_currentSheet, name) => sheets.get(name.toLocaleLowerCase("en-US")),
  };
}

function formula(source: string, cached: FormulaScalarValue = { type: "blank" }): FormulaCellInput {
  return { formula: source, value: cached };
}

function value(number: number): FormulaCellInput {
  return { formula: undefined, value: { type: "number", value: number } };
}

function textValue(value: string): FormulaCellInput {
  return literal({ type: "string", value });
}

function literal(value: FormulaScalarValue): FormulaCellInput {
  return { formula: undefined, value };
}

function address(reference: string): FormulaCellAddress {
  const separator = reference.lastIndexOf("!");
  const sheet = reference.slice(0, separator);
  const match = /^([A-Z]+)([1-9][0-9]*)$/.exec(reference.slice(separator + 1))!;
  let column = 0;
  for (const character of match[1]!) column = column * 26 + character.charCodeAt(0) - 64;
  return { sheet, row: Number(match[2]), column };
}

function key(cellAddress: FormulaCellAddress): string {
  return `${cellAddress.sheet}\u0000${cellAddress.row}\u0000${cellAddress.column}`;
}

function addressFromKey(value: string): FormulaCellAddress {
  const [sheet, row, column] = value.split("\u0000");
  return { sheet: sheet!, row: Number(row), column: Number(column) };
}

function referenceWildcardMatch(pattern: string, candidate: string): boolean {
  const tokens: (
    | { readonly kind: "many" }
    | { readonly kind: "one" }
    | { readonly kind: "literal"; readonly value: string }
  )[] = [];
  const characters = [...pattern.toLocaleLowerCase("en-US")];
  for (let index = 0; index < characters.length; index += 1) {
    const current = characters[index]!;
    if (current === "~" && ["~", "*", "?"].includes(characters[index + 1] ?? "")) {
      tokens.push({ kind: "literal", value: characters[index + 1]! });
      index += 1;
    } else if (current === "*") tokens.push({ kind: "many" });
    else if (current === "?") tokens.push({ kind: "one" });
    else tokens.push({ kind: "literal", value: current });
  }
  const text = [...candidate.toLocaleLowerCase("en-US")];
  const matches = Array.from({ length: tokens.length + 1 }, () => Array<boolean>(text.length + 1).fill(false));
  matches[0]![0] = true;
  for (let tokenIndex = 1; tokenIndex <= tokens.length; tokenIndex += 1) {
    const token = tokens[tokenIndex - 1]!;
    matches[tokenIndex]![0] = token.kind === "many" && matches[tokenIndex - 1]![0]!;
    for (let textIndex = 1; textIndex <= text.length; textIndex += 1) {
      matches[tokenIndex]![textIndex] = token.kind === "many"
        ? matches[tokenIndex - 1]![textIndex]! || matches[tokenIndex]![textIndex - 1]!
        : (token.kind === "one" || token.value === text[textIndex - 1]) && matches[tokenIndex - 1]![textIndex - 1]!;
    }
  }
  return matches[tokens.length]![text.length]!;
}
