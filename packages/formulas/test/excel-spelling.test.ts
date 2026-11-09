import { expect, test } from "bun:test";
import { nativeExcelFormula } from "../../../scripts/formula-conformance/excel-spelling.ts";
import { buildFormulaDocument, openFormulaDocument, verifyFormulaDocument, type FormulaFixtureCase } from "../../../scripts/formula-conformance/corpus.ts";

test("native spellings preserve strings and encode captured lexical names", () => {
  expect(nativeExcelFormula('LET(x,1,LAMBDA(y,x+y)(2))')).toBe('_xlfn.LET(_xlpm.x,1,_xlfn.LAMBDA(_xlpm.y,_xlpm.x+_xlpm.y)(2))');
  expect(nativeExcelFormula('CONCAT("LET(x,1,x)",ISOWEEKNUM(45000))')).toBe('_xlfn.CONCAT("LET(x,1,x)",_xlfn.ISOWEEKNUM(45000))');
  expect(nativeExcelFormula('LET(f,LAMBDA(x,x+1),f(2))')).toBe('_xlfn.LET(_xlpm.f,_xlfn.LAMBDA(_xlpm.x,_xlpm.x+1),_xlpm.f(2))');
});

for (const fixture of [
  { name: "stored Excel LET", formula: "LET(x,1,x+1)", expected: { type: "number", value: 2 } },
  { name: "stored Excel captured lambda", formula: "LET(x,1,LAMBDA(y,x+y)(2))", expected: { type: "number", value: 3 } },
  { name: "stored Excel local function", formula: "LET(f,LAMBDA(x,x+1),f(2))", expected: { type: "number", value: 3 } },
] satisfies FormulaFixtureCase[]) test(fixture.name, () => verifyFormulaDocument(fixture, openFormulaDocument(fixture, buildFormulaDocument(fixture, true))));
