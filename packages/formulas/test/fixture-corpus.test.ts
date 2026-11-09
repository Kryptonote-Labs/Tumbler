import { describe, expect, test } from "bun:test";
import { buildFormulaDocument, loadCategoryCases, openFormulaDocument, validateFixtureCase, verifyFormulaDocument, type FormulaFixtureCase } from "../../../scripts/formula-conformance/corpus.ts";

const baselineCases: readonly FormulaFixtureCase[] = [
  { name: "cross-sheet numeric aggregate", formula: "SUM(Inputs!A1:A3)", expected: { type: "number", value: 17 }, cells: { A1: { type: "number", value: 3 }, A2: { type: "number", value: 5 }, A3: { type: "number", value: 9 } } },
  { name: "escaped strings", formula: 'CONCAT(Inputs!A1," & < > ",Inputs!A2)', expected: { type: "string", value: '"quoted" & < > 🙂' }, cells: { A1: { type: "string", value: '"quoted"' }, A2: { type: "string", value: "🙂" } } },
  { name: "error result", formula: "1/0", expected: { type: "error", value: "#DIV/0!" } },
  { name: "1904 workbook date system", formula: "DATE(1904,1,1)", expected: { type: "number", value: 0 }, dateSystem: "1904" },
];

function documentTests(category: string, cases: readonly FormulaFixtureCase[]): void {
  describe(`generated uncached XLSX: ${category}`, () => {
    for (const fixture of cases) {
      if (fixture.requiresService || fixture.oracle === "host") continue;
      test(fixture.name, () => {
        const bytes = buildFormulaDocument(fixture);
        const original = bytes.slice();
        const artifact = openFormulaDocument(fixture, bytes);
        expect(artifact.worksheet.cell("A1")?.formula).toBe(fixture.formula);
        expect(artifact.worksheet.cell("A1")?.value).toMatchObject({ type: "blank" });
        verifyFormulaDocument(fixture, artifact);
        expect(artifact.bytes()).toEqual(original);
        verifyFormulaDocument(fixture, openFormulaDocument(fixture, artifact.bytes()));
        // A distant unrelated edit must preserve and recalculate the real formula.
        const edited = artifact.editCell("XFD1048576", "preservation probe");
        expect(edited.worksheet.cell("A1")?.formula).toBe(fixture.formula);
        verifyFormulaDocument(fixture, edited);
        verifyFormulaDocument(fixture, openFormulaDocument(fixture, edited.bytes()));
        expect(bytes).toEqual(original);
      });
    }
  });
}

documentTests("baseline harness verification", baselineCases);
for (const category of await loadCategoryCases()) documentTests(category.category, category.cases);

test("fixture corpus rejects malformed input instead of silently dropping cases", () => {
  expect(() => validateFixtureCase({ name: "bad", formula: "=SUM(1)", expected: { type: "number", value: 1 } })).toThrow();
  expect(() => validateFixtureCase({ name: "bad", formula: "1", expected: [[{ type: "number", value: 1 }], []] })).toThrow();
  expect(() => validateFixtureCase({ name: "bad", formula: "1", expected: { type: "number", value: Number.NaN } })).toThrow();
});
