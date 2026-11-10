import { describe, expect, test } from "bun:test";
import type { FormulaExpression } from "../src/ast.ts";
import type { FormulaScalarValue } from "../src/evaluator.ts";
import type { FunctionContext, FunctionValue, FormulaFunctionServices } from "../src/function-runtime.ts";
import { cubeFunctions, createCubeSnapshotServices } from "../src/functions/cube.ts";
import { parseFormula } from "../src/parser.ts";
import { cases, cubeFixtureConnections } from "./fixtures/cube.ts";

const n = (value: number): FormulaScalarValue => ({ type: "number", value });
const s = (value: string): FormulaScalarValue => ({ type: "string", value });
const error = (value: `#${string}`): FormulaScalarValue => ({ type: "error", value });
function setup(cells: Record<string, FunctionValue> = {}, maxArrayCells = 1000) {
  let operations = 0;
  const operation = (count = 1) => {
    operations += count;
    if (operations > 10000) throw new RangeError("operation budget");
  };
  const source: FunctionContext["source"] = {
    formulaCells: [], cell: () => undefined, resolveSheet: (_current, name) => name,
  };
  const context: FunctionContext = {
    evaluateAggregate(expression) { return this.evaluate(expression); },
    address: { sheet: "Results", row: 1, column: 1 }, source, dateSystem: "1900", maxArrayCells,
    services: createCubeSnapshotServices(cubeFixtureConnections, { operation, maxArrayCells }),
    operation, evaluate: evaluate,
    call(name, values) {
      const expressions = values.map((v, i) => {
        cells[`V${i}`] = v;
        return parseFormula(`Inputs!A${i + 1}`).expression;
      });
      // Direct calls retain values and metadata through evaluate, as integration must.
      const saved = context.evaluate;
      context.evaluate = expression => values[expressions.indexOf(expression)] ?? saved(expression);
      try { return cubeFunctions.get(name)!(expressions, context); }
      finally { context.evaluate = saved; }
    },
    reference: () => error("#REF!"), readReference: () => error("#REF!"),
    cell: () => undefined, now: () => new Date("2026-01-01"), random: () => 0.5,
    withBindings: () => { throw new Error("unused"); },
    unavailable(message): never { throw new Error(`unavailable: ${message}`); },
  };
  function evaluate(expr: FormulaExpression): FunctionValue {
    if (expr.kind === "function") return cubeFunctions.get(expr.name)!(expr.arguments, context);
    if (expr.kind === "reference") {
      const ref = expr.startReference;
      if (expr.endReference) {
        const rows: FormulaScalarValue[][] = [];
        for (let row = ref.row; row <= expr.endReference.row; row++) {
          const values: FormulaScalarValue[] = [];
          for (let column = ref.column; column <= expr.endReference.column; column++) {
            values.push(cells[`${String.fromCharCode(64 + column)}${row}`] as FormulaScalarValue ?? { type: "blank" });
          }
          rows.push(values);
        }
        return { kind: "array", rows };
      }
      return cells[`${String.fromCharCode(64 + ref.column)}${ref.row}`] ?? { type: "blank" };
    }
    if (expr.kind === "unary") {
      const v = evaluate(expr.operand);
      return !("kind" in v) && v.type === "number" ? n(expr.operator === "-" ? -v.value : v.value) : error("#VALUE!");
    }
    if (expr.kind === "number" || expr.kind === "string" || expr.kind === "boolean" || expr.kind === "error") return { type: expr.kind, value: expr.value } as FormulaScalarValue;
    throw new Error(`unused AST ${expr.kind}`);
  }
  return { context, run: (formula: string) => evaluate(parseFormula(formula).expression), operations: () => operations };
}

describe("cube snapshot service and function bridge", () => {
  for (const fixture of cases) test(fixture.name, () => {
    const { context, run } = setup(fixture.cells);
    if (fixture.dateSystem) Object.assign(context, { dateSystem: fixture.dateSystem });
    expect(run(fixture.formula)).toEqual(Array.isArray(fixture.expected) ? { kind: "array", rows: fixture.expected } : fixture.expected);
  });

  const examples: Record<string, string> = {
    CUBEKPIMEMBER: '"Sales","Revenue",1', CUBEMEMBER: '"Sales","[Product].[Apple]"',
    CUBEMEMBERPROPERTY: '"Sales","[Product].[Apple]","Color"',
    CUBERANKEDMEMBER: '"Sales","Products",1', CUBESET: '"Sales","Products"',
    CUBESETCOUNT: '"Fruit"', CUBEVALUE: '"Sales"',
  };
  for (const [name, args] of Object.entries(examples)) {
    test(`${name}: missing host preserves caches via unavailable`, () => {
      const { context, run } = setup(); Object.assign(context, { services: undefined });
      expect(() => run(`${name}(${args})`)).toThrow("unavailable:");
    });
    test(`${name}: declined host preserves caches`, () => {
      const { context, run } = setup(); Object.assign(context, { services: { invoke: () => undefined } });
      expect(() => run(`${name}(${args})`)).toThrow("unavailable:");
    });
    test(`${name}: error argument propagation`, () => {
      expect(setup().run(`${name}(#DIV/0!)`)).toEqual(error(name === "CUBEVALUE" || name === "CUBESETCOUNT" ? "#DIV/0!" : "#VALUE!"));
      const input = args.split(","); input[0] = "#REF!";
      expect(setup().run(`${name}(${input.join(",")})`)).toEqual(error("#REF!"));
    });
    test(`${name}: arity bounds`, () => {
      expect(cubeFunctions.get(name)!([], setup().context)).toEqual(error("#VALUE!"));
      const args = Array.from({ length: 256 }, () => parseFormula('"x"').expression);
      expect(cubeFunctions.get(name)!(args, setup().context)).toEqual(error("#VALUE!"));
    });
  }

  for (let property = 1; property <= 6; property++) test(`KPI component ${property}`, () => {
    const expected = ["Revenue", "Goal", "Status", "Trend", "Weight", "Current"][property - 1];
    expect(setup().run(`CUBEKPIMEMBER("Sales","Revenue",${property})`)).toEqual(s(expected!));
  });
  for (const rank of ["-1", "0", "1.0000000000000002", "1e308", '"invalid"']) test(`rank invalid ${rank}`, () => {
    expect(setup().run(`CUBERANKEDMEMBER("Sales","Products",${rank})`)).toEqual(error("#N/A"));
  });
  for (const [sort, first] of [[0, "Banana"], [1, "Banana"], [2, "Apple"], [3, "Apple"], [4, "Banana"], [5, "Banana"], [6, "Apple"]] as const) test(`sort order ${sort}`, () => {
    expect(setup().run(`CUBERANKEDMEMBER("Sales",CUBESET("Sales","Products","",${sort},"[Measures].[Sales]"),1)`)).toEqual(s(first));
  });
  test("reference numeric coercion and blank rank", () => {
    expect(setup({ A1: s("2") }).run('CUBERANKEDMEMBER("Sales","Products",Inputs!A1)')).toEqual(s("Apple"));
    expect(setup().run('CUBERANKEDMEMBER("Sales","Products",Inputs!A1)')).toEqual(error("#N/A"));
  });
  test("caption identity survives cell reference and duplicate captions", () => {
    const env = setup();
    const apple = env.run('CUBEMEMBER("Sales","[Product].[Apple]","Same")');
    const measure = env.run('CUBEMEMBER("Sales","[Measures].[Sales]","Same")');
    expect(env.context.call("CUBEVALUE", [s("Sales"), apple, measure])).toEqual(n(20));
    expect(env.context.call("CUBEVALUE", [s("Sales"), s("Same")])).toEqual(error("#N/A"));
  });
  test("metadata survives reference evaluation and cross-connection use is rejected", () => {
    const cells: Record<string, FunctionValue> = {};
    const env = setup(cells);
    cells.A1 = env.run('CUBEMEMBER("Sales","[Product].[Apple]","Fruit")');
    expect(env.run('CUBEVALUE("Sales",Inputs!A1,"[Measures].[Sales]")')).toEqual(n(20));
    const services = createCubeSnapshotServices({ ...cubeFixtureConnections, Other: cubeFixtureConnections.Sales! }, env.context);
    Object.assign(env.context, { services });
    cells.A1 = env.run('CUBEMEMBER("Sales","[Product].[Apple]")');
    expect(env.run('CUBEVALUE("Other",Inputs!A1)')).toEqual(error("#N/A"));
  });
  test("range tuple and range set", () => {
    const env = setup({ A1: s("[Product].[Apple]"), A2: s("[Measures].[Sales]") });
    expect(env.run('CUBEMEMBER("Sales",Inputs!A1:A2)')).toEqual(s("Sales"));
    expect(env.run('CUBESETCOUNT(CUBESET("Sales",Inputs!A1:A2))')).toEqual(n(2));
  });
  test("sets count and rank complete tuples without losing their intersection", () => {
    const cells: Record<string, FunctionValue> = { A1: s("[Product].[Apple]"), A2: s("[Measures].[Sales]") };
    const env = setup(cells);
    cells.B1 = env.run('CUBEMEMBER("Sales",Inputs!A1:A2)');
    cells.B2 = env.run('CUBESET("Sales",Inputs!B1:B1)');
    expect(env.run('CUBESETCOUNT(Inputs!B2)')).toEqual(n(1));
    cells.B3 = env.run('CUBERANKEDMEMBER("Sales",Inputs!B2,1)');
    expect(env.run('CUBEVALUE("Sales",Inputs!B3)')).toEqual(n(20));
    expect(env.run('CUBERANKEDMEMBER("Sales",Inputs!B2,2)')).toEqual(error("#N/A"));
    cells.C1 = env.run('CUBEMEMBER("Sales",Inputs!A1:A1)');
    cells.C2 = cells.B1;
    expect(env.run('CUBERANKEDMEMBER("Sales",CUBESET("Sales",Inputs!C1:C2,"",3),1)')).toEqual(s("Apple"));
    expect(env.run('CUBERANKEDMEMBER("Sales",CUBESET("Sales",Inputs!C1:C2,"",4),1)')).toEqual(s("Sales"));
    expect(env.run('CUBEVALUE("Sales",CUBERANKEDMEMBER("Sales",CUBESET("Sales",Inputs!C1:C2,"",4),1))')).toEqual(n(20));
  });
  test("sort measures use member identity, including custom captions", () => {
    const env = setup();
    expect(env.run('CUBERANKEDMEMBER("Sales",CUBESET("Sales","Products","",1,CUBEMEMBER("Sales","[Measures].[Sales]","Custom")),1)')).toEqual(s("Banana"));
    const services = createCubeSnapshotServices({ ...cubeFixtureConnections, Other: cubeFixtureConnections.Sales! }, env.context);
    Object.assign(env.context, { services });
    expect(env.run('CUBESET("Sales","Products","",1,CUBEMEMBER("Other","[Measures].[Sales]"))')).toEqual(error("#N/A"));
  });
  test("long MDX reference bypasses literal-only limit", () => {
    const env = setup({ A1: s("x".repeat(32767)) });
    const service: FormulaFunctionServices = { invoke: (_name, args) => s((args[1] as { value: string }).value.length.toString()) };
    Object.assign(env.context, { services: service });
    expect(env.run('CUBEMEMBER("Sales",Inputs!A1)')).toEqual(s("32767"));
    expect(env.run(`CUBEMEMBER("Sales","${"x".repeat(255)}")`)).toEqual(s("255"));
  });
  test("array errors and bounded input", () => {
    expect(setup({ A1: error("#N/A") }).run('CUBESET("Sales",Inputs!A1:A2)')).toEqual(error("#N/A"));
    expect(setup({}, 1).run('CUBESET("Sales",Inputs!A1:A2)')).toEqual(error("#NUM!"));
    expect(() => setup({}, 1).run('CUBESET("Sales","Products")')).toThrow("maxArrayCells");
  });
  test("host overflow, scalar result enforcement and exceptions", () => {
    const env = setup();
    Object.assign(env.context, { services: { invoke: () => n(Infinity) } });
    expect(env.run('CUBEVALUE("Sales")')).toEqual(error("#NUM!"));
    Object.assign(env.context, { services: { invoke: () => ({ kind: "array", rows: [[n(1)]] }) } });
    expect(env.run('CUBEVALUE("Sales")')).toEqual(error("#VALUE!"));
    Object.assign(env.context, { services: { invoke: () => { throw new RangeError("budget"); } } });
    expect(() => env.run('CUBEVALUE("Sales")')).toThrow("budget");
  });
  test("omitted optional arguments preserve defaults and reach the host intact", () => {
    // Structural compatibility until the coordinator integrates FunctionOmitted.
    const omitted = { kind: "omitted" } as unknown as FunctionValue;
    const env = setup();
    expect(env.context.call("CUBEMEMBER", [s("Sales"), s("[Product].[Apple]"), omitted])).toEqual(s("Apple"));
    expect(env.context.call("CUBESET", [s("Sales"), s("Products"), omitted, omitted])).toEqual(s(""));
    expect(env.context.call("CUBESET", [s("Sales"), s("Products"), omitted, n(1), omitted])).toEqual(error("#VALUE!"));
    let received: readonly FunctionValue[] | undefined;
    Object.assign(env.context, { services: { invoke: (_name: string, values: readonly FunctionValue[]) => { received = values; return n(1); } } });
    env.context.call("CUBEMEMBER", [s("Sales"), s("[Product].[Apple]"), omitted]);
    expect(received?.[2]).toBe(omitted);
  });
  test("transport forwards values and formula address without implicit coercion", () => {
    const env = setup(); let received: unknown;
    Object.assign(env.context, { services: { invoke: (...args: unknown[]) => { received = args; return n(4); } } });
    expect(env.run('CUBERANKEDMEMBER("Sales","Products","2")')).toEqual(n(4));
    expect(received).toEqual(["CUBERANKEDMEMBER", [s("Sales"), s("Products"), s("2")], env.context.address]);
    expect(env.operations()).toBeGreaterThan(0);
  });
});
