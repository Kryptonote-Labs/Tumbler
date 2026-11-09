import {
  functionMatrix,
  functionScalar,
  functionText,
  type FunctionContext,
} from "../../function-runtime.ts";
import type { FormulaScalarValue } from "../../evaluator.ts";
import { register, check, ExcelError } from "./runtime.ts";

function glob(pattern: string, text: string, c: FunctionContext): boolean {
  const tokens: (
    { kind: "star" } | { kind: "any" } | { kind: "literal"; value: string }
  )[] = [];
  for (let i = 0; i < pattern.length; i++) {
    const x = pattern[i]!;
    if (x === "~" && i + 1 < pattern.length)
      tokens.push({ kind: "literal", value: pattern[++i]! });
    else
      tokens.push(
        x === "*"
          ? { kind: "star" }
          : x === "?"
            ? { kind: "any" }
            : { kind: "literal", value: x },
      );
  }
  let p = 0,
    t = 0,
    star = -1,
    retry = 0;
  while (t < text.length) {
    c.operation();
    const token = tokens[p];
    if (
      token?.kind === "any" ||
      (token?.kind === "literal" && token.value === text[t])
    ) {
      p++;
      t++;
    } else if (token?.kind === "star") {
      star = p++;
      retry = t;
    } else if (star >= 0) {
      p = star + 1;
      t = ++retry;
    } else return false;
  }
  while (tokens[p]?.kind === "star") p++;
  return p === tokens.length;
}
function matches(
  value: FormulaScalarValue,
  criterion: FormulaScalarValue,
  c: FunctionContext,
): boolean {
  if (criterion.type === "error") throw new ExcelError(criterion);
  if (criterion.type === "blank") criterion = { type: "number", value: 0 };
  if (criterion.type !== "string")
    return (
      (value.type === criterion.type &&
        "value" in value &&
        value.value === criterion.value) ||
      (criterion.type === "number" &&
        criterion.value === 0 &&
        value.type === "blank")
    );
  const match = /^(<=|>=|<>|=|<|>)(.*)$/s.exec(criterion.value),
    operator = match?.[1] ?? "=",
    operand = match?.[2] ?? criterion.value;
  let comparison: number;
  if (operand.trim() !== "" && Number.isFinite(Number(operand))) {
    if (value.type !== "number" && value.type !== "blank")
      return operator === "<>";
    comparison = (value.type === "number" ? value.value : 0) - Number(operand);
  } else {
    const text = functionText(value).toUpperCase(),
      pattern = operand.toUpperCase();
    if (operator === "=" || operator === "<>") {
      const equal =
        (value.type === "string" ||
          value.type === "blank" ||
          value.type === "error") &&
        glob(pattern, text, c);
      return operator === "=" ? equal : !equal;
    }
    if (value.type !== "string") return false;
    comparison = text < pattern ? -1 : text > pattern ? 1 : 0;
  }
  return operator === "<"
    ? comparison < 0
    : operator === ">"
      ? comparison > 0
      : operator === "<="
        ? comparison <= 0
        : operator === ">="
          ? comparison >= 0
          : operator === "<>"
            ? comparison !== 0
            : comparison === 0;
}
for (const name of ["MAXIFS", "MINIFS"])
  register(name, 3, 253, (v, c, args) => {
    check(v.length % 2 === 1, "#VALUE!");
    // These functions require references, rather than arbitrary calculated arrays.
    for (let i = 0; i < v.length; i += i === 0 ? 1 : 2) {
      const reference = c.reference(args[i]!);
      check(!("type" in reference), "#VALUE!");
    }
    const matrix = functionMatrix(v[0]!),
      height = matrix.length,
      width = matrix[0]!.length;
    const criteria = [];
    for (let i = 1; i < v.length; i += 2) {
      const rows = functionMatrix(v[i]!);
      check(
        rows.length === height && rows.every((row) => row.length === width),
        "#VALUE!",
      );
      criteria.push({
        rows,
        criterion: functionScalar(c.evaluate(args[i + 1]!)),
      });
    }
    let result: number | undefined;
    for (let r = 0; r < height; r++)
      for (let col = 0; col < width; col++) {
        c.operation(criteria.length);
        if (
          !criteria.every(({ rows, criterion }) =>
            matches(rows[r]![col]!, criterion, c),
          )
        )
          continue;
        const cell = matrix[r]![col]!;
        if (cell.type === "error") throw new ExcelError(cell);
        if (cell.type === "number")
          result =
            result === undefined
              ? cell.value
              : name === "MAXIFS"
                ? Math.max(result, cell.value)
                : Math.min(result, cell.value);
      }
    return result ?? 0;
  });
