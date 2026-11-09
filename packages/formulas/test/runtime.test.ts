import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { calculateFormulas, parseFormula, type FormulaWorkbookSource, type FunctionRegistry, type FunctionValue, type FormulaScalarValue, type FormulaCellAddress } from "../src/index.ts";
import { functionMatrix, functionScalar } from "../src/function-runtime.ts";

const n = (value: number): FormulaScalarValue => ({type: "number", value});
const at = (row = 1, column = 1, sheet = "S"): FormulaCellAddress => ({sheet, row, column});
function workbook(formulas: Record<string, string>, literals: Record<string, number> = {}): FormulaWorkbookSource {
  const cells = new Map<string, {formula: string | undefined; value: FormulaScalarValue}>();
  for (const [key, formula] of Object.entries(formulas)) cells.set(key, {formula, value: n(99)});
  for (const [key, value] of Object.entries(literals)) cells.set(key, {formula: undefined, value: n(value)});
  return {
    formulaCells: Object.entries(formulas).map(([key, formula]) => {const [row, column] = key.split(",").map(Number); return {address: at(row, column), formula};}),
    cell: address => cells.get(`${address.row},${address.column}`),
    resolveSheet: (_, name) => name === "S" ? name : undefined,
    usedDimensions: () => ({rows: 4, columns: 5}),
  };
}
// Minimal handlers exercise the context contract, independently of category implementations.
const lexical: FunctionRegistry = new Map([
  ["LET", (args, context) => {
    const bindings = new Map<string, FunctionValue>();
    for (let i = 0; i < args.length - 1; i += 2) {
      const name = args[i]!;
      if (name.kind !== "name") return {type: "error", value: "#VALUE!"};
      bindings.set(name.name, context.withBindings(bindings, args[i + 1]!));
    }
    return context.withBindings(bindings, args.at(-1)!);
  }],
  ["LAMBDA", (args, context) => {
    const parameters = args.slice(0, -1).map(arg => arg.kind === "name" ? arg.name : "invalid");
    return {kind: "lambda", parameters, invoke: values => context.withBindings(new Map(parameters.map((name, i) => [name, values[i] ?? {kind: "omitted"}])), args.at(-1)!)};
  }],
  ["ISOMITTED", (args, context) => {const value = context.evaluate(args[0]!); return {type: "boolean", value: "kind" in value && value.kind === "omitted"};}],
]);
function run(formula: string, options = {}) { return calculateFormulas(workbook({"1,1": formula}), {functionRegistries: [lexical], ...options}); }
const rows = (calculation: ReturnType<typeof run>) => calculation.arrayValue(at())?.rows;

describe("shared extension runtime", () => {
  test("parses names, omitted arguments, TRUE/FALSE calls and base conversion names", () => {
    const named = parseFormula("LET(total,1,total)").expression;
    expect(named.kind === "function" && named.arguments[0]).toMatchObject({kind: "name", name: "total"});
    expect(parseFormula("F(,1,)").expression).toMatchObject({arguments: [{kind: "omitted"}, {kind: "number"}, {kind: "omitted"}]});
    expect(parseFormula("BIN2DEC(10)").expression).toMatchObject({kind: "function", name: "BIN2DEC"});
    expect(run("TRUE()=FALSE()").value(at())).toEqual({type: "boolean", value: false});
    expect(functionScalar({kind: "omitted"})).toEqual({type: "blank"});
    expect(functionMatrix({kind: "omitted"})).toEqual([[{type: "blank"}]]);
  });
  test.each([
    ["LET(x,2,y,x+3,y*2)", 10],
    ["LAMBDA(x,x+1)(4)", 5],
    ["LET(x,2,f,LAMBDA(y,x+y),LET(x,100,f(3)))", 5],
    ["LET(x,2,f,LAMBDA(y,LAMBDA(z,x+y+z)),f(3)(4))", 9],
    ["LET(x,{1,2},SUM(x))", 3],
  ])("captures stable lexical values: %s", (formula, expected) => {
    expect(run(formula).value(at())).toEqual(n(expected));
  });
  test("preserves omitted values in direct and context.call lambda arguments", () => {
    expect(run("LAMBDA(x,ISOMITTED(x))()").value(at())).toEqual({type: "boolean", value: true});
    const registry: FunctionRegistry = new Map([["FORWARD", (_, context) => context.call("ISOMITTED", [{kind: "omitted"}])]]);
    expect(run("FORWARD()", {functionRegistries: [lexical, registry]}).value(at())).toEqual({type: "boolean", value: true});
  });
  test("context.call dispatches evaluated arrays and lambda values", () => {
    const registry: FunctionRegistry = new Map([["FORWARD", (_, context) => context.call("SUM", [{kind: "array", rows: [[n(2), n(3)]]}])]]);
    expect(run("FORWARD()", {functionRegistries: [registry]}).value(at())).toEqual(n(5));
  });
  test.each([
    ["{1,2;3,4}+{10;20}", [[11,12],[23,24]]],
    ["{1;2}*{3,4}", [[3,4],[6,8]]],
    ["-({1,2}*2)%", [[-0.02,-0.04]]],
    ["ABS({-1,2})", [[1,2]]],
    ["INDEX({1,2;3,4},0,2)", [[2],[4]]],
  ])("broadcasts arrays: %s", (formula, expected) => { expect(rows(run(formula))).toEqual(expected.map(row => row.map(n))); });
  test("generated rectangular row/column broadcasts match independent arithmetic", () => {
    fc.assert(fc.property(fc.array(fc.integer({min: -100, max: 100}), {minLength: 1, maxLength: 5}), fc.array(fc.integer({min: -100, max: 100}), {minLength: 1, maxLength: 5}), (column, row) => {
      const formula = `{${column.join(";")}}+{${row.join(",")}}`;
      expect(rows(run(formula))).toEqual(column.map(a => row.map(b => n(a + b))));
    }), {numRuns: 200});
  });
  test("extension functions can forward lambda values through context.call", () => {
    const registry: FunctionRegistry = new Map([
      ["FORWARD", (args, context) => context.call("APPLY", [context.evaluate(args[0]!), n(6)])],
      ["APPLY", (args, context) => { const value = context.evaluate(args[0]!); return "kind" in value && value.kind === "lambda" ? value.invoke([context.evaluate(args[1]!)]) : n(-1); }],
    ]);
    expect(run("FORWARD(LAMBDA(x,x*2))", {functionRegistries: [lexical, registry]}).value(at())).toEqual(n(12));
  });
  test("named lambdas resolve through source metadata", () => {
    const source = workbook({"1,1": "Twice(6)"});
    source.resolveName = name => name.toUpperCase() === "TWICE" ? parseFormula("LAMBDA(x,x*2)").expression : undefined;
    expect(calculateFormulas(source, {functionRegistries: [lexical]}).value(at())).toEqual(n(12));
  });
  test("propagates per-element errors and rejects incompatible dimensions", () => {
    expect(rows(run("{1,2}/{0,2}"))).toEqual([[{type: "error", value: "#DIV/0!"}, n(1)]]);
    expect(run("{1,2}+{1,2,3}").value(at())).toEqual({type: "error", value: "#VALUE!"});
  });
  test("publishes spill overlays and recalculates earlier dependants", () => {
    const calc = calculateFormulas(workbook({"1,5": "B2+1", "2,5": "E1*2", "1,1": "{1,2;3,4}", "4,1": "SUM(A1#)"}));
    expect(calc.value(at(2,2))).toEqual(n(4));
    expect(calc.value(at(1,5))).toEqual(n(5));
    expect(calc.value(at(2,5))).toEqual(n(10));
    expect(calc.value(at(4,1))).toEqual(n(10));
    expect(calc.dependencies(at(1,5))).toContainEqual(at(2,2));
    expect(calc.dependencies(at(1,5))).toContainEqual(at());
    expect(calc.diagnostics).toEqual([]);
  });
  test("obstructions and bounds produce SPILL without publishing partial arrays", () => {
    const blocked = calculateFormulas(workbook({"1,1": "{1,2}"}, {"1,2": 7}));
    expect(blocked.value(at())).toEqual({type: "error", value: "#SPILL!"});
    expect(blocked.arrayValue(at())).toBeUndefined();
    expect(blocked.value(at(1,2))).toBeUndefined();
    const edge = calculateFormulas(workbook({"1048576,1": "{1;2}"}));
    expect(edge.value(at(1048576))).toEqual({type: "error", value: "#SPILL!"});
  });
  test("limits preserve source caches rather than silently truncating arrays", () => {
    const calc = run("{1,2;3,4}", {maxArrayCells: 3});
    expect(calc.value(at())).toBeUndefined();
    expect(calc.arrayValue(at())).toBeUndefined();
    expect(calc.diagnostics[0]?.code).toBe("evaluation-limit");
    const recursion = run("LET(f,LAMBDA(self,self(self)),f(f))", {maxOperations: 100});
    expect(recursion.diagnostics[0]?.code).toBe("evaluation-limit");
  });
  test("resolves nested references and records dynamic dependencies", () => {
    const calc = calculateFormulas(workbook({"1,1": 'SUM(OFFSET(INDIRECT("B1"),1,0,2,1))'}, {"2,2": 4,"3,2": 5}));
    expect(calc.value(at())).toEqual(n(9));
    expect(calc.dependencies(at())).toContainEqual(at(2,2));
    expect(calc.dependencies(at())).toContainEqual(at(3,2));
    expect(calculateFormulas(workbook({"1,1": 'INDIRECT("A1")'})).diagnostics[0]?.code).toBe("circular-reference");
  });
  test("INDEX selects reference rows/columns and XLOOKUP returns a matrix row", () => {
    const calc = calculateFormulas(workbook({"1,5": "INDEX(A1:C2,2,0)", "4,1": "XLOOKUP(2,A1:A2,B1:C2)"}, {"1,1":1,"2,1":2,"1,2":3,"2,2":4,"1,3":5,"2,3":6}));
    expect(calc.arrayValue(at(1,5))?.rows).toEqual([[n(2),n(4),n(6)]]);
    expect(calc.arrayValue(at(4,1))?.rows).toEqual([[n(4),n(6)]]);
  });
  test("whole-axis references use source dimensions and implicit intersection uses formula coordinates", () => {
    const calc = calculateFormulas(workbook({"2,5": "@B1:B4", "4,5": "SUM($B:$B)+SUM($1:$1)"}, {"1,2":2,"2,2":3}));
    expect(calc.value(at(2,5))).toEqual(n(3));
    expect(calc.value(at(4,5))).toEqual(n(7));
  });
  test("SUMPRODUCT consumes array arithmetic and WEEKDAY accepts 11 through 17", () => {
    expect(run("SUMPRODUCT(({1;2}>1)*{3;4})").value(at())).toEqual(n(4));
    for (let type = 11; type <= 17; type++) expect(run(`WEEKDAY(45292,${type})`).value(at())).toEqual(n((18-type)%7+1));
  });
  test("context address survives nested cell evaluation, with a stable clock and injected RNG", () => {
    const seen: FormulaCellAddress[] = [];
    let ticks = 0, rng = 0;
    const registry: FunctionRegistry = new Map([["PROBE", (args, context) => {
      seen.push(context.address);
      if (args[0]) context.evaluate(args[0]);
      seen.push(context.address);
      const instant = context.now(); instant.setUTCFullYear(1900);
      return n(context.now().getUTCFullYear() + context.random());
    }]]);
    const calc = calculateFormulas(workbook({"1,1": "PROBE(B1)", "1,2": "PROBE()"}), {functionRegistries: [registry], now: () => {ticks++; return new Date("2026-01-01Z");}, random: () => ++rng});
    expect(ticks).toBe(1);
    expect(seen).toEqual([at(),at(1,2),at(1,2),at()]);
    expect(calc.value(at())).toEqual(n(2028));
  });
  test("services are explicit and unavailable output remains source-owned", () => {
    const registry: FunctionRegistry = new Map([["HOST", (_, context) => context.services?.invoke("HOST", [], context.address) ?? context.unavailable("Host required")]]);
    expect(run("HOST()", {functionRegistries: [registry]}).value(at())).toBeUndefined();
    expect(run("HOST()", {functionRegistries: [registry], services: {invoke: () => n(7)}}).value(at())).toEqual(n(7));
  });
  test.each(['1+PY("x")', 'IF(FALSE,PY("x"),1)', 'PY(3)'])('rejects nonpublic Python syntax before invoking a host: %s', formula => {
    let calls = 0;
    const registry: FunctionRegistry = new Map([["PY", () => {calls++; return n(1);}]]);
    expect(run(formula, {functionRegistries: [registry]}).value(at())).toBeUndefined();
    expect(calls).toBe(0);
  });
});

test("reference geometry preserves whole axes while materialization honors budgets", () => {
  const geometry: FunctionRegistry = new Map([["HEIGHT", (args, ctx) => {
    const ref = ctx.reference(args[0]!);
    return "type" in ref ? ref : n(ref.height);
  }], ["WIDTH", (args, ctx) => {
    const ref = ctx.reference(args[0]!);
    return "type" in ref ? ref : n(ref.width);
  }]]);
  const calc = calculateFormulas(workbook({"1,4": "HEIGHT(A:A)", "2,4": "WIDTH(1:1)", "3,4": "INDEX(A:A,100)", "4,4": 'INDEX(INDIRECT("B1",),1)'}, {"1,2":7}), {functionRegistries: [geometry]});
  expect(calc.value(at(1,4))).toEqual(n(1048576));
  expect(calc.value(at(2,4))).toEqual(n(16384));
  expect(calc.value(at(3,4))).toEqual(n(0));
  expect(calc.value(at(4,4))).toEqual(n(7));
  expect(calc.diagnostics).toEqual([]);
  expect(run("A:A").diagnostics[0]?.code).toBe("evaluation-limit");
});

test("spill budget failure leaves producer caches and prior consumers untouched", () => {
  const source = workbook({"1,5":"B1+1", "1,1":"{1,2}"});
  const calc = calculateFormulas(source, {maxOperations:12});
  expect(calc.diagnostics).toContainEqual(expect.objectContaining({code:"evaluation-limit",address:at()}));
  expect(calc.arrayValue(at())).toBeUndefined();
  expect(calc.value(at())).toBeUndefined();
  expect(calc.value(at(1,2))).toBeUndefined();
  expect(calc.value(at(1,5))).toEqual(n(1));
  expect(source.cell(at())?.value).toEqual(n(99));
});

test("spill commits remain atomic across budget cutoffs and transitive array invalidation", () => {
  for (let maxOperations = 1; maxOperations <= 250; maxOperations++) {
    const calc = calculateFormulas(workbook({"1,5":"B1+1", "2,5":"E1*2", "3,4":"{E1;E2}", "1,1":"{1,2}"}), {maxOperations});
    const failed = calc.diagnostics.some(d => d.code === "evaluation-limit" && d.address.row === 1 && d.address.column === 1);
    const producer = calc.arrayValue(at());
    if (failed) {
      expect(producer).toBeUndefined();
      expect(calc.value(at())).toBeUndefined();
      expect(calc.value(at(1,2))).toBeUndefined();
      const consumer = calc.arrayValue(at(3,4));
      if (consumer) expect(consumer.rows).toEqual([[n(1)],[n(2)]]);
    }
    if (producer) {
      expect(calc.value(at(1,2))).toEqual(n(2));
      expect(calc.value(at(1,5))).not.toEqual(n(1));
      expect(calc.value(at(2,5))).not.toEqual(n(2));
      const consumer = calc.arrayValue(at(3,4));
      if (consumer) expect(consumer.rows).toEqual([[n(3)],[n(6)]]);
    }
  }
});

test("budget exhaustion does not misdiagnose an already committed nested producer", () => {
  for (let maxOperations = 1; maxOperations <= 120; maxOperations++) {
    const calc = calculateFormulas(workbook({"1,5":"B1+A1", "1,1":"{1,2}"}), {maxOperations});
    if (calc.arrayValue(at())) {
      expect(calc.diagnostics.some(d => d.address.row === 1 && d.address.column === 1)).toBe(false);
      expect(calc.value(at(1,2))).toEqual(n(2));
      expect(calc.value(at(1,5))).not.toEqual(n(1));
    }
  }
});
