import { expect, test } from "bun:test";
import { openSpreadsheetArtifact, calculateSpreadsheetWorksheet } from "../../sheets/src/index.ts";
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

function namedLambdaWorkbook(formula: string): Uint8Array {
  const namespace = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  return buildWorkbookFixture({
    workbookXml:`<workbook xmlns="${namespace}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Data" sheetId="1" r:id="data"/></sheets><definedNames><definedName name="Identity">_xlfn.LAMBDA(_xlpm.items,_xlpm.items)</definedName><definedName name="AliasIdentity">Identity</definedName><definedName name="MakeValue">_xlfn.LAMBDA(COUNTED())</definedName><definedName name="AliasValue">MakeValue</definedName></definedNames></workbook>`,
    sheets:[{name:"Data",sheetId:1,relationshipId:"data",xml:`<worksheet xmlns="${namespace}"><sheetData><row r="1"><c r="A1"><v>2</v></c><c r="B1"><v>3</v></c><c r="C1"><f>${formula.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")}</f></c></row><row r="2"><c r="A2"><v>4</v></c><c r="B2"><v>5</v></c></row></sheetData></worksheet>`}],
  });
}

for (const name of ["Identity","AliasIdentity"]) test(`workbook-defined ${name} retains reference returns`, () => {
  const bytes = namedLambdaWorkbook(`SUMIF(${name}(A1:A2),">1")`), original = openSpreadsheetArtifact(bytes);
  for (const artifact of [original,openSpreadsheetArtifact(original.bytes())]) {
    expect(artifact.calculation.displayText("C1")).toBe("6");
    expect(artifact.calculation.diagnostics).toEqual([]);
  }
  const edited = original.editCell("A2",8);
  for (const artifact of [edited,openSpreadsheetArtifact(edited.bytes())]) {
    expect(artifact.calculation.displayText("C1")).toBe("10");
    expect(artifact.calculation.diagnostics).toEqual([]);
  }
  expect(original.bytes()).toEqual(bytes);
});

for (const base of ["A1:B2","LET(items,A1:B2,items)","LAMBDA(items,items)(A1:B2)","Identity(A1:B2)","AliasIdentity(A1:B2)","OFFSET(A1,0,0,2,2)", 'INDIRECT("A1:B2")']) {
  for (const axis of ["row","column"]) test(`INDEX reference ${axis} errors are final: ${base}`, () => {
    const formula = axis === "row" ? `INDEX(${base},COUNTED(),1)` : `INDEX(${base},1,COUNTED())`;
    const bytes = namedLambdaWorkbook(formula), original = openSpreadsheetArtifact(bytes), edited = original.editCell("A2",8);
    for (const artifact of [original,openSpreadsheetArtifact(bytes),edited,openSpreadsheetArtifact(edited.bytes())]) {
      let calls = 0;
      const calculated = calculateSpreadsheetWorksheet(artifact.worksheet,{functionRegistries:[new Map([["COUNTED",()=>({type:"number" as const,value:++calls === 1 ? 3 : 1})]])]});
      expect(calculated.displayText("C1")).toBe("#REF!");
      expect(calls).toBe(1);
      expect(calculated.diagnostics).toEqual([]);
    }
    expect(original.bytes()).toEqual(bytes);
  });
}

for (const formula of ["INDEX(INDEX(A1:B2,COUNTED(),1),1)","INDEX(LET(items,A1:B2,items),COUNTED())"]) {
  for (const first of [{type:"error" as const,value:"#N/A" as const},{type:"string" as const,value:"not an index"}]) test(`INDEX retains original argument error: ${formula} ${first.type}`, () => {
    const artifact = openSpreadsheetArtifact(namedLambdaWorkbook(formula));
    let calls = 0;
    const calculated = calculateSpreadsheetWorksheet(artifact.worksheet,{functionRegistries:[new Map([["COUNTED",()=> ++calls === 1 ? first : {type:"number" as const,value:1}]]) ]});
    expect(calculated.displayText("C1")).toBe(first.type === "error" ? "#N/A" : "#VALUE!");
    expect(calls).toBe(1);
    expect(calculated.diagnostics).toEqual([]);
  });
}

for (const name of ["MakeValue","AliasValue"]) test(`INDEX evaluates workbook callable ${name} once`, () => {
  const bytes = namedLambdaWorkbook(`INDEX(${name}(),1)`), original = openSpreadsheetArtifact(bytes);
  for (const artifact of [original,openSpreadsheetArtifact(bytes)]) {
    let calls = 0;
    const calculated = calculateSpreadsheetWorksheet(artifact.worksheet,{functionRegistries:[new Map([["COUNTED",()=>({type:"number" as const,value:++calls})]])]});
    expect(calculated.displayText("C1")).toBe("1");
    expect(calls).toBe(1);
    expect(calculated.diagnostics).toEqual([]);
  }
  expect(original.bytes()).toEqual(bytes);
});
