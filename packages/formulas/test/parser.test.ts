import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { FormulaParseError, parseFormula, tokenizeFormula } from "../src/index.ts";

describe("Spreadsheet formula grammar", () => {
  test("parses the generated workbook formulas without a UI equals sign", () => {
    expect(parseFormula(`IF(B5>0,"OK","Check")`).expression).toMatchObject({
      kind: "function",
      name: "IF",
      arguments: [
        {
          kind: "binary",
          operator: ">",
          left: { kind: "reference", startReference: { row: 5, column: 2 } },
          right: { kind: "number", value: 0 },
        },
        { kind: "string", value: "OK" },
        { kind: "string", value: "Check" },
      ],
    });
    expect(parseFormula("SUM(B5:B7)").expression).toMatchObject({
      kind: "function",
      name: "SUM",
      arguments: [{
        kind: "reference",
        startReference: { row: 5, column: 2 },
        endReference: { row: 7, column: 2 },
      }],
    });
  });

  test("retains absolute axes and sheet-qualified references", () => {
    expect(parseFormula(`'Data Sheet''s'!$A1+Sheet2!B$4`).expression).toMatchObject({
      kind: "binary",
      left: {
        kind: "reference",
        sheet: "Data Sheet's",
        startReference: { row: 1, column: 1, absoluteRow: false, absoluteColumn: true },
      },
      right: {
        kind: "reference",
        sheet: "Sheet2",
        startReference: { row: 4, column: 2, absoluteRow: true, absoluteColumn: false },
      },
    });
  });

  test("uses Excel operator precedence and left associativity", () => {
    expect(parseFormula("1+2*3^2&\"x\"=\"19x\"").expression).toMatchObject({
      kind: "binary",
      operator: "=",
      left: { kind: "binary", operator: "&", left: { kind: "binary", operator: "+" } },
    });
    expect(parseFormula("-1^2").expression).toMatchObject({
      kind: "binary",
      operator: "^",
      left: { kind: "unary", operator: "-" },
    });
    expect(parseFormula("2^3^2").expression).toMatchObject({
      kind: "binary",
      operator: "^",
      left: { kind: "binary", operator: "^" },
    });
  });

  test("decodes escaped strings, booleans, errors, percentages, and exponent numbers", () => {
    expect(tokenizeFormula(`"a""b"&TRUE&#N/A+1.25E-2%`).map((token) => token.kind === "eof" ? "eof" : [token.kind, token.value])).toEqual([
      ["string", `a"b`], ["symbol", "&"], ["identifier", "TRUE"], ["symbol", "&"], ["error", "#N/A"],
      ["symbol", "+"], ["number", "1.25E-2"], ["symbol", "%"], "eof",
    ]);
  });

  test.each([
    ["=SUM(A1:A2)", "leading equals"],
    ["SUM(A1:A2", "not closed"],
    ["A1:", "range"],
    ["[Book.xlsx]Sheet1!A1", "Unsupported formula character"],
    ["A0+1", "Unsupported name"],
    ["MysteryName", "Unsupported name"],
  ])("rejects unsupported or malformed source %s", (source, message) => {
    expect(() => parseFormula(source)).toThrow(message);
  });

  test("round-trips generated finite numeric literals through the AST", () => {
    fc.assert(fc.property(fc.double({ noNaN: true, noDefaultInfinity: true, min: -1e100, max: 1e100 }), (value) => {
      const source = value < 0 ? `(${String(value)})` : String(value);
      const expression = parseFormula(source).expression;
      const literal = expression.kind === "unary" ? expression.operand : expression;
      expect(literal).toMatchObject({ kind: "number", value: Math.abs(value) });
    }), { numRuns: 500 });
  });
});
