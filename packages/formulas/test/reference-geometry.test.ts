import { expect, test } from "bun:test";
import { calculateFormulas, parseFormula, type FormulaWorkbookSource } from "../src/index.ts";
import { buildFormulaDocument, openFormulaDocument, verifyFormulaDocument, type FormulaFixtureCase } from "../../../scripts/formula-conformance/corpus.ts";

for (const fixture of [
  {name: "whole column keeps worksheet row count", formula: "ROWS(Inputs!A:A)", expected: {type: "number", value: 1048576}},
  {name: "offset dimensions avoid materializing values", formula: "ROWS(OFFSET(Inputs!B1,0,0,100001,1))", expected: {type: "number", value: 100001}},
  {name: "nested index retains large reference geometry", formula: "ROWS(INDEX(INDEX(OFFSET(Inputs!B1,0,0,100001,1),0),0))", expected: {type: "number", value: 100001}},
  {name: "indirect dimensions avoid materializing values", formula: 'ROWS(INDIRECT("Inputs!B1:B100001"))', expected: {type: "number", value: 100001}},
  {name: "nested relative r1c1 row", formula: 'ROW(INDIRECT("R[1]C[1]",FALSE))', expected: {type: "number", value: 2}},
  {name: "nested relative r1c1 column", formula: 'COLUMN(INDIRECT("R[1]C[1]",FALSE))', expected: {type: "number", value: 2}},
  {name: "mixed r1c1 absolute row keeps bracketed column", formula: 'INDIRECT("Inputs!R1C[1]",FALSE)', cells:{B1:{type:"number",value:7}}, expected: {type: "number", value: 7}},
  {name: "mixed r1c1 current row keeps bracketed column", formula: 'INDIRECT("Inputs!RC[1]",FALSE)', cells:{B1:{type:"number",value:7}}, expected: {type: "number", value: 7}},
  {name: "whole row keeps worksheet column count", formula: "COLUMNS(Inputs!1:1)", expected: {type: "number", value: 16384}},
  {name: "whole column index beyond used extent", formula: "INDEX(Inputs!A:A,100)", expected: {type: "number", value: 0}},
  {name: "nested INDIRECT omitted style defaults to A1", formula: 'ROW(INDIRECT("Inputs!B1",))', expected: {type: "number", value: 1}},
] satisfies FormulaFixtureCase[]) test(fixture.name, () => {
  const bytes = buildFormulaDocument(fixture);
  const artifact = openFormulaDocument(fixture, bytes);
  verifyFormulaDocument(fixture, artifact);
  verifyFormulaDocument(fixture, openFormulaDocument(fixture, artifact.editCell("D2", 1).bytes()));
  expect(artifact.bytes()).toEqual(bytes);
});

for (const formula of [
  "ROWS(LET(items,SEQUENCE(1+INT(RAND()*2)),items))",
  "COLUMNS(LAMBDA(items,items)(SEQUENCE(1,1+INT(RAND()*2))))",
  "ROWS(INDEX(LET(items,SEQUENCE(1+INT(RAND()*2)),items),0))",
]) test(`dimension probes evaluate computed arrays once: ${formula}`, () => {
  let calls = 0;
  const address = { sheet: "Results", row: 1, column: 1 };
  const result = calculateFormulas({formulaCells:[{address,formula}], cell:()=>({formula,value:{type:"blank"}}), resolveSheet:(_,name)=>name}, {random:()=>++calls === 1 ? 0.1 : 0.9});
  expect(result.value(address)).toEqual({type:"number",value:1});
  expect(calls).toBe(1);
  expect(result.diagnostics).toEqual([]);
});

for (const formula of ['ROWS(INDEX(Inputs!A1:A2,1+INT(RAND()*3)))','ROWS(OFFSET(Inputs!A1,0,0,INT(RAND()*2),1))']) test(`failed reference probes preserve their first evaluation: ${formula}`, () => {
  let calls=0;
  const address={sheet:"Results",row:1,column:1};
  const result=calculateFormulas({formulaCells:[{address,formula}],cell:at=>at.sheet==="Results" ? {formula,value:{type:"blank"}} : {formula:undefined,value:{type:"number",value:7}},resolveSheet:(_,name)=>name},{random:()=>{calls++;return formula.includes("INDEX") ? calls===1 ? .9 : .1 : calls===1 ? .1 : .9;}});
  expect(result.value(address)).toEqual({type:"error",value:"#REF!"});
  expect(calls).toBe(1);
  expect(result.diagnostics).toEqual([]);
});

for (const formula of [
  'ROWS(INDIRECT("Revenue",FALSE))',
  'COLUMNS(INDIRECT("Revenue",FALSE))',
  'ROWS(INDIRECT("Inputs!Scoped",FALSE))',
  'ROWS(INDIRECT("Inputs!Scoped"))',
  'LET(items,INDIRECT("Inputs!Scoped",FALSE),ROWS(items))',
  'LET(items,INDIRECT("Inputs!Scoped"),ROWS(items))',
]) test(`INDIRECT names share sheet scope and geometry in both styles: ${formula}`, () => {
  const address={sheet:"Results",row:1,column:1};
  const source:FormulaWorkbookSource={formulaCells:[{address,formula}],cell:at=>at.sheet==="Results" ? {formula,value:{type:"blank"}} : {formula:undefined,value:{type:"number",value:7}},resolveSheet:(_,name)=>name,resolveName:(name,at)=>name==="Revenue" ? parseFormula("Inputs!B1:C2").expression : name==="Scoped" && at.sheet==="Inputs" ? parseFormula("B1:C2").expression : undefined};
  const result=calculateFormulas(source);
  expect(result.value(address)).toEqual({type:"number",value:2});
  expect(result.diagnostics).toEqual([]);
});

for (const target of ["MissingName","not-a-reference","A1+1","XFE1"]) test(`INDIRECT invalid targets retain REF errors: ${target}`, () => {
  const address={sheet:"Results",row:1,column:1},formula=`ROWS(INDIRECT("${target}"))`;
  const result=calculateFormulas({formulaCells:[{address,formula}],cell:()=>({formula,value:{type:"blank"}}),resolveSheet:(_,name)=>name,resolveName:()=>undefined});
  expect(result.value(address)).toEqual({type:"error",value:"#REF!"});
  expect(result.diagnostics).toEqual([]);
});
