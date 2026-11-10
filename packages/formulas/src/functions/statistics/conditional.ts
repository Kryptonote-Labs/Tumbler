import { compileCriterion, matchesCriterion } from "../../criteria.ts";
import {
  functionMatrix,
  functionScalar,
  functionText,
  type FunctionContext,
} from "../../function-runtime.ts";
import type { FormulaScalarValue } from "../../evaluator.ts";
import { register, check, ExcelError } from "./runtime.ts";

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
        criterion: (() => {
          const value = functionScalar(c.evaluate(args[i + 1]!));
          if (value.type === "error") throw new ExcelError(value);
          return compileCriterion(value, (message) => c.unavailable(message));
        })(),
      });
    }
    let result: number | undefined;
    for (let r = 0; r < height; r++)
      for (let col = 0; col < width; col++) {
        c.operation(criteria.length);
        if (
          !criteria.every(({ rows, criterion }) =>
            matchesCriterion(rows[r]![col]!, criterion),
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
