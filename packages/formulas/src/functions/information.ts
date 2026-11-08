import type { FormulaScalarValue } from "../evaluator.ts";
import {
  type ExtendedFunction, type FunctionContext, type FunctionRegistry, type FunctionValue,
  functionError as err, functionNumber as num, functionNumeric, functionScalar,
} from "../function-runtime.ts";

const text = (value: string): FormulaScalarValue => ({ type: "string", value });
const bool = (value: boolean): FormulaScalarValue => ({ type: "boolean", value });
const isReference = (value: ReturnType<FunctionContext["reference"]>): value is import("../function-runtime.ts").FunctionReference => "sheet" in value;
function bounded(value: FunctionValue, context: FunctionContext): FunctionValue {
  if ("kind" in value && value.kind === "array") {
    const width = value.rows[0]?.length ?? 0;
    if (!width || !value.rows.length || value.rows.length > context.maxArrayCells / width) return context.unavailable("Information result exceeds array budget");
    for (const row of value.rows) {
      context.operation(row.length);
      if (row.length !== width) return err();
    }
  }
  return value;
}
function service(context: FunctionContext, name: string, args: readonly FunctionValue[]): FunctionValue {
  context.operation();
  const value = context.services?.invoke(name, args, context.address);
  return value === undefined ? context.unavailable(`${name} requires explicit host information service`) : bounded(value, context);
}
function each(value: FunctionValue, context: FunctionContext, map: (value: FormulaScalarValue) => FormulaScalarValue): FunctionValue {
  if (!("kind" in value)) return map(value);
  if (value.kind !== "array") return err();
  const checked = bounded(value, context);
  if (!("kind" in checked)) return checked;
  return { kind: "array", rows: value.rows.map(row => row.map(map)) };
}
function unary(map: (value: FormulaScalarValue) => FormulaScalarValue): ExtendedFunction {
  return (args, context) => args.length !== 1 ? err() : each(context.evaluate(args[0]!), context, map);
}
const errors = ["#NULL!", "#DIV/0!", "#VALUE!", "#REF!", "#NAME?", "#NUM!", "#N/A", "#GETTING_DATA"];
const parity = (odd: boolean): ExtendedFunction => unary(value => {
  if (value.type === "boolean") return err();
  const n = functionNumeric(value);
  return n.type === "number" ? bool((Math.abs(Math.trunc(n.value)) % 2 === 1) === odd) : n;
});

export const informationFunctions: FunctionRegistry = new Map<string, ExtendedFunction>([
  ["ERROR.TYPE", unary(value => {
    const index = value.type === "error" ? errors.indexOf(value.value) : -1;
    return index < 0 ? err("#N/A") : num(index + 1);
  })],
  ["ISEVEN", parity(false)], ["ISODD", parity(true)],
  ["ISNONTEXT", unary(value => bool(value.type !== "string"))],
  ["N", unary(value => value.type === "error" || value.type === "number" ? value : num(value.type === "boolean" && value.value ? 1 : 0))],
  ["NA", args => args.length ? err() : err("#N/A")],
  ["TYPE", (args, context) => {
    if (args.length !== 1) return err();
    const value = context.evaluate(args[0]!);
    return num("kind" in value ? value.kind === "array" ? 64 : 128 :
      value.type === "string" ? 2 : value.type === "boolean" ? 4 : value.type === "error" ? 16 : 1);
  }],
  ["ISREF", (args, context) => args.length !== 1 ? err() : bool(isReference(context.reference(args[0]!)))],
  ["ISFORMULA", (args, context) => {
    if (args.length !== 1) return err();
    const ref = context.reference(args[0]!);
    if (!isReference(ref)) return ref.type === "error" ? ref : err();
    if (ref.height * ref.width > context.maxArrayCells) return context.unavailable("ISFORMULA exceeds array budget");
    const rows: FormulaScalarValue[][] = [];
    for (let r = 0; r < ref.height; r++) {
      const row: FormulaScalarValue[] = [];
      for (let c = 0; c < ref.width; c++) {
        context.operation();
        row.push(bool(context.cell({ sheet: ref.sheet, row: ref.firstRow + r, column: ref.firstColumn + c })?.formula !== undefined));
      }
      rows.push(row);
    }
    return ref.height === 1 && ref.width === 1 ? rows[0]![0]! : { kind: "array", rows };
  }],
  ["ISOMITTED", (args, context) => {
    if (args.length !== 1) return err();
    // Omitted lexical parameters are distinct from blank worksheet cells.
    const value = context.evaluate(args[0]!);
    return bool("kind" in value && (value.kind as string) === "omitted");
  }],
  ["SHEET", (args, context) => {
    if (args.length > 1) return err();
    const source = context.source as typeof context.source & { sheetNames?(): readonly string[]; sheetIndex?(sheet: string): number | undefined };
    const index = (sheet: string): FunctionValue => {
      const names = source.sheetNames?.();
      if (names) context.operation(names.length);
      const n = source.sheetIndex?.(sheet) ?? (names ? names.indexOf(sheet) + 1 : undefined);
      return n === undefined ? context.unavailable("SHEET requires workbook sheet ordering") : n > 0 ? num(n) : err("#N/A");
    };
    if (!args.length) return index(context.address.sheet);
    const ref = context.reference(args[0]!);
    if (isReference(ref)) return index(ref.sheet);
    const value = functionScalar(context.evaluate(args[0]!));
    return value.type === "error" ? value : value.type !== "string" ? err("#VALUE!") : index(context.source.resolveSheet(context.address.sheet, value.value) ?? value.value);
  }],
  ["SHEETS", (args, context) => {
    if (args.length > 1) return err();
    if (!args.length) {
      const source = context.source as typeof context.source & { sheetNames?(): readonly string[] };
      return source.sheetNames ? num(source.sheetNames().length) : context.unavailable("SHEETS requires workbook sheet inventory");
    }
    const ref = context.reference(args[0]!);
    return isReference(ref) ? num(1) : ref.type === "error" ? ref : err("#REF!");
  }],
  ["INFO", (args, context) => {
    if (args.length !== 1) return err();
    const value = functionScalar(context.evaluate(args[0]!));
    if (value.type === "error") return value;
    if (value.type !== "string") return err();
    const key = value.value.toLowerCase();
    if (["memavail", "memused", "totmem"].includes(key)) return err("#N/A");
    return ["directory", "numfile", "origin", "osversion", "recalc", "release", "system"].includes(key) ? service(context, "INFO", [text(key)]) : err();
  }],
  ["CELL", (args, context) => {
    if (args.length < 1 || args.length > 2) return err();
    const keyValue = functionScalar(context.evaluate(args[0]!));
    if (keyValue.type === "error") return keyValue;
    if (keyValue.type !== "string") return err();
    const key = keyValue.value.toLowerCase();
    if (!["address", "col", "color", "contents", "filename", "format", "parentheses", "prefix", "protect", "row", "type", "width"].includes(key)) return err();
    if (args.length === 1) return service(context, "CELL", [text(key)]);
    const ref = context.reference(args[1]!);
    if (!isReference(ref)) return ref.type === "error" ? ref : err();
    if (key === "row") return num(ref.firstRow);
    if (key === "col") return num(ref.firstColumn);
    if (key === "contents" || key === "type") {
      const value = functionScalar(context.readReference({ ...ref, height: 1, width: 1 }));
      return key === "contents" ? value.type === "blank" ? num(0) : value : text(value.type === "blank" ? "b" : value.type === "string" ? "l" : "v");
    }
    // Formatting, saved filename and cross-sheet address spelling belong to the host.
    if (key === "address" && ref.sheet === context.address.sheet) {
      let column = ref.firstColumn, label = "";
      while (column > 0) { context.operation(); column--; label = String.fromCharCode(65 + column % 26) + label; column = Math.floor(column / 26); }
      return text(`$${label}$${ref.firstRow}`);
    }
    return service(context, "CELL", [text(key), text(ref.sheet), num(ref.firstRow), num(ref.firstColumn)]);
  }],
  ["STOCKHISTORY", (args, context) => {
    if (args.length < 2 || args.length > 11) return err();
    const values = args.map(arg => (arg.kind as string) === "omitted" ? undefined : functionScalar(context.evaluate(arg)));
    const error = values.find(v => v?.type === "error");
    if (error) return error;
    const stock = values[0]!;
    if (stock?.type !== "string" || !stock.value.trim()) return err();
    const date = (value: FormulaScalarValue): FormulaScalarValue => {
      const parsed = value.type === "string" ? functionScalar(context.call("DATEVALUE", [value])) : functionNumeric(value);
      if (parsed.type !== "number") return parsed;
      const max = context.dateSystem === "1904" ? 2957003 : 2958465;
      return parsed.value < 0 || parsed.value > max ? err("#VALUE!") : num(Math.trunc(parsed.value));
    };
    if (!values[1]) return err();
    const start = date(values[1]);
    const end = values[2] === undefined ? start : date(values[2]);
    if (start.type !== "number") return start;
    if (end.type !== "number") return end;
    if (end.value < start.value) return err();
    const options = [values[3] ?? num(0), values[4] ?? num(1), ...(values.length <= 5 ? [num(0), num(1)] : values.slice(5).map(v => v ?? num(0)))].map(functionNumeric);
    for (let i = 0; i < options.length; i++) {
      const v = options[i]!;
      if (v.type !== "number") return v;
      if (v.value < 0 || v.value > (i < 2 ? 2 : 5) || !Number.isInteger(v.value)) return err();
    }
    return service(context, "STOCKHISTORY", [stock, start, end, ...options, text(context.dateSystem)]);
  }],
]);
