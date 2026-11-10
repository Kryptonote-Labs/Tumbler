import { describe, expect, test } from "bun:test";
import type { FormulaExpression } from "../src/ast.ts";
import { functionError, type FunctionContext, type FunctionValue } from "../src/function-runtime.ts";
import { webFunctions } from "../src/functions/web.ts";
import { parseFormula } from "../src/parser.ts";
import { cases } from "./fixtures/web.ts";

function context(cells: Record<string, FunctionValue> = {}, overrides: Partial<FunctionContext> = {}): FunctionContext {
  let operations = 0;
  const result: FunctionContext = {
    address: { sheet: "Results", row: 1, column: 1 }, source: { formulaCells: [], resolveSheet: (_, name) => name, cell: () => undefined },
    dateSystem: "1900", maxArrayCells: 10000, services: undefined,
    evaluate(expression) {
      if (expression.kind === "function") return webFunctions.get(expression.name)!(expression.arguments, result);
      if (expression.kind === "reference") return cells[`A${expression.startReference.row}`] ?? { type: "blank" };
      if (expression.kind === "unary") {
        const value = result.evaluate(expression.operand);
        if (!("kind" in value) && value.type === "number") return { type: "number", value: expression.operator === "-" ? -value.value : value.value };
      }
      if (expression.kind === "number" || expression.kind === "string" || expression.kind === "boolean" || expression.kind === "error") return { type: expression.kind, value: expression.value } as FunctionValue;
      throw new Error(`Unsupported test expression: ${expression.kind}`);
    },
    call: () => { throw new Error("unexpected call"); }, withBindings: () => { throw new Error("unexpected bindings"); },
    reference: () => functionError(), readReference: () => functionError(), cell: () => undefined,
    operation(count = 1) { operations += count; if (operations > 1000000) throw new Error("operation budget"); },
    now: () => new Date("2026-01-01T00:00:00Z"), random: () => 0.5,
    unavailable(message): never { throw new Error(`unavailable: ${message}`); }, ...overrides,
  };
  return result;
}
const s = (value: string): FunctionValue => ({ type: "string", value });
function run(formula: string, ctx = context()): FunctionValue { return ctx.evaluate(parseFormula(formula).expression); }
function input(name: string, values: FunctionValue[], overrides: Partial<FunctionContext> = {}): FunctionValue {
  const expressions: FormulaExpression[] = values.map((_, i) => ({ kind: "number", value: i, lexical: String(i), start: 0, end: 1 }));
  return webFunctions.get(name)!(expressions, context({}, { ...overrides, evaluate: expr => values[(expr as { value: number }).value]! }));
}

describe("web category uncached document cases", () => {
  for (const fixture of cases.filter(item => !item.requiresService)) test(fixture.name, () => {
    const actual = run(fixture.formula, context(fixture.cells));
    expect(actual).toEqual(Array.isArray(fixture.expected) ? { kind: "array", rows: fixture.expected } : fixture.expected);
  });
});

describe("web service capability and bounds", () => {
  test("modeled successful XML response composes with FILTERXML", () => {
    const ctx = context({}, { services: { invoke(name, args, address) {
      expect(name).toBe("WEBSERVICE"); expect(args).toEqual([s("https://example.test/quote?q=A%26B")]);
      expect(address.sheet).toBe("Results"); return s("<quote><price>42.75</price></quote>");
    } } });
    expect(run('FILTERXML(WEBSERVICE("https://example.test/quote?q=A%26B"),"//price")', ctx)).toEqual({ type: "number", value: 42.75 });
  });
  test("host fixture inventory has executable modeled success cases", () => {
    const ctx = context({}, { services: { invoke: name => name === "WEBSERVICE" ? s("<quote><price>42.75</price></quote>") : undefined } });
    for (const fixture of cases.filter(item => item.requiresService)) expect(run(fixture.formula, ctx)).toEqual(Array.isArray(fixture.expected) ? { kind: "array", rows: fixture.expected } : fixture.expected);
  });
  test("host errors propagate; undefined preserves caches", () => {
    expect(run('WEBSERVICE("https://example.test")', context({}, { services: { invoke: () => functionError() } }))).toEqual(functionError());
    expect(() => run('WEBSERVICE("https://example.test")')).toThrow("unavailable");
    expect(() => run('WEBSERVICE("https://example.test")', context({}, { services: { invoke: () => undefined } }))).toThrow("unavailable");
  });
  test("GET URL length boundary, response size, and invalid response type", () => {
    const services = { invoke: () => s("ok") };
    const prefix = "https://example.test/";
    expect(input("WEBSERVICE", [s(prefix + "a".repeat(2048 - prefix.length))], { services })).toEqual(s("ok"));
    expect(input("WEBSERVICE", [s(prefix + "a".repeat(2049 - prefix.length))], { services })).toEqual(functionError());
    expect(input("WEBSERVICE", [s(prefix)], { services: { invoke: () => s("a".repeat(32767)) } })).toEqual(s("a".repeat(32767)));
    for (const value of [s("a".repeat(32768)), { type: "number", value: 1 } as FunctionValue, { kind: "array", rows: [[{ type: "string", value: "a" }]] } as FunctionValue]) {
      expect(input("WEBSERVICE", [s(prefix)], { services: { invoke: () => value } })).toEqual(functionError());
    }
  });
  test("unsupported XPath and DTD never masquerade as locally calculated", () => {
    expect(() => run('FILTERXML("<r/>","count(//r)")')).toThrow("unavailable");
    expect(() => run('FILTERXML("<!DOCTYPE r SYSTEM \'file:///etc/passwd\'><r/>","/r")')).toThrow("unavailable");
    const services = { invoke: (name: string, args: readonly FunctionValue[]) => {
      expect(name).toBe("FILTERXML"); expect(args).toEqual([s("<r/>"), s("count(//r)")]); return { type: "number", value: 1 } as FunctionValue;
    } };
    expect(run('FILTERXML("<r/>","count(//r)")', context({}, { services }))).toEqual({ type: "number", value: 1 });
  });
  test("array and operation budgets are honored, including host results", () => {
    expect(() => run('FILTERXML("<r><a/><a/></r>","//a")', context({}, { maxArrayCells: 1 }))).toThrow("unavailable");
    expect(() => run('ENCODEURL("abc")', context({}, { operation: () => { throw new Error("bounded"); } }))).toThrow("bounded");
    expect(() => run('FILTERXML("<r/>","/r")', context({}, { operation: () => { throw new Error("bounded"); } }))).toThrow("bounded");
    expect(run('FILTERXML("<r/>","count(//r)")', context({}, { maxArrayCells: 1, services: { invoke: () => ({ kind: "array", rows: [[{ type: "number", value: 1 }], [{ type: "number", value: 2 }]] }) } }))).toEqual(functionError());
  });
  test("invalid XML structure, attributes, entities and control characters", () => {
    for (const xml of ["<r>", "text<r/>", "<r a='x' a='y'/>", "<r a='<'/>", "<r>&#0;</r>", "<r>&#xD800;</r>", "<r>\u0000</r>", "<r><!-- a--b --></r>", "<r>]]></r>"]) expect(input("FILTERXML", [s(xml), s("/r")])).toEqual(functionError());
  });
  test("namespace requests and complex XPath require explicit services", () => {
    expect(() => run('FILTERXML("<r xmlns=\"\"urn:test\"\"/>","/r")')).toThrow("unavailable");
    expect(() => run('FILTERXML("<r/>","//r | //other")')).toThrow("unavailable");
    const invalidShapes: FunctionValue[] = [
      { kind: "array", rows: [] },
      { kind: "array", rows: [[{ type: "number", value: 1 }], []] },
      { kind: "array", rows: [[{ type: "string", value: "x".repeat(32768) }]] },
    ];
    for (const value of invalidShapes) expect(run('FILTERXML("<r/>","count(//r)")', context({}, { services: { invoke: () => value } }))).toEqual(functionError());
  });
  test("XML numeric conversion and preserved whitespace", () => {
    expect(run('FILTERXML("<r> -1.25e2 </r>","/r")')).toEqual({ type: "number", value: -125 });
    expect(run('FILTERXML("<r> abc </r>","/r")')).toEqual(s(" abc "));
  });
  test("XPath text nodes coalesce CDATA and retain document order", () => {
    expect(input("FILTERXML", [s("<r>a<![CDATA[b]]>c</r>"), s("/r/text()")])).toEqual(s("abc"));
    expect(input("FILTERXML", [s("<r>a<b>b</b>c</r>"), s("//text()")])).toEqual({ kind: "array", rows: [[s("a")], [s("b")], [s("c")]] });
    expect(input("FILTERXML", [s("<r>a<r>b</r>c</r>"), s("//r/text()")])).toEqual({ kind: "array", rows: [[s("a")], [s("b")], [s("c")]] });
    expect(input("FILTERXML", [s("<r>a<!-- comment -->b</r>"), s("/r/text()")])).toEqual({ kind: "array", rows: [[s("a")], [s("b")]] });
  });
  test("Unicode element and attribute names delegate to the XML host", () => {
    for (const xml of ['<café>ok</café>', '<r café="v">ok</r>', '<r><café>ok</café></r>', '<r><?café ok?>ok</r>', '<r><?é ok?>ok</r>']) {
      expect(() => input("FILTERXML", [s(xml), s("/*")])).toThrow("unavailable");
      expect(input("FILTERXML", [s(xml), s("/*")], { services: { invoke(name, args) {
        expect(name).toBe("FILTERXML");
        expect(args).toEqual([s(xml), s("/*")]);
        return s("ok");
      } } })).toEqual(s("ok"));
    }
  });
  test("arity and scalar array coercion", () => {
    for (const [name, counts] of [["ENCODEURL", [0, 2]], ["WEBSERVICE", [0, 2]], ["FILTERXML", [0, 1, 3]]] as const) for (const count of counts) expect(input(name, Array.from({ length: count }, () => s("x")))).toEqual(functionError());
    for (const name of ["ENCODEURL", "WEBSERVICE"]) expect(input(name, [{ kind: "array", rows: [[{ type: "number", value: 1 }]] }])).toEqual(functionError());
  });
  test("encoding rejects malformed unicode and oversized input", () => {
    expect(input("ENCODEURL", [s("\uD800")])).toEqual(functionError());
    expect(input("ENCODEURL", [s("a".repeat(32768))])).toEqual(functionError());
    expect(input("ENCODEURL", [s("a".repeat(32767))])).toEqual(s("a".repeat(32767)));
  });
});
