import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { openSpreadsheetArtifact } from "../../packages/sheets/src/index.ts";
import { assertScalarResult, buildFormulaDocument, expectedMatrix, loadCategoryCases, reference } from "./corpus.ts";
import type { FormulaScalarValue } from "../../packages/formulas/src/index.ts";
import { tokenizeFormula } from "../../packages/formulas/src/index.ts";
import { nativeExcelFormula } from "./excel-spelling.ts";

const args = process.argv.slice(2);
const option = (name: string) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
const output = resolve(option("--output") ?? "compatibility-results/formula-oracle");
const workingFile = resolve(option("--working-file") ?? `${tmpdir()}/tumbler-formula-oracle-${process.pid}.xlsx`);
const selected = option("--category");
const selectedCase = option("--case");
const limit = Number(option("--limit") ?? "Infinity");
const timeout = Number(option("--timeout-ms") ?? "60000");
await mkdir(output, { recursive: true });
const script = resolve(import.meta.dir, "recalculate.applescript");
interface OracleResult { category: string; name: string; formula: string; status: string; detail?: string; version?: string; inputHash?: string; expectationHash?: string }
const results: OracleResult[] = [];
const resumePath = option("--resume");
const previous = new Map<string, OracleResult>();
if (resumePath) {
  const report = JSON.parse(await readFile(resolve(resumePath), "utf8")) as { results: OracleResult[] };
  for (const result of report.results) previous.set(`${result.category}\u0000${result.name}`, result);
}
let total = 0;
const hostFunctions = new Set(["STOCKHISTORY", "PY", "FIELDVALUE", "GETPIVOTDATA", "RTD", "IMAGE", "TRANSLATE", "DETECTLANGUAGE", "CALL", "REGISTER.ID", "WEBSERVICE"]);
for (const category of await loadCategoryCases()) {
  if (selected && category.category !== selected) continue;
  for (const [index, fixture] of category.cases.entries()) {
    if (selectedCase && fixture.name !== selectedCase) continue;
    if (total >= limit) break;
    const base = { category: category.category, name: fixture.name, formula: fixture.formula };
    if (fixture.requiresService || fixture.oracle === "host" || fixture.oracle === "nondeterministic") {
      results.push({ ...base, status: "excluded", detail: "Explicit host model or injected clock/RNG; not an independently observed native result." });
      continue;
    }
    if (tokenizeFormula(fixture.formula).some(token => token.kind === "identifier" && hostFunctions.has(token.value.toUpperCase().replace(/^_XLFN\./, "").replace(/^_XLWS\./, "")))) {
      results.push({ ...base, status: "provider-unavailable", detail: "Native execution needs a cloud/data/automation capability absent from this isolated synthetic workbook; validation remains covered by local handler tests." });
      continue;
    }
    if (category.category === "web" || category.category === "automation" || category.category === "cube") {
      results.push({ ...base, status: "platform-unavailable", detail: "Requires Windows Excel, an unavailable add-in, or an OLAP connection absent from this Mac oracle." });
      continue;
    }
    const bytes = buildFormulaDocument(fixture, true);
    const inputHash = createHash("sha256").update(bytes).digest("hex");
    const expectationHash = createHash("sha256").update(JSON.stringify([fixture.expected, fixture.tolerance])).digest("hex");
    const prior = previous.get(`${category.category}\u0000${fixture.name}`);
    if (prior?.status === "pass" && prior.inputHash === inputHash && prior.expectationHash === expectationHash) { results.push(prior); continue; }
    total++;
    const directory = resolve(output, category.category);
    await mkdir(directory, { recursive: true });
    const stem = String(index + 1).padStart(4, "0");
    Object.assign(base, { inputHash, expectationHash });
    await writeFile(resolve(output, "progress.json"), JSON.stringify({ ...base, index, status: "recalculating" }, null, 2) + "\n");
    await writeFile(resolve(directory, `${stem}.input.xlsx`), bytes);
    // Reusing an explicitly granted generated file avoids repeated Mac sandbox
    // file-picker grants. User documents are never opened or overwritten.
    await writeFile(workingFile, bytes);
    const child = Bun.spawn(["osascript", script, workingFile, nativeExcelFormula(fixture.formula)], { stdout: "pipe", stderr: "pipe" });
    const timer = setTimeout(() => child.kill(), timeout);
    let version: string;
    try {
      const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
      if (code !== 0) throw new Error(`Native recalculation failed (${code}): ${stderr.trim()}. A Mac Excel file-access dialog may need a one-time grant for the generated working file.`);
      version = stdout.trim();
    } finally { clearTimeout(timer); }
    if (version === "ENTRY_REJECTED") {
      results.push({ ...base, status: "native-entry-rejected", detail: "Excel rejected formula entry before calculation; not counted as a matching native cell-error result." });
      await writeFile(resolve(output, "results.json"), JSON.stringify({ workingFile, results }, null, 2) + "\n");
      continue;
    }
    await copyFile(workingFile, resolve(directory, `${stem}.excel.xlsx`));
    const artifact = openSpreadsheetArtifact(new Uint8Array(await readFile(workingFile)), { sheet: "Results" });
    try {
      if (!artifact.worksheet.cell("A1")?.formula) throw new Error("Excel removed or did not retain the formula anchor.");
      for (const [row, values] of expectedMatrix(fixture).entries()) {
        for (const [column, expected] of values.entries()) {
          const address = reference(row + 1, column + 1);
          const raw = artifact.worksheet.cell(address)?.value;
          const actual: FormulaScalarValue = raw === undefined || raw.type === "blank" ? { type: "blank" }
            : raw.type === "error" ? { type: "error", value: raw.value as `#${string}` }
            : raw.type === "number" ? { type: "number", value: raw.value }
            : raw.type === "boolean" ? { type: "boolean", value: raw.value }
            : { type: "string", value: raw.value };
          assertScalarResult(actual, expected, `${fixture.name}!${address}`, fixture.tolerance);
        }
      }
      results.push({ ...base, status: "pass", version });
    } catch (cause) {
      results.push({ ...base, status: "mismatch", version, detail: String(cause) });
    }
    if (total % 25 === 0) console.log(`${total} native workbooks checked; ${results.filter(result => result.status === "mismatch").length} mismatches`);
    await writeFile(resolve(output, "results.json"), JSON.stringify({ workingFile, results }, null, 2) + "\n");
  }
}
const counts: Record<string, number> = {};
for (const result of results) counts[result.status] = (counts[result.status] ?? 0) + 1;
await writeFile(resolve(output, "results.json"), JSON.stringify({ workingFile, counts, results }, null, 2) + "\n");
console.log(JSON.stringify({ output, counts }, null, 2));
if (counts.mismatch) process.exitCode = 1;
