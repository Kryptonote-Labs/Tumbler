import type { FormulaCellAddress, FormulaWorkbookSource } from "./evaluator.ts";
import type { FunctionReference } from "./function-runtime.ts";

/** Resolve absolute and relative R1C1 ranges without reading their cells. */
export function r1c1Reference(target: string, address: FormulaCellAddress, source: Pick<FormulaWorkbookSource, "resolveSheet">): FunctionReference | undefined {
  const match = /^(?:(?:'((?:[^']|'')+)'|([^!]+))!)?([^!]+)$/.exec(target);
  if (!match) return undefined;
  const name = match[1]?.replaceAll("''", "'") ?? match[2];
  if (name?.includes("[")) return undefined;
  const sheet = name === undefined ? address.sheet : source.resolveSheet(address.sheet, name);
  if (sheet === undefined) return undefined;
  const parts = match[3]!.split(":");
  if (parts.length > 2) return undefined;
  const axis = (token: string, base: number) => token.startsWith("[") ? base + Number(token.slice(1, -1)) : token === "" ? base : Number(token);
  const parse = (part: string) => {
    const cell = /^R(\[[+-]?\d+\]|\d*)C(\[[+-]?\d+\]|\d*)$/i.exec(part);
    return cell ? { row: axis(cell[1]!, address.row), column: axis(cell[2]!, address.column) } : undefined;
  };
  const start = parse(parts[0]!), end = parse(parts[1] ?? parts[0]!);
  if (!start || !end) return undefined;
  return { sheet, firstRow: Math.min(start.row, end.row), firstColumn: Math.min(start.column, end.column), height: Math.abs(end.row - start.row) + 1, width: Math.abs(end.column - start.column) + 1 };
}
