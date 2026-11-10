import { coreFunctionCategories } from "./core-functions.ts";
import { categoryRegistries } from "./extended-functions.ts";
import { isHostFunction } from "./function-runtime.ts";

export const formulaFunctionCategories = [
  "financial", "date-time", "math", "statistical", "lookup", "database", "text", "logical",
  "information", "engineering", "cube", "compatibility", "web", "automation", "specialized",
] as const;

export type FormulaFunctionCategory = (typeof formulaFunctionCategories)[number];

/**
 * `local` functions calculate in Tumbler, though some inputs may still defer to
 * `FormulaFunctionServices`. `host` functions never produce a result without them.
 */
export type FormulaFunctionAvailability = "local" | "host";

export interface FormulaFunctionCatalogEntry {
  readonly name: string;
  readonly category: FormulaFunctionCategory;
  readonly availability: FormulaFunctionAvailability;
}

/**
 * Every built-in function the evaluator dispatches, alphabetically. Derived from
 * the core handler names and category registries, so it tracks what is callable.
 */
export const formulaFunctionCatalog: readonly FormulaFunctionCatalogEntry[] = buildCatalog();

function buildCatalog(): readonly FormulaFunctionCatalogEntry[] {
  const entries = new Map<string, FormulaFunctionCatalogEntry>();
  const add = (entry: FormulaFunctionCatalogEntry) => entries.set(entry.name, Object.freeze(entry));
  for (const [name, category] of Object.entries(coreFunctionCategories)) add({ name, category, availability: "local" });
  // Registries take precedence over core handlers at dispatch, and later registries over earlier ones.
  for (const [category, registry] of categoryRegistries) {
    for (const [name, handler] of registry) add({ name, category, availability: isHostFunction(handler) ? "host" : "local" });
  }
  return Object.freeze([...entries.values()].sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
}
