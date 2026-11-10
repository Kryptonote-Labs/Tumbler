import { expect, test } from "bun:test";
import { openSpreadsheetArtifact } from "../../sheets/src/index.ts";
import { buildWorkbookFixture } from "../../sheets/test/workbook-fixture.ts";

for (const [formula, input, expected] of [
  ["LET(amount,A1,amount)", '<v>2</v>', "2"],
  ["LET(amount,A1,amount+1)", '<v>2</v>', "3"],
  ["LAMBDA(amount,amount)(A1)", '<v>2</v>', "2"],
  ["LAMBDA(amount,amount+1)(A1)", '<v>2</v>', "3"],
  ["LET(fn,LAMBDA(amount,amount),fn(A1))", '<v>2</v>', "2"],
  ["LET(fn,LAMBDA(amount,amount),SUM(fn(A1)))", '<is><t>7</t></is>', "0"],
]) test(`logical reference bindings stay scalar at merged anchors: ${formula}`, () => {
  const namespace = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const bytes = buildWorkbookFixture({sheets:[{name:"Data",sheetId:1,relationshipId:"data",xml:`<worksheet xmlns="${namespace}"><sheetData><row r="1"><c r="A1"${input!.startsWith("<is>") ? ' t="inlineStr"' : ""}>${input}</c><c r="C1"><f>${formula}</f></c></row></sheetData><mergeCells count="1"><mergeCell ref="C1:D1"/></mergeCells></worksheet>`}]});
  const original = openSpreadsheetArtifact(bytes);
  for (const artifact of [original,openSpreadsheetArtifact(original.bytes())]) {
    expect(artifact.calculation.displayText("C1")).toBe(expected!);
    expect(artifact.calculation.arrayValue("C1")).toBeUndefined();
    expect(artifact.calculation.diagnostics).toEqual([]);
  }
  const edited = original.editCell("A1", 3);
  for (const artifact of [edited,openSpreadsheetArtifact(edited.bytes())]) {
    expect(artifact.calculation.displayText("C1")).toBe(formula!.includes("+1") ? "4" : "3");
    expect(artifact.calculation.arrayValue("C1")).toBeUndefined();
  }
  expect(original.bytes()).toEqual(bytes);
});

import { buildFormulaDocument, openFormulaDocument, verifyFormulaDocument, type FormulaFixtureCase } from "../../../scripts/formula-conformance/corpus.ts";
for (const fixture of [
  {name:"LET range binding supplies criteria aggregate geometry",formula:'LET(items,Inputs!A1:A2,SUMIF(items,">1"))',expected:{type:"number",value:6}},
  {name:"named lambda return supplies criteria aggregate geometry",formula:'LET(fn,LAMBDA(items,items),SUMIF(fn(Inputs!A1:A2),">1"))',expected:{type:"number",value:6}},
  {name:"expression lambda return supplies criteria aggregate geometry",formula:'SUMIF(LAMBDA(items,items)(Inputs!A1:A2),">1")',expected:{type:"number",value:6}},
  {name:"LET reference return supplies criteria aggregate geometry",formula:'SUMIF(LET(items,Inputs!A1:A2,items),">1")',expected:{type:"number",value:6}},
  {name:"LET computed array does not invent reference geometry",formula:'LET(items,{2;4},SUMIF(items,">1"))',expected:{type:"error",value:"#VALUE!"}},
] satisfies FormulaFixtureCase[]) test(fixture.name, () => {
  const input: FormulaFixtureCase = {...fixture,cells:{A1:{type:"number",value:2},A2:{type:"number",value:4}}};
  const bytes = buildFormulaDocument(input), artifact = openFormulaDocument(input,bytes);
  verifyFormulaDocument(input,artifact);
  verifyFormulaDocument(input,openFormulaDocument(input,artifact.editCell("D5",1).bytes()));
  expect(artifact.bytes()).toEqual(bytes);
});

import { calculateFormulas, type FormulaWorkbookSource } from "../src/index.ts";
test("INDEX evaluates a computed lambda or LET input once", () => {
  for (const formula of ["INDEX(LAMBDA(COUNTED())(),1)", "LET(fn,LAMBDA(COUNTED()),INDEX(fn(),1))", "INDEX(LET(amount,COUNTED(),amount),1)"]) {
    let calls = 0;
    const address = {sheet:"Data",row:1,column:1};
    const source: FormulaWorkbookSource = {formulaCells:[{address,formula}],resolveSheet:(_,name)=>name,cell:()=>({formula,value:{type:"blank"}})};
    const calculated = calculateFormulas(source,{functionRegistries:[new Map([["COUNTED",()=>({type:"number" as const,value:++calls})]])]});
    expect(calculated.value(address)).toEqual({type:"number",value:1});
    expect(calls).toBe(1);
    expect(calculated.diagnostics).toEqual([]);
  }
});
