import { expect, test } from "bun:test";
import { createCubeSnapshotServices, type FormulaFunctionServices, type FormulaScalarValue, type FunctionValue } from "../src/index.ts";
import { calculateSpreadsheetWorksheet, openSpreadsheetArtifact } from "../../sheets/src/index.ts";
import { buildWorkbookFixture } from "../../sheets/test/workbook-fixture.ts";
import { buildFormulaDocument, loadCategoryCases, openFormulaDocument, verifyFormulaDocument, type FormulaFixtureCase } from "../../../scripts/formula-conformance/corpus.ts";
import { modeledAutomationServices } from "./fixtures/automation.ts";
import { cubeFixtureConnections } from "./fixtures/cube.ts";

const n = (value: number): FormulaScalarValue => ({ type: "number", value });
const s = (value: string): FormulaScalarValue => ({ type: "string", value });
const e = (value: `#${string}`): FormulaScalarValue => ({ type: "error", value });
const text = (value: FunctionValue | undefined) => value && !("kind" in value) && value.type === "string" ? value.value : undefined;

// Finite synthetic providers verify the real engine/host boundary. They perform
// no networking, DLL loading, Python execution, or machine environment queries.
function model(category: string, fixture: FormulaFixtureCase): FormulaFunctionServices {
  if (category === "automation") return modeledAutomationServices;
  if (category === "cube") return createCubeSnapshotServices(cubeFixtureConnections, { operation() {}, maxArrayCells: 10_000 });
  return { invoke(name, args, address) {
    expect(address.row).toBe(1);
    expect(address.column).toBe(1);
    if (name === "FIELDVALUE" && text(args[0]) === "Contoso") return ({ Price: n(125.5), Name: s("Contoso Corporation"), Date: n(45292) } as Record<string, FormulaScalarValue>)[text(args[1]) ?? ""] ?? e("#FIELD!");
    if (name === "PY") {
      switch (text(args[0])) {
        case "1 + 2": return n(3);
        case "'Hello' + ' ' + 'World'": return s("Hello World");
        case "[[1, 2], [3, 4]]": return { kind: "array", rows: [[n(1), n(2)], [n(3), n(4)]] };
        case 'xl("Inputs!A1") * 2': {
          const input = fixture.cells?.A1;
          return input?.type === "number" ? n(input.value * 2) : e("#PYTHON!");
        }
        case "1 / 0": return e("#PYTHON!");
      }
    }
    if (name === "CELL" && text(args[0]) === "format") return s("G");
    if (name === "INFO" && text(args[0]) === "system") return s("mac");
    if (name === "STOCKHISTORY" && text(args[0]) === "XNAS:TEST") return { kind: "array", rows: [[s("Date"), s("Close")], [n(45000), n(123.5)]] };
    if (name === "GETPIVOTDATA" && text(args[0]) === "Sales" && text(args[2]) === "Region" && text(args[3]) === "East") return n(125);
    if (name === "RTD" && text(args[0]) === "Quotes.Feed" && text(args[2]) === "ABC") return n(42.5);
    if (name === "IMAGE" && text(args[0]) === "https://example.org/picture.png") return s("[image: Product]");
    if (name === "TRANSLATE" && text(args[0]) === "Hello" && text(args[1]) === "en" && text(args[2]) === "fr") return s("Bonjour");
    if (name === "DETECTLANGUAGE" && text(args[0]) === "Bonjour") return s("fr");
    if (name === "PHONETIC" && text(args[0]) === "東京") return s("とうきょう");
    if (name === "WEBSERVICE" && text(args[0]) === "https://example.test/quote") return s("<quote><price>42.75</price></quote>");
    return undefined;
  } };
}

for (const { category, cases } of await loadCategoryCases()) {
  for (const fixture of cases.filter(fixture => fixture.requiresService || category === "specialized")) test(`host integration uncached XLSX: ${category}: ${fixture.name}`, () => {
    const bytes = buildFormulaDocument(fixture);
    const original = bytes.slice();
    const artifact = openFormulaDocument(fixture, bytes);
    verifyFormulaDocument(fixture, artifact, { services: model(category, fixture) });
    expect(artifact.bytes()).toEqual(original);
    const edited = artifact.editCell("XFD1048576", "unrelated edit");
    verifyFormulaDocument(fixture, edited, { services: model(category, fixture) });
    verifyFormulaDocument(fixture, openFormulaDocument(fixture, edited.bytes()), { services: model(category, fixture) });
  });
}

test("unavailable hosts preserve producer caches; available hosts calculate separate overlays", () => {
  const namespace = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const bytes = buildWorkbookFixture({ sheets: [{ name: "Results", sheetId: 1, relationshipId: "results", xml: `<worksheet xmlns="${namespace}"><sheetData><row r="1"><c r="A1"><f>FIELDVALUE("Contoso","Price")</f><v>42</v></c></row></sheetData></worksheet>` }] });
  const artifact = openSpreadsheetArtifact(bytes);
  expect(artifact.calculation.value("A1")).toBeUndefined();
  expect(artifact.calculation.displayText("A1")).toBe("42");
  expect(artifact.calculation.diagnostics).toHaveLength(1);
  const available = calculateSpreadsheetWorksheet(artifact.worksheet, { services: model("specialized", { name: "cache", formula: 'FIELDVALUE("Contoso","Price")', expected: n(125.5) }) });
  expect(available.value("A1")).toMatchObject(n(125.5));
  expect(available.diagnostics).toEqual([]);
  expect(artifact.worksheet.cell("A1")?.value).toMatchObject(n(42));
  expect(artifact.bytes()).toEqual(bytes);
});
