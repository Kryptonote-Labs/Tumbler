import { expect, test } from "bun:test";
import { buildFormulaDocument, openFormulaDocument, verifyFormulaDocument, type FormulaFixtureCase } from "../../../scripts/formula-conformance/corpus.ts";

for (const fixture of [
  {name: "whole column keeps worksheet row count", formula: "ROWS(Inputs!A:A)", expected: {type: "number", value: 1048576}},
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
