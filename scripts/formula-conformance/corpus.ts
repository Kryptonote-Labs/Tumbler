import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { FormulaScalarValue } from "../../packages/formulas/src/index.ts";
import { calculateSpreadsheetWorksheet, openSpreadsheetArtifact, type SpreadsheetArtifact, type SpreadsheetCalculationOptions } from "../../packages/sheets/src/index.ts";
import { buildWorkbookFixture } from "../../packages/sheets/test/workbook-fixture.ts";
import { nativeExcelFormula } from "./excel-spelling.ts";

export interface FormulaFixtureCase {
  readonly name: string;
  readonly formula: string;
  readonly expected: FormulaScalarValue | readonly (readonly FormulaScalarValue[])[];
  readonly cells?: Readonly<Record<string, FormulaScalarValue>>;
  readonly dateSystem?: "1900" | "1904";
  readonly tolerance?: number;
  readonly requiresService?: boolean;
  readonly oracle?: "excel" | "host" | "nondeterministic";
  readonly now?: string;
  readonly random?: number;
  readonly expectedDiagnostics?: readonly string[];
}

export interface CategoryFixtureCases {
  readonly category: string;
  readonly cases: readonly FormulaFixtureCase[];
}

const namespace = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const relationships = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

export async function loadCategoryCases(directory = resolve(import.meta.dir, "../../packages/formulas/test/fixtures")): Promise<readonly CategoryFixtureCases[]> {
  let entries: string[];
  try { entries = await readdir(directory); }
  catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw cause;
  }
  const categories: CategoryFixtureCases[] = [];
  for (const entry of entries.sort()) {
    if (!entry.endsWith(".ts") || entry.endsWith(".d.ts")) continue;
    const module = await import(pathToFileURL(resolve(directory, entry)).href) as { cases?: unknown };
    if (module.cases === undefined) continue;
    const category = entry.slice(0, -3);
    if (!Array.isArray(module.cases) || module.cases.length === 0) throw new Error(`${category}: cases must be a nonempty array.`);
    const names = new Set<string>();
    for (const fixture of module.cases as FormulaFixtureCase[]) {
      validateFixtureCase(fixture);
      if (names.has(fixture.name)) throw new Error(`${category}: duplicate fixture name ${fixture.name}.`);
      names.add(fixture.name);
    }
    categories.push({ category, cases: module.cases as FormulaFixtureCase[] });
  }
  return categories;
}

export function validateFixtureCase(fixture: FormulaFixtureCase): void {
  if (!fixture || typeof fixture.name !== "string" || fixture.name.length === 0) throw new TypeError("Fixture name is required.");
  if (typeof fixture.formula !== "string" || fixture.formula.length === 0 || fixture.formula.startsWith("=")) throw new TypeError(`${fixture.name}: use a nonempty stored formula without '='.`);
  const matrix = expectedMatrix(fixture);
  if (matrix.length === 0 || matrix[0]!.length === 0 || matrix.some(row => row.length !== matrix[0]!.length)) throw new TypeError(`${fixture.name}: expected must be a nonempty rectangular matrix or scalar.`);
  for (const row of matrix) for (const value of row) validateScalar(value);
  for (const [reference, value] of Object.entries(fixture.cells ?? {})) {
    address(reference);
    validateScalar(value);
  }
  if (fixture.now !== undefined && !Number.isFinite(Date.parse(fixture.now))) throw new TypeError(`${fixture.name}: invalid injected date.`);
  if (fixture.random !== undefined && !(fixture.random >= 0 && fixture.random < 1)) throw new TypeError(`${fixture.name}: RNG must be in [0,1).`);
  if (fixture.tolerance !== undefined && (!Number.isFinite(fixture.tolerance) || fixture.tolerance < 0)) throw new TypeError(`${fixture.name}: invalid tolerance.`);
}

export function expectedMatrix(fixture: FormulaFixtureCase): readonly (readonly FormulaScalarValue[])[] {
  return Array.isArray(fixture.expected) ? fixture.expected : [[fixture.expected as FormulaScalarValue]];
}

/** Original, uncached OOXML fixtures intentionally exercise Tumbler's own importer. */
export function buildFormulaDocument(fixture: FormulaFixtureCase, nativeExcel = false): Uint8Array {
  validateFixtureCase(fixture);
  const matrix = expectedMatrix(fixture);
  const formula = nativeExcel ? nativeExcelFormula(fixture.formula) : fixture.formula;
  const arrayAttributes = nativeExcel && Array.isArray(fixture.expected) ? ` t="array" ref="A1:${reference(matrix.length, matrix[0]!.length)}"` : "";
  const rows = new Map<number, { reference: string; column: number; value: FormulaScalarValue }[]>();
  for (const [reference, value] of Object.entries(fixture.cells ?? {})) {
    const cell = address(reference);
    const row = rows.get(cell.row) ?? [];
    row.push({ reference, column: cell.column, value });
    rows.set(cell.row, row);
  }
  const inputs = [...rows].sort(([a], [b]) => a - b).map(([row, cells]) => `<row r="${row}">${cells.sort((a, b) => a.column - b.column).map(cell => scalarXml(cell.reference, cell.value)).join("")}</row>`).join("");
  const sheet = (contents: string) => `<worksheet xmlns="${namespace}"><sheetData>${contents}</sheetData></worksheet>`;
  return buildWorkbookFixture({
    workbookXml: `<workbook xmlns="${namespace}" xmlns:r="${relationships}"><workbookPr date1904="${fixture.dateSystem === "1904" ? "1" : "0"}"/><sheets><sheet name="Inputs" sheetId="1" r:id="inputs"/><sheet name="Results" sheetId="2" r:id="results"/></sheets><calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>`,
    sheets: [
      { name: "Inputs", sheetId: 1, relationshipId: "inputs", xml: sheet(inputs) },
      { name: "Results", sheetId: 2, relationshipId: "results", xml: sheet(`<row r="1"><c r="A1"><f${arrayAttributes}>${escapeXml(formula)}</f></c></row>`) },
    ],
  });
}

export function openFormulaDocument(fixture: FormulaFixtureCase, bytes = buildFormulaDocument(fixture)): SpreadsheetArtifact {
  return openSpreadsheetArtifact(bytes, { sheet: "Results" });
}

/** Compare calculated overlays only: producer caches can never make this pass. */
export function verifyFormulaDocument(fixture: FormulaFixtureCase, artifact = openFormulaDocument(fixture), providedOptions: SpreadsheetCalculationOptions = {}): void {
  const options = {
    maxOperations: 1_000_000,
    ...providedOptions,
    ...(fixture.now === undefined ? {} : { now: () => new Date(fixture.now!) }),
    ...(fixture.random === undefined ? {} : { random: () => fixture.random! }),
  };
  const calculated = calculateSpreadsheetWorksheet(artifact.worksheet, options);
  const diagnostics = calculated.diagnostics.map(d => d.code);
  const expectedDiagnostics = fixture.expectedDiagnostics ?? [];
  if (JSON.stringify(diagnostics) !== JSON.stringify(expectedDiagnostics)) throw new Error(`${fixture.name}: diagnostics ${JSON.stringify(calculated.diagnostics)}; expected ${JSON.stringify(expectedDiagnostics)}.`);
  for (const [r, row] of expectedMatrix(fixture).entries()) {
    for (const [c, expected] of row.entries()) {
      const cell = reference(r + 1, c + 1);
      const raw = calculated.value(cell);
      const actual: FormulaScalarValue | undefined = raw === undefined ? undefined
        : raw.type === "string" ? { type: "string", value: raw.value }
        : raw.type === "number" ? { type: "number", value: raw.value }
        : raw.type === "boolean" ? { type: "boolean", value: raw.value }
        : raw.type === "error" ? { type: "error", value: raw.value as `#${string}` }
        : { type: "blank" };
      assertScalarResult(actual, expected, `${fixture.name}!${cell}`, fixture.tolerance);
    }
  }
}

export function assertScalarResult(actual: FormulaScalarValue | undefined, expected: FormulaScalarValue, label: string, tolerance?: number): void {
  if (actual?.type !== expected.type) throw new Error(`${label}: expected ${JSON.stringify(expected)}, calculated ${JSON.stringify(actual)}.`);
  if (actual.type === "number" && expected.type === "number") {
    const allowed = tolerance ?? Math.max(1, Math.abs(expected.value)) * 1e-11;
    if (!Number.isFinite(actual.value) || Math.abs(actual.value - expected.value) > allowed) throw new Error(`${label}: expected ${expected.value}, calculated ${actual.value} (tolerance ${allowed}).`);
  } else if (actual.type !== "blank" && expected.type !== "blank" && actual.value !== expected.value) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, calculated ${JSON.stringify(actual)}.`);
  }
}

export function reference(row: number, column: number): string {
  let letters = "";
  for (let value = column; value > 0; value = Math.floor((value - 1) / 26)) letters = String.fromCharCode(65 + (value - 1) % 26) + letters;
  return `${letters}${row}`;
}

function address(reference: string): { row: number; column: number } {
  const match = /^([A-Z]{1,3})([1-9][0-9]*)$/.exec(reference);
  if (!match) throw new TypeError(`Invalid fixture cell reference ${reference}.`);
  let column = 0;
  for (const character of match[1]!) column = column * 26 + character.charCodeAt(0) - 64;
  const row = Number(match[2]);
  if (column > 16384 || row > 1048576) throw new TypeError(`Fixture reference ${reference} exceeds worksheet bounds.`);
  return { row, column };
}

function scalarXml(reference: string, value: FormulaScalarValue): string {
  switch (value.type) {
    case "blank": return `<c r="${reference}"/>`;
    case "number": return `<c r="${reference}"><v>${value.value}</v></c>`;
    case "boolean": return `<c r="${reference}" t="b"><v>${value.value ? 1 : 0}</v></c>`;
    case "error": return `<c r="${reference}" t="e"><v>${escapeXml(value.value)}</v></c>`;
    case "string": return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value.value)}</t></is></c>`;
  }
}

function validateScalar(value: FormulaScalarValue): void {
  if (!value || !("type" in value)) throw new TypeError("Expected an explicitly typed scalar fixture value.");
  switch (value.type) {
    case "blank": return;
    case "number": if (typeof value.value === "number" && Number.isFinite(value.value)) return; break;
    case "boolean": if (typeof value.value === "boolean") return; break;
    case "string": if (typeof value.value === "string") return; break;
    case "error": if (typeof value.value === "string" && value.value.startsWith("#")) return; break;
  }
  throw new TypeError(`Invalid fixture scalar ${JSON.stringify(value)}.`);
}

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}
