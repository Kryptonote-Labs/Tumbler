import type { FormulaExpression } from "./ast.ts";
import type { FormulaCellAddress, FormulaScalarValue, FormulaWorkbookSource } from "./evaluator.ts";
import { functionError, type FunctionReference } from "./function-runtime.ts";
import { FormulaParseError, parseFormula } from "./parser.ts";
import { r1c1Reference } from "./r1c1-reference.ts";

/** Shared INDIRECT text resolution for geometry consumers and value reads. */
export function indirectReference(
  target: string,
  a1: boolean,
  address: FormulaCellAddress,
  source: FormulaWorkbookSource,
  resolve: (expression: FormulaExpression, sheet: string) => FunctionReference | FormulaScalarValue,
  unavailable: (message: string) => never,
): FunctionReference | FormulaScalarValue {
  if (!a1) {
    const reference = r1c1Reference(target, address, source);
    if (reference) return reference;
  }
  // A column name can contain !, so split only a sheet prefix before [.
  const qualified = /^(?:'((?:[^']|'')+)'|([^!\[']+))!(.*)$/.exec(target);
  const sheetName = qualified?.[1]?.replaceAll("''", "'") ?? qualified?.[2];
  if (sheetName?.includes("[")) return unavailable("INDIRECT external workbook requires a host reference resolver");
  if (/^\[[^\]]+\][^!]*!/.test(target)) return unavailable("INDIRECT external workbook requires a host reference resolver");
  const sheet = sheetName === undefined ? address.sheet : source.resolveSheet(address.sheet, sheetName);
  if (sheet === undefined) return functionError("#REF!");
  const token = qualified?.[3] ?? target;
  const named = (structured: boolean): FunctionReference | FormulaScalarValue => {
    if (!source.resolveName) return structured ? functionError("#REF!") : unavailable("INDIRECT defined names require source.resolveName");
    const definition = source.resolveName(token, { ...address, sheet });
    if (!definition) return functionError("#REF!");
    const reference = "kind" in definition ? resolve(definition, sheet) : definition;
    return "type" in reference ? functionError("#REF!") : reference;
  };
  if (/^[^\[\]]+\[.*\]$/.test(token)) return named(true);
  let expression: FormulaExpression;
  try { expression = parseFormula(token).expression; }
  catch (cause) { if (cause instanceof FormulaParseError) return functionError("#REF!"); throw cause; }
  if (expression.kind === "name") {
    if (a1 && /^\$?[A-Za-z]{1,3}\$?[1-9]\d*$/.test(token)) return functionError("#REF!");
    return named(false);
  }
  if (!a1 || expression.kind !== "reference") return functionError("#REF!");
  const reference = resolve(expression, sheet);
  return "type" in reference ? functionError("#REF!") : reference;
}
