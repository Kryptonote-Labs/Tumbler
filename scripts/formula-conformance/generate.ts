import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildFormulaDocument, loadCategoryCases } from "./corpus.ts";

const args = process.argv.slice(2);
const argument = (name: string) => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
const output = resolve(argument("--output") ?? "compatibility-results/formula-conformance");
const selectedCategory = argument("--category");
const categories = (await loadCategoryCases()).filter(item => selectedCategory === undefined || item.category === selectedCategory);
if (categories.length === 0) throw new Error("No category fixture cases found.");
if (args.includes("--require-all") && categories.length !== 15) throw new Error(`Expected 15 category fixture modules, found ${categories.length}.`);
await mkdir(output, { recursive: true });
const manifest = [];
for (const { category, cases } of categories) {
  await mkdir(resolve(output, category), { recursive: true });
  for (const [index, fixture] of cases.entries()) {
    const file = `${category}/${String(index + 1).padStart(4, "0")}.xlsx`;
    const bytes = buildFormulaDocument(fixture);
    await writeFile(resolve(output, file), bytes);
    manifest.push({ category, index, file, sha256: createHash("sha256").update(bytes).digest("hex"), ...fixture });
  }
}
await writeFile(resolve(output, "manifest.json"), JSON.stringify({ formatVersion: 1, provenance: "Original synthetic MIT-licensed fixtures; category notes cite mathematical and Microsoft reference expectations.", fixtures: manifest }, null, 2) + "\n");
console.log(JSON.stringify({ output, categories: categories.length, documents: manifest.length, localCases: manifest.filter(item => !item.requiresService && item.oracle !== "host").length, hostCases: manifest.filter(item => item.requiresService || item.oracle === "host").length }, null, 2));
