import { expect, test } from "bun:test";
import { buildFormulaDocument, openFormulaDocument, verifyFormulaDocument, type FormulaFixtureCase } from "../../../scripts/formula-conformance/corpus.ts";

for (const [formula,expected,tolerance] of [
  ['FTEST({1;1.00000001;1.00000002},{1;2;3})',2.0000000312012612e-16,3e-28],
  ['FTEST({1;2;3},{1;1.00000001;1.00000002})',2.0000000312012612e-16,3e-28],
  ['CHIDIST(1000000,1000000)',.4998119368034871,1e-10],
  ['GAMMADIST(1000000,1000000,1,TRUE)',.5001329807607413,1e-10],
  ['POISSON(1000000,1000000,TRUE)',.5002659614864149,1e-10],
] as const) test(`legacy aliases retain stable canonical kernels: ${formula}`, () => {
  const fixture:FormulaFixtureCase={name:"legacy stable kernel",formula,expected:{type:"number",value:expected},tolerance};
  const bytes=buildFormulaDocument(fixture),artifact=openFormulaDocument(fixture,bytes);
  verifyFormulaDocument(fixture,artifact);
  verifyFormulaDocument(fixture,openFormulaDocument(fixture,artifact.editCell("D5",1).bytes()));
  expect(artifact.bytes()).toEqual(bytes);
});

for (const formula of ['PERCENTILE(Inputs!A1:A3,Inputs!B1)', 'QUARTILE(Inputs!A1:A3,Inputs!B2)', 'RANK(Inputs!B2,Inputs!A1:A3)']) test(`legacy numeric controls accept single-cell references: ${formula}`, () => {
  const fixture: FormulaFixtureCase = { name:"legacy numeric control",formula,cells:{A1:{type:"number",value:2},A2:{type:"number",value:4},A3:{type:"number",value:6},B1:{type:"number",value:0.5},B2:{type:"number",value:2}},expected:{type:"number",value:formula.startsWith("RANK") ? 3 : 4} };
  const bytes=buildFormulaDocument(fixture),artifact=openFormulaDocument(fixture,bytes);
  verifyFormulaDocument(fixture,artifact);
  verifyFormulaDocument(fixture,openFormulaDocument(fixture,artifact.editCell("D5",1).bytes()));
  expect(artifact.bytes()).toEqual(bytes);
});

for (const name of ["STDEV", "STDEVP", "VAR", "VARP"]) {
  for (const reference of ['INDIRECT("Inputs!A1")', "OFFSET(Inputs!A1,0,0)", "INDEX(Inputs!A1:A2,1)", "LET(items,Inputs!A1,items)", "LAMBDA(items,items)(Inputs!A1)"]) {
    for (const value of [{ type: "boolean", value: true }, { type: "string", value: "1" }] as const) {
      test(`${name} ignores ${value.type} through ${reference}`, () => {
        const sample = name === "STDEV" || name === "VAR";
        const fixture: FormulaFixtureCase = { name: "legacy reference coercion", formula: `${name}(${reference},2)`, cells: { A1: value }, expected: sample ? { type: "error", value: "#DIV/0!" } : { type: "number", value: 0 } };
        const bytes = buildFormulaDocument(fixture), artifact = openFormulaDocument(fixture, bytes);
        verifyFormulaDocument(fixture, artifact);
        verifyFormulaDocument(fixture, openFormulaDocument(fixture, artifact.editCell("D5", 1).bytes()));
        expect(artifact.bytes()).toEqual(bytes);
      });
    }
  }
}
