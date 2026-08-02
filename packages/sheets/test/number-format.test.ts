import { describe, expect, test } from "bun:test";
import { formatSpreadsheetCellValue, type SpreadsheetCellValue } from "../src/index.ts";

const number = (value: number): SpreadsheetCellValue => ({ type: "number", value, lexical: String(value) });

describe("SpreadsheetML number formatting", () => {
  test.each([
    [1234.5, { numberFormatId: 0 }, "1234.5"],
    [1234.5, { numberFormatId: 4 }, "1,234.50"],
    [0.256, { numberFormatId: 9 }, "26%"],
    [0.256, { numberFormatId: 10 }, "25.60%"],
    [12_200_000, { numberFormatCode: "#0.0,," }, "12.2"],
    [12_200_000, { numberFormatId: 11 }, "1.22E+07"],
    [2.25, { numberFormatId: 12 }, "2 1/4"],
    [-1234.5, { numberFormatCode: `"£"#,##0.00;[Red]("£"#,##0.00)` }, "(£1,234.50)"],
    [0, { numberFormatCode: `0.0;[Red]-0.0;"none"` }, "none"],
  ] as const)("formats %s with its format code", (value, options, expected) => {
    expect(formatSpreadsheetCellValue(number(value), options)).toBe(expected);
  });

  test("formats both workbook date systems and Excel's compatibility leap day", () => {
    expect(formatSpreadsheetCellValue(number(1), { numberFormatId: 14, dateSystem: "1900" })).toBe("01-01-00");
    expect(formatSpreadsheetCellValue(number(60), { numberFormatCode: "yyyy-mmm-dd", dateSystem: "1900" })).toBe("1900-Feb-29");
    expect(formatSpreadsheetCellValue(number(61), { numberFormatCode: "yyyy-mm-dd", dateSystem: "1900" })).toBe("1900-03-01");
    expect(formatSpreadsheetCellValue(number(0), { numberFormatCode: "yyyy-mm-dd", dateSystem: "1904" })).toBe("1904-01-01");
    expect(formatSpreadsheetCellValue(number(0.5), { numberFormatId: 18 })).toBe("12:00 PM");
    expect(formatSpreadsheetCellValue(number(0.500011574), { numberFormatCode: "hh:mm:ss.000" })).toBe("12:00:01.000");
  });

  test("returns non-numeric cell values without applying numeric formats", () => {
    expect(formatSpreadsheetCellValue({ type: "string", value: "001", storage: "inline" }, { numberFormatId: 2 })).toBe("001");
    expect(formatSpreadsheetCellValue({ type: "boolean", value: false })).toBe("FALSE");
    expect(formatSpreadsheetCellValue({ type: "error", value: "#N/A" })).toBe("#N/A");
    expect(formatSpreadsheetCellValue({ type: "blank" })).toBe("");
  });

  test("supports locale-specific decimal and grouping output", () => {
    expect(formatSpreadsheetCellValue(number(1234.5), { numberFormatId: 4, locale: "de-DE" })).toBe("1.234,50");
  });
});
