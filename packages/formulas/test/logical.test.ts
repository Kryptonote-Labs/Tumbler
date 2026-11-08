import { describe, expect, test } from "bun:test";
import type { FormulaExpression } from "../src/ast.ts";
import type { FormulaScalarValue } from "../src/evaluator.ts";
import { functionError, functionFlatten, functionNumber, functionNumeric, functionText, type FunctionContext, type FunctionValue } from "../src/function-runtime.ts";
import { logicalFunctions } from "../src/functions/logical.ts";
import { parseFormula } from "../src/parser.ts";
import { tokenizeFormula } from "../src/lexer.ts";
import { cases } from "./fixtures/logical.ts";

// Temporary category-local adapter only: shared parser lacks name and omitted
// nodes. Reuse its existing grammar via sentinel calls, then restore those nodes.
function expression(source: string): FormulaExpression {
  const tokens = tokenizeFormula(source);
  let text = "";
  for (let index = 0; index < tokens.length - 1; index++) {
    const token = tokens[index]!, next = tokens[index + 1];
    const previous = tokens[index - 1];
    if (token.kind === "symbol" && token.value === "," && previous?.kind === "symbol" && ["(", ","].includes(previous.value)) text += "TESTOMITTED()";
    if (token.kind === "identifier" && /^(TRUE|FALSE)$/i.test(token.value) && next?.kind === "symbol" && next.value === "(") text += `TEST${token.value.toUpperCase()}`;
    else if (token.kind === "identifier" && !(next?.kind === "symbol" && ["(", "!"].includes(next.value)) && !/^(TRUE|FALSE)$/i.test(token.value)) text += `TESTNAME("${token.value}")`;
    else text += source.slice(token.start, token.end);
  }
  function restore(node: FormulaExpression): FormulaExpression {
    if (node.kind === "function") {
      if (node.name === "TESTNAME") return { kind: "name", name: (node.arguments[0] as { value: string }).value, start: 0, end: 0 } as unknown as FormulaExpression;
      if (node.name === "TESTOMITTED") return { kind: "omitted", start: 0, end: 0 } as unknown as FormulaExpression;
      return { ...node, name: node.name.replace(/^TEST(TRUE|FALSE)$/, "$1"), arguments: node.arguments.map(restore) };
    }
    if (node.kind === "binary") return { ...node, left: restore(node.left), right: restore(node.right) };
    if (node.kind === "unary" || node.kind === "percent") return { ...node, operand: restore(node.operand) };
    return node;
  }
  return restore(parseFormula(text).expression);
}
function context(cells: Record<string, FormulaScalarValue> = {}, maxArrayCells = 10000, budget = 100000): FunctionContext {
  let operations = 0;
  function scoped(bindings: ReadonlyMap<string, FunctionValue>): FunctionContext {
    const ctx: FunctionContext = {
      address: { sheet: "Results", row: 1, column: 1 }, dateSystem: "1900", maxArrayCells, services: undefined,
      source: { formulaCells: [], cell: () => undefined, resolveSheet: (_, name) => name },
      operation(count = 1) { operations += count; if (operations > budget) throw new Error("operation budget"); },
      now: () => new Date("2026-01-01T00:00:00Z"), random: () => 0.5,
      unavailable(message): never { throw new Error(message); }, cell: () => undefined,
      reference: () => functionError("#REF!"), readReference: () => functionError("#REF!"),
      withBindings(child, node) { return scoped(new Map([...bindings, ...child])).evaluate(node); },
      call(name, values) {
        if (name === "SUM") {
          let total = 0;
          for (const value of values.flatMap(functionFlatten)) {
            if (value.type === "error") return value;
            if (value.type === "number") total += value.value;
          }
          return functionNumber(total);
        }
        return functionError("#NAME?");
      },
      evaluate(node) {
        ctx.operation();
        const structural = node as unknown as { kind: string; name: string };
        if (structural.kind === "name") return bindings.get(structural.name.toUpperCase()) ?? functionError("#NAME?");
        if (structural.kind === "omitted") return { type: "blank" };
        switch (node.kind) {
          case "number": case "string": case "boolean": case "error": return { type: node.kind, value: node.value } as FormulaScalarValue;
          case "reference": {
            const start = node.startReference, end = node.endReference ?? start;
            const rows: FormulaScalarValue[][] = [];
            for (let row = start.row; row <= end.row; row++) {
              const values: FormulaScalarValue[] = [];
              for (let col = start.column; col <= end.column; col++) values.push(cells[`${String.fromCharCode(64 + col)}${row}`] ?? { type: "blank" });
              rows.push(values);
            }
            return { kind: "array", rows };
          }
          case "function": {
            const bound = bindings.get(node.name.toUpperCase());
            if (bound && "kind" in bound && bound.kind === "lambda") return bound.invoke(node.arguments.map(ctx.evaluate));
            return logicalFunctions.get(node.name)?.(node.arguments, ctx) ?? ctx.call(node.name, node.arguments.map(ctx.evaluate));
          }
          case "unary": { const v = functionNumeric(functionFlatten(ctx.evaluate(node.operand))[0]!); return v.type === "number" ? functionNumber(node.operator === "-" ? -v.value : v.value) : v; }
          case "percent": throw new Error("unused test syntax");
          case "binary": {
            const a = functionFlatten(ctx.evaluate(node.left))[0]!, b = functionFlatten(ctx.evaluate(node.right))[0]!;
            if (a.type === "error") return a; if (b.type === "error") return b;
            if (node.operator === "&") return { type: "string", value: functionText(a) + functionText(b) };
            const x = functionNumeric(a), y = functionNumeric(b);
            if (x.type !== "number") return x; if (y.type !== "number") return y;
            switch (node.operator) {
              case "+": return functionNumber(x.value + y.value);
              case "-": return functionNumber(x.value - y.value);
              case "*": return functionNumber(x.value * y.value);
              case "/": return y.value === 0 ? functionError("#DIV/0!") : functionNumber(x.value / y.value);
              case "^": return functionNumber(x.value ** y.value);
              default: throw new Error("unused test operator");
            }
          }
        }
      },
    };
    return ctx;
  }
  return scoped(new Map());
}
function run(formula: string, ctx = context()): FunctionValue { return ctx.evaluate(expression(formula)); }

describe("logical category generated-document cases through contract adapter", () => {
  for (const fixture of cases) test(fixture.name, () => {
    const ctx = context(fixture.cells);
    const value = run(fixture.formula, ctx);
    const normalized = "kind" in value ? value.kind === "array" ? value.rows : functionError("#CALC!") : value;
    expect(normalized).toEqual(fixture.expected);
  });
});

describe("logical category bounds and lexical contract", () => {
  test("lambda is lazy and zero parameters are supported", () => {
    const fn = run("LAMBDA(1/0)");
    expect("kind" in fn && fn.kind === "lambda").toBe(true);
    if (!("kind" in fn) || fn.kind !== "lambda") throw new Error("lambda");
    expect(fn.invoke([])).toEqual(functionError("#DIV/0!"));
    expect(fn.invoke([functionNumber(1)])).toEqual(functionError());
  });
  test("lambda parameter limit and LET binding limit", () => {
    const names = Array.from({ length: 253 }, (_, i) => `item_${i}`);
    const fn = run(`LAMBDA(${names.join(",")},1)`);
    expect("kind" in fn && fn.kind === "lambda" && fn.parameters.length).toBe(253);
    expect(run(`LAMBDA(${names.join(",")},extra,1)`)).toEqual(functionError());
    expect(run(`LET(${names.slice(0,126).map(name => `${name},1`).join(",")},1)`)).toEqual(functionNumber(1));
    expect(run(`LET(${names.slice(0,127).map(name => `${name},1`).join(",")},1)`)).toEqual(functionError());
  });
  test("invalid names and lambda periods", () => {
    for (const formula of ["LET(c,1,2)", "LET(r,1,2)", "LAMBDA(item.part,1)", "LAMBDA(A1,1)"]) expect(run(formula)).toEqual(functionError());
    expect(run("LET(item.part,2,item.part)")).toEqual(functionNumber(2));
  });
  test("array budget boundaries and extreme dimensions before allocation", () => {
    expect(run("MAKEARRAY(2,2,LAMBDA(row,col,row+col))", context({}, 4))).toMatchObject({ kind: "array" });
    expect(run("MAKEARRAY(2,3,LAMBDA(row,col,row+col))", context({}, 4))).toEqual(functionError("#NUM!"));
    expect(run("MAKEARRAY(1E308,1E308,LAMBDA(row,col,1))")).toEqual(functionError("#NUM!"));
    expect(run("MAKEARRAY(0.999999999999,1,LAMBDA(row,col,1))")).toEqual(functionError());
    expect(run("MAKEARRAY(1.999999999999,1,LAMBDA(row,col,row))")).toMatchObject({ rows: [[functionNumber(1)]] });
  });
  test("operation budget cannot be bypassed by helper iteration", () => {
    expect(() => run("MAKEARRAY(100,100,LAMBDA(row,col,row*col))", context({}, 10000, 100))).toThrow("operation budget");
  });
  test("all helpers validate outer argument counts", () => {
    for (const name of ["MAP", "BYCOL", "BYROW", "MAKEARRAY", "REDUCE", "SCAN", "LET", "LAMBDA"]) expect(run(`${name}()`)).toEqual(functionError());
  });
});
