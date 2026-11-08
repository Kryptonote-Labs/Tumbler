import { describe, expect, test } from "bun:test";
import type { FormulaExpression } from "../src/ast.ts";
import type { FormulaScalarValue } from "../src/evaluator.ts";
import type { FunctionContext, FunctionValue } from "../src/function-runtime.ts";
import { functionError, functionNumber } from "../src/function-runtime.ts";
import { parseFormula } from "../src/parser.ts";
import { informationFunctions } from "../src/functions/information.ts";
import { cases } from "./fixtures/information.ts";

const n = functionNumber;
const s = (value: string): FormulaScalarValue => ({ type: "string", value });
function harness(cells: Record<string, FormulaScalarValue> = {}) {
  let operations = 0;
  const context: FunctionContext = {
    address: { sheet: "Results", row: 1, column: 1 }, dateSystem: "1900", maxArrayCells: 1000,
    source: {
      formulaCells: [], cell: () => undefined,
      resolveSheet: (_, name) => ["Inputs", "Results"].find(x => x.toLowerCase() === name.toLowerCase()),
      ...{ sheetNames: () => ["Inputs", "Results"], sheetIndex: (sheet: string) => ["Inputs", "Results"].indexOf(sheet) + 1 },
    }, services: undefined,
    evaluate(expression): FunctionValue {
      switch (expression.kind) {
        case "number": return n(expression.value);
        case "string": return s(expression.value);
        case "boolean": return { type: "boolean", value: expression.value };
        case "error": return functionError(expression.value);
        case "reference": {
          const ref = context.reference(expression);
          return "sheet" in ref ? context.readReference(ref) : ref;
        }
        case "unary": {
          const value = context.evaluate(expression.operand);
          return !("kind" in value) && value.type === "number" ? n(value.value * (expression.operator === "-" ? -1 : 1)) : functionError();
        }
        case "function": return informationFunctions.get(expression.name)!(expression.arguments, context);
        default: throw new Error(`Test evaluator needs ${expression.kind}`);
      }
    },
    reference(expression) {
      if (expression.kind !== "reference") return functionError();
      const sheet = context.source.resolveSheet("Results", expression.sheet ?? "Results");
      if (!sheet) return functionError("#REF!");
      return { sheet, firstRow: expression.startReference.row, firstColumn: expression.startReference.column,
        height: (expression.endReference?.row ?? expression.startReference.row) - expression.startReference.row + 1,
        width: (expression.endReference?.column ?? expression.startReference.column) - expression.startReference.column + 1 };
    },
    readReference(ref) {
      const rows: FormulaScalarValue[][] = [];
      for (let r = 0; r < ref.height; r++) {
        const row: FormulaScalarValue[] = [];
        for (let c = 0; c < ref.width; c++) row.push(context.cell({ sheet: ref.sheet, row: ref.firstRow + r, column: ref.firstColumn + c })?.value ?? { type: "blank" });
        rows.push(row);
      }
      return ref.height === 1 && ref.width === 1 ? rows[0]![0]! : { kind: "array", rows };
    },
    cell(address) {
      if (address.sheet === "Results") return { formula: "ISFORMULA(Results!A1)", value: n(1) };
      const key = `${String.fromCharCode(64 + address.column)}${address.row}`;
      return cells[key] ? { formula: undefined, value: cells[key]! } : undefined;
    },
    call: () => functionError(), withBindings: () => functionError(),
    operation(count = 1) { operations += count; if (operations > 10000) throw new Error("operation budget"); },
    now: () => new Date("2023-03-15T00:00:00Z"), random: () => 0.5,
    unavailable(message): never { throw new Error(`unavailable: ${message}`); },
  };
  return { context, run: (formula: string) => context.evaluate(parseFormula(formula).expression) };
}
const modeled: NonNullable<FunctionContext["services"]> = {
  invoke(name, args) {
    if (name === "INFO") return s("mac");
    if (name === "CELL") return s("G");
    if (name === "STOCKHISTORY") return { kind: "array", rows: [[s("Date"), s("Close")], [args[1] as FormulaScalarValue, n(123.5)]] };
    return undefined;
  },
};
describe("information generated document cases", () => {
  for (const fixture of cases) test(fixture.name, () => {
    const { context, run } = harness(fixture.cells);
    Object.assign(context, { dateSystem: fixture.dateSystem ?? "1900", services: fixture.requiresService ? modeled : undefined });
    const expected: FunctionValue = Array.isArray(fixture.expected) ? { kind: "array", rows: fixture.expected } : fixture.expected;
    expect(run(fixture.formula)).toEqual(expected);
  });
});
describe("information contract and boundaries", () => {
  for (const name of informationFunctions.keys()) test(`${name} rejects excess arguments`, () => {
    const { context } = harness();
    const arg = parseFormula("1").expression;
    expect(informationFunctions.get(name)! (Array.from({ length: 12 }, () => arg), context)).toEqual(functionError());
  });
  test("host absence preserves unavailable semantics", () => {
    const { run } = harness();
    for (const formula of ['INFO("system")', 'CELL("format",Inputs!A1)', 'CELL("row")', 'STOCKHISTORY("TEST",45000)']) expect(() => run(formula)).toThrow("unavailable:");
  });
  test("host defaults, properties, date systems and errors", () => {
    const { context, run } = harness();
    const requests: { name: string; args: readonly FunctionValue[] }[] = [];
    Object.assign(context, { services: { invoke(name: string, args: readonly FunctionValue[]) { requests.push({ name, args }); return n(42); } } });
    expect(run('STOCKHISTORY("TEST",45000)')).toEqual(n(42));
    expect(requests[0]!.args).toEqual([s("TEST"), n(45000), n(45000), n(0), n(1), n(0), n(1), s("1900")]);
    Object.assign(context, { dateSystem: "1904" });
    run('STOCKHISTORY("TEST",0,1,2,0,5,1)');
    expect(requests[1]!.args).toEqual([s("TEST"), n(0), n(1), n(2), n(0), n(5), n(1), s("1904")]);
    expect(run('STOCKHISTORY("TEST",2957004)')).toEqual(functionError());
    Object.assign(context, { services: { invoke: () => functionError("#N/A") } });
    expect(run('STOCKHISTORY("TEST",45000)')).toEqual(functionError("#N/A"));
    expect(run('STOCKHISTORY("TEST",45000,45001,0,0,6)')).toEqual(functionError());
  });
  test("arrays map values while TYPE reports the array itself", () => {
    const { context, run } = harness({ A1: n(2), A2: s("x") });
    expect(run("TYPE(Inputs!A1:A2)")).toEqual(n(64));
    expect(run("N(Inputs!A1:A2)")).toEqual({ kind: "array", rows: [[n(2)], [n(0)]] });
    expect(run("ISFORMULA(Inputs!A1:A2)")).toEqual({ kind: "array", rows: [[{ type: "boolean", value: false }], [{ type: "boolean", value: false }]] });
    Object.assign(context, { maxArrayCells: 1 });
    expect(() => run("N(Inputs!A1:A2)")).toThrow("array budget");
    expect(() => run("ISFORMULA(Inputs!A1:A2)")).toThrow("array budget");
  });
  test("omitted lexical marker succeeds independently of services", () => {
    const { context } = harness();
    Object.assign(context, { evaluate: () => ({ kind: "omitted" }) });
    expect(informationFunctions.get("ISOMITTED")!([parseFormula("1").expression], context)).toEqual({ type: "boolean", value: true });
  });
  test("large and malformed host arrays obey budgets", () => {
    const { context, run } = harness();
    Object.assign(context, { maxArrayCells: 1, services: modeled });
    expect(() => run('STOCKHISTORY("TEST",45000)')).toThrow("array budget");
    Object.assign(context, { maxArrayCells: 100, services: { invoke: () => ({ kind: "array", rows: [[n(1)], [n(1), n(2)]] }) } });
    expect(run('STOCKHISTORY("TEST",45000)')).toEqual(functionError());
  });
  test("every host metadata selector forwards explicit information", () => {
    const { context, run } = harness();
    const requests: { name: string; args: readonly FunctionValue[] }[] = [];
    Object.assign(context, { services: { invoke(name: string, args: readonly FunctionValue[]) { requests.push({ name, args }); return n(1); } } });
    for (const key of ["directory", "numfile", "origin", "osversion", "recalc", "release", "system"]) {
      expect(run(`INFO("${key.toUpperCase()}")`)).toEqual(n(1));
      expect(requests.at(-1)).toEqual({ name: "INFO", args: [s(key)] });
    }
    for (const key of ["color", "filename", "format", "parentheses", "prefix", "protect", "width", "address"]) {
      expect(run(`CELL("${key}",Inputs!A1)`)).toEqual(n(1));
      expect(requests.at(-1)).toEqual({ name: "CELL", args: [s(key), s("Inputs"), n(1), n(1)] });
    }
  });
  test("DATEVALUE delegation and date bounds", () => {
    const { context, run } = harness();
    Object.assign(context, { services: modeled, call(name: string, args: FunctionValue[]) { expect(name).toBe("DATEVALUE"); expect(args).toEqual([s("3/15/2023")]); return n(45000); } });
    expect(run('STOCKHISTORY("TEST","3/15/2023")')).toEqual({ kind: "array", rows: [[s("Date"), s("Close")], [n(45000), n(123.5)]] });
    expect(run('STOCKHISTORY("TEST",2958465)')).toEqual({ kind: "array", rows: [[s("Date"), s("Close")], [n(2958465), n(123.5)]] });
    expect(run('STOCKHISTORY("TEST",2958466)')).toEqual(functionError());
  });
  test("missing workbook inventory preserves caches rather than guessing sheet count", () => {
    const { context, run } = harness();
    Object.assign(context, { source: { formulaCells: [], cell: () => undefined, resolveSheet: () => "Inputs" } });
    expect(() => run("SHEET()")).toThrow("sheet ordering");
    expect(() => run("SHEETS()")).toThrow("sheet inventory");
    expect(run("SHEETS(Inputs!A1)")).toEqual(n(1));
  });
  test("all required arguments are enforced", () => {
    const { context } = harness();
    for (const [name, handler] of informationFunctions) if (!["NA", "SHEET", "SHEETS"].includes(name)) expect(handler([], context)).toEqual(functionError());
  });
  test("local address converts final Excel column", () => {
    const { run } = harness();
    expect(run('CELL("address",XFD1048576)')).toEqual(s("$XFD$1048576"));
  });
});
