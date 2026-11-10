import type { FormulaExpression } from "../ast.ts";
import { indirectReference } from "../indirect-reference.ts";
import type { FormulaScalarValue } from "../evaluator.ts";
import {
  functionError as err,
  functionNumber as num,
  functionMatrix,
  functionNumeric,
  functionScalar,
  functionText,
  hostFunction,
  type FunctionContext,
  type FunctionReference,
  type FunctionValue,
  type FunctionRegistry,
  type ExtendedFunction,
} from "../function-runtime.ts";

type Scalar = FormulaScalarValue;
type Matrix = readonly (readonly Scalar[])[];
const text = (value: string): Scalar => ({ type: "string", value });
class ExcelFailure {
  constructor(readonly value: Scalar) {}
}
function fail(code: `#${string}` = "#VALUE!"): never {
  throw new ExcelFailure(err(code));
}
function scalar(v: FunctionValue): Scalar {
  const s = functionScalar(v);
  if (s.type === "error") throw new ExcelFailure(s);
  return s;
}
function numeric(v: FunctionValue): number {
  const s = functionNumeric(scalar(v));
  if (s.type !== "number") throw new ExcelFailure(s);
  return s.value;
}
function integer(v: FunctionValue): number {
  return Math.trunc(numeric(v));
}
// Structural check also accepts the coordinator's forthcoming omitted runtime value.
function optional(
  a: readonly FormulaExpression[],
  c: FunctionContext,
  i: number,
): FunctionValue | undefined {
  if (!a[i]) return undefined;
  const value = c.evaluate(a[i]!);
  return "kind" in value && (value as { kind: string }).kind === "omitted"
    ? undefined
    : value;
}
function optionInteger(
  a: readonly FormulaExpression[],
  c: FunctionContext,
  i: number,
  fallback: number,
): number;
function optionInteger(
  a: readonly FormulaExpression[],
  c: FunctionContext,
  i: number,
  fallback: undefined,
): number | undefined;
function optionInteger(
  a: readonly FormulaExpression[],
  c: FunctionContext,
  i: number,
  fallback: number | undefined,
): number | undefined {
  const value = optional(a, c, i);
  return value === undefined ? fallback : integer(value);
}
function optionBool(
  a: readonly FormulaExpression[],
  c: FunctionContext,
  i: number,
  fallback: boolean,
): boolean {
  const value = optional(a, c, i);
  return value === undefined ? fallback : bool(value);
}
function bool(v: FunctionValue): boolean {
  const s = scalar(v);
  if (s.type === "string") {
    if (/^true$/i.test(s.value)) return true;
    if (/^false$/i.test(s.value)) return false;
    fail();
  }
  return numeric(s) !== 0;
}
function budget(c: FunctionContext, h: number, w: number): void {
  if (h > 1048576 || w > 16384) fail("#NUM!");
  if (!Number.isSafeInteger(h) || !Number.isSafeInteger(w) || h < 1 || w < 1)
    fail("#CALC!");
  if (h * w > c.maxArrayCells)
    c.unavailable(
      "Lookup array exceeds the configured cell budget or worksheet dimensions",
    );
  c.operation(h * w);
}
function matrix(v: FunctionValue, c: FunctionContext): Matrix {
  const a = functionMatrix(v);
  budget(c, a.length, a[0]?.length ?? 0);
  return a;
}
function build(
  c: FunctionContext,
  h: number,
  w: number,
  f: (r: number, col: number) => Scalar,
): FunctionValue {
  budget(c, h, w);
  return {
    kind: "array",
    rows: Array.from({ length: h }, (_, r) =>
      Array.from({ length: w }, (_, col) => f(r, col)),
    ),
  };
}
const zeroBlank = (v: Scalar): Scalar => (v.type === "blank" ? num(0) : v);
function transpose(a: Matrix): Matrix {
  return a[0]!.map((_, i) => a.map((row) => row[i]!));
}
function ref(e: FormulaExpression, c: FunctionContext): FunctionReference {
  const r = c.reference(e);
  if (!("sheet" in r))
    throw new ExcelFailure(r.type === "error" ? r : err("#REF!"));
  return r;
}
function readBoundedReference(
  c: FunctionContext,
  r: FunctionReference,
): FunctionValue {
  boundedReference(r);
  budget(c, r.height, r.width);
  return c.readReference(r);
}
function boundedReference(r: FunctionReference): FunctionReference {
  if (
    r.firstRow < 1 ||
    r.firstColumn < 1 ||
    r.height < 1 ||
    r.width < 1 ||
    r.firstRow + r.height - 1 > 1048576 ||
    r.firstColumn + r.width - 1 > 16384
  )
    fail("#REF!");
  return r;
}
function columnName(n: number): string {
  let s = "";
  while (n > 0) {
    n--;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}
function key(row: readonly Scalar[]): string {
  return JSON.stringify(
    row.map((v) =>
      v.type === "string" ? { type: v.type, value: v.value.toLowerCase() } : v,
    ),
  );
}
function compare(a: Scalar, b: Scalar): number {
  if (a.type === b.type) {
    if (a.type === "string" && b.type === "string")
      return a.value.toLowerCase() < b.value.toLowerCase()
        ? -1
        : a.value.toLowerCase() > b.value.toLowerCase()
          ? 1
          : 0;
    if ("value" in a && "value" in b)
      return a.value < b.value ? -1 : a.value > b.value ? 1 : 0;
    return 0;
  }
  const rank = { number: 0, string: 1, boolean: 2, error: 3, blank: 4 };
  return rank[a.type] - rank[b.type];
}
const registry = new Map<string, ExtendedFunction>();
function define(
  name: string,
  min: number,
  max: number,
  run: ExtendedFunction,
): ExtendedFunction {
  const handler: ExtendedFunction = (a, c) => {
    if (a.length < min || a.length > max) return err();
    try {
      c.operation();
      return run(a, c);
    } catch (e) {
      if (e instanceof ExcelFailure) return e.value;
      throw e;
    }
  };
  registry.set(name, handler);
  return handler;
}

define("ADDRESS", 2, 5, (a, c) => {
  const r = integer(c.evaluate(a[0]!)),
    col = integer(c.evaluate(a[1]!)),
    abs = optionInteger(a, c, 2, 1),
    a1 = optionBool(a, c, 3, true);
  if (r < 1 || r > 1048576 || col < 1 || col > 16384 || abs < 1 || abs > 4)
    fail();
  const ar = abs === 1 || abs === 2,
    ac = abs === 1 || abs === 3;
  let s = a1
    ? `${ac ? "$" : ""}${columnName(col)}${ar ? "$" : ""}${r}`
    : `R${ar ? r : `[${r}]`}C${ac ? col : `[${col}]`}`;
  const sheetValue = optional(a, c, 4);
  if (sheetValue !== undefined) {
    const sheet = functionText(scalar(sheetValue));
    s =
      (/^[A-Za-z_][A-Za-z0-9_]*$/.test(sheet) &&
      !/^R\d+C\d+$|^[A-Za-z]+\d+$/i.test(sheet)
        ? sheet
        : `'${sheet.replaceAll("'", "''")}'`) +
      "!" +
      s;
  }
  return text(s);
});
define("AREAS", 1, 1, (a, c) => {
  ref(a[0]!, c);
  return num(1);
});
for (const name of ["ROW", "COLUMN"] as const)
  define(name, 0, 1, (a, c) => {
    const r = a[0]
      ? ref(a[0], c)
      : {
          sheet: c.address.sheet,
          firstRow: c.address.row,
          firstColumn: c.address.column,
          height: 1,
          width: 1,
        };
    const row = name === "ROW";
    const n = row ? r.height : r.width;
    if (n === 1) return num(row ? r.firstRow : r.firstColumn);
    return build(c, row ? n : 1, row ? 1 : n, (i, j) =>
      num(row ? r.firstRow + i : r.firstColumn + j),
    );
  });
for (const name of ["ROWS", "COLUMNS"] as const)
  define(name, 1, 1, (a, c) => {
    const r = c.reference(a[0]!);
    if (!("type" in r)) {
      return num(name === "ROWS" ? r.height : r.width);
    }
    const value = c.evaluate(a[0]!);
    if (!("kind" in value) && value.type === "error") return value;
    const m = matrix(value, c);
    return num(name === "ROWS" ? m.length : m[0]!.length);
  });
define("FORMULATEXT", 1, 1, (a, c) => {
  const r = ref(a[0]!, c);
  const formula = c.cell({
    sheet: r.sheet,
    row: r.firstRow,
    column: r.firstColumn,
  })?.formula;
  if (!formula || formula.length > 8192) fail("#N/A");
  return text(formula.startsWith("=") ? formula : "=" + formula);
});
define("OFFSET", 3, 5, (a, c) => {
  const r = ref(a[0]!, c),
    dr = integer(c.evaluate(a[1]!)),
    dc = integer(c.evaluate(a[2]!));
  const h = optionInteger(a, c, 3, r.height),
    w = optionInteger(a, c, 4, r.width);
  return readBoundedReference(
    c,
    boundedReference({
      ...r,
      firstRow: r.firstRow + dr,
      firstColumn: r.firstColumn + dc,
      height: h,
      width: w,
    }),
  );
});
define("INDIRECT", 1, 2, (args, context) => {
  const target = functionText(scalar(context.evaluate(args[0]!)));
  const a1 = optionBool(args, context, 1, true);
  const reference = indirectReference(target, a1, context.address, context.source,
    (expression, sheet) => context.reference(expression, sheet),
    message => context.unavailable(message));
  return "type" in reference ? reference : readBoundedReference(context, boundedReference(reference));
});
define("HYPERLINK", 1, 2, (a, c) => {
  const location = scalar(c.evaluate(a[0]!));
  const label = optional(a, c, 1);
  return label === undefined ? zeroBlank(location) : zeroBlank(scalar(label));
});
for (const name of ["TRANSPOSE", "HSTACK", "VSTACK"] as const)
  define(name, 1, name === "TRANSPOSE" ? 1 : 254, (a, c) => {
    const arrays = a.map((e) => matrix(c.evaluate(e), c));
    if (name === "TRANSPOSE") {
      const m = arrays[0]!;
      return build(c, m[0]!.length, m.length, (r, col) =>
        zeroBlank(m[col]![r]!),
      );
    }
    const horizontal = name === "HSTACK";
    const h = horizontal
        ? Math.max(...arrays.map((m) => m.length))
        : arrays.reduce((n, m) => n + m.length, 0),
      w = horizontal
        ? arrays.reduce((n, m) => n + m[0]!.length, 0)
        : Math.max(...arrays.map((m) => m[0]!.length));
    return build(c, h, w, (r, col) => {
      let i = horizontal ? col : r;
      for (const m of arrays) {
        const size = horizontal ? m[0]!.length : m.length;
        if (i < size)
          return zeroBlank(
            m[horizontal ? r : i]?.[horizontal ? i : col] ?? err("#N/A"),
          );
        i -= size;
      }
      return err("#N/A");
    });
  });
for (const name of ["CHOOSECOLS", "CHOOSEROWS"] as const)
  define(name, 2, 254, (a, c) => {
    const m = matrix(c.evaluate(a[0]!), c),
      rows = name === "CHOOSEROWS",
      size = rows ? m.length : m[0]!.length;
    const indices: number[] = [];
    for (const expression of a.slice(1)) {
      for (const row of matrix(c.evaluate(expression), c))
        for (const v of row) {
          const i = integer(v);
          if (i === 0 || Math.abs(i) > size) fail();
          const length = indices.length + 1;
          if (length * (rows ? m[0]!.length : m.length) > c.maxArrayCells)
            c.unavailable("Selected array exceeds the configured cell budget");
          c.operation();
          indices.push(i < 0 ? size + i : i - 1);
        }
    }
    return build(
      c,
      rows ? indices.length : m.length,
      rows ? m[0]!.length : indices.length,
      (r, col) =>
        zeroBlank(m[rows ? indices[r]! : r]![rows ? col : indices[col]!]!),
    );
  });
for (const name of ["TAKE", "DROP"] as const)
  define(name, 2, 3, (a, c) => {
    const m = matrix(c.evaluate(a[0]!), c),
      take = name === "TAKE";
    const bounds = (n: number, v: number | undefined): [number, number] => {
      if (v === undefined) return [0, n];
      if (v === 0) fail("#CALC!");
      const k = Math.min(n, Math.abs(v));
      return take ? (v > 0 ? [0, k] : [n - k, n]) : v > 0 ? [k, n] : [0, n - k];
    };
    const [rs, re] = bounds(m.length, optionInteger(a, c, 1, undefined)),
      [cs, ce] = bounds(m[0]!.length, optionInteger(a, c, 2, undefined));
    return build(c, re - rs, ce - cs, (r, col) =>
      zeroBlank(m[r + rs]![col + cs]!),
    );
  });
define("EXPAND", 2, 4, (a, c) => {
  const m = matrix(c.evaluate(a[0]!), c),
    h = optionInteger(a, c, 1, m.length),
    w = optionInteger(a, c, 2, m[0]!.length);
  if (h < m.length || w < m[0]!.length) fail();
  const pad = functionScalar(optional(a, c, 3) ?? err("#N/A"));
  return build(c, h, w, (r, col) => zeroBlank(m[r]?.[col] ?? pad));
});
for (const name of ["TOCOL", "TOROW"] as const)
  define(name, 1, 3, (a, c) => {
    let m = matrix(c.evaluate(a[0]!), c);
    const ignore = optionInteger(a, c, 1, 0),
      byColumn = optionBool(a, c, 2, false);
    if (ignore < 0 || ignore > 3) fail();
    if (byColumn) m = transpose(m);
    const values = m
      .flat()
      .filter(
        (v) =>
          !(ignore & 1 && v.type === "blank") &&
          !(ignore & 2 && v.type === "error"),
      );
    return build(
      c,
      name === "TOCOL" ? values.length : 1,
      name === "TOCOL" ? 1 : values.length,
      (r, col) => zeroBlank(values[name === "TOCOL" ? r : col]!),
    );
  });
for (const name of ["WRAPCOLS", "WRAPROWS"] as const)
  define(name, 2, 3, (a, c) => {
    const m = matrix(c.evaluate(a[0]!), c);
    if (m.length > 1 && m[0]!.length > 1) fail();
    const v = m.flat(),
      count = integer(c.evaluate(a[1]!));
    if (count < 1) fail();
    const pad = functionScalar(optional(a, c, 2) ?? err("#N/A")),
      cols = name === "WRAPCOLS",
      short = Math.min(count, v.length),
      long = Math.ceil(v.length / count);
    return build(c, cols ? short : long, cols ? long : short, (r, col) =>
      zeroBlank(v[cols ? col * count + r : r * count + col] ?? pad),
    );
  });
define("FILTER", 2, 3, (a, c) => {
  const m = matrix(c.evaluate(a[0]!), c),
    inc = matrix(c.evaluate(a[1]!), c),
    rows = inc.length === m.length && inc[0]!.length === 1,
    cols = inc.length === 1 && inc[0]!.length === m[0]!.length;
  if (!rows && !cols) fail();
  const selected = inc
    .flat()
    .map((v, i) => (bool(v) ? i : -1))
    .filter((i) => i >= 0);
  if (!selected.length) return optional(a, c, 2) ?? err("#CALC!");
  return build(
    c,
    rows ? selected.length : m.length,
    rows ? m[0]!.length : selected.length,
    (r, col) =>
      zeroBlank(m[rows ? selected[r]! : r]![rows ? col : selected[col]!]!),
  );
});
define("UNIQUE", 1, 3, (a, c) => {
  let m = matrix(c.evaluate(a[0]!), c);
  const cols = optionBool(a, c, 1, false),
    once = optionBool(a, c, 2, false);
  if (cols) m = transpose(m);
  const counts = new Map<string, number>();
  for (const row of m) {
    c.operation();
    const k = key(row);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const seen = new Set<string>();
  const out = m.filter((row) => {
    const k = key(row);
    if (seen.has(k) || (once && counts.get(k) !== 1)) return false;
    seen.add(k);
    return true;
  });
  if (!out.length) fail("#CALC!");
  const result = cols ? transpose(out) : out;
  return build(c, result.length, result[0]!.length, (r, col) =>
    zeroBlank(result[r]![col]!),
  );
});
define("TRIMRANGE", 1, 3, (a, c) => {
  const m = matrix(c.evaluate(a[0]!), c),
    rm = optionInteger(a, c, 1, 3),
    cm = optionInteger(a, c, 2, 3);
  if (rm < 0 || rm > 3 || cm < 0 || cm > 3) fail();
  let rs = 0,
    re = m.length,
    cs = 0,
    ce = m[0]!.length;
  const emptyRow = (r: number) => m[r]!.every((v) => v.type === "blank"),
    emptyCol = (col: number) => m.every((row) => row[col]!.type === "blank");
  if (rm & 1)
    while (rs < re && emptyRow(rs)) {
      c.operation();
      rs++;
    }
  if (rm & 2)
    while (re > rs && emptyRow(re - 1)) {
      c.operation();
      re--;
    }
  if (cm & 1)
    while (cs < ce && emptyCol(cs)) {
      c.operation();
      cs++;
    }
  if (cm & 2)
    while (ce > cs && emptyCol(ce - 1)) {
      c.operation();
      ce--;
    }
  return build(c, re - rs, ce - cs, (r, col) =>
    zeroBlank(m[r + rs]![col + cs]!),
  );
});
define("SORT", 1, 4, (a, c) => {
  let m = matrix(c.evaluate(a[0]!), c);
  const index = optionInteger(a, c, 1, 1),
    order = optionInteger(a, c, 2, 1),
    cols = optionBool(a, c, 3, false);
  if (cols) m = transpose(m);
  if (index < 1 || index > m[0]!.length || Math.abs(order) !== 1) fail();
  const sorted = [...m].sort((x, y) => {
    c.operation();
    return order * compare(x[index - 1]!, y[index - 1]!);
  });
  const out = cols ? transpose(sorted) : sorted;
  return build(c, out.length, out[0]!.length, (r, col) =>
    zeroBlank(out[r]![col]!),
  );
});
define("SORTBY", 2, 254, (a, c) => {
  const m = matrix(c.evaluate(a[0]!), c);
  const keys: { values: Scalar[]; order: number }[] = [];
  let horizontal: boolean | undefined;
  for (let i = 1; i < a.length; i += 2) {
    const k = matrix(c.evaluate(a[i]!), c),
      h = k.length === 1 && k[0]!.length === m[0]!.length;
    if (!h && !(k.length === m.length && k[0]!.length === 1)) fail();
    if (horizontal !== undefined && horizontal !== h) fail();
    horizontal = h;
    const order = optionInteger(a, c, i + 1, 1);
    if (Math.abs(order) !== 1) fail();
    keys.push({ values: k.flat(), order });
  }
  const ids = Array.from(
    { length: horizontal ? m[0]!.length : m.length },
    (_, i) => i,
  ).sort((x, y) => {
    c.operation();
    for (const k of keys) {
      const d = k.order * compare(k.values[x]!, k.values[y]!);
      if (d) return d;
    }
    return x - y;
  });
  return build(c, m.length, m[0]!.length, (r, col) =>
    zeroBlank(m[horizontal ? r : ids[r]!]![horizontal ? ids[col]! : col]!),
  );
});
define("LOOKUP", 2, 3, (a, c) => {
  const lookup = zeroBlank(scalar(c.evaluate(a[0]!))),
    m = matrix(c.evaluate(a[1]!), c);
  let keys: readonly Scalar[], values: readonly Scalar[];
  if (a[2]) {
    if (m.length > 1 && m[0]!.length > 1) fail();
    keys = m.flat();
    const result = matrix(c.evaluate(a[2]), c);
    if (result.length > 1 && result[0]!.length > 1) fail();
    values = result.flat();
    if (values.length !== keys.length) fail("#N/A");
  } else if (m[0]!.length > m.length) {
    keys = m[0]!;
    values = m[m.length - 1]!;
  } else {
    keys = m.map((row) => row[0]!);
    values = m.map((row) => row[row.length - 1]!);
  }
  let found = -1;
  for (let i = 0; i < keys.length; i++) {
    c.operation();
    const v = keys[i]!;
    if (v.type !== lookup.type || v.type === "error") continue;
    if (compare(v, lookup) <= 0) found = i;
  }
  return found < 0 ? err("#N/A") : zeroBlank(values[found]!);
});

/** Host responses are explicit modeled results; undefined never becomes a fabricated Excel result. */
for (const name of ["GETPIVOTDATA", "RTD", "IMAGE"] as const)
  hostFunction(define(
    name,
    name === "GETPIVOTDATA" ? 2 : name === "RTD" ? 3 : 1,
    name === "GETPIVOTDATA" ? 254 : name === "RTD" ? 255 : 5,
    (a, c) => {
      const v = a.map((e, i) =>
        name === "GETPIVOTDATA" && i === 1 ? text("") : c.evaluate(e),
      );
      const missing = (i: number) =>
        v[i] === undefined ||
        ("kind" in v[i]! && (v[i] as { kind: string }).kind === "omitted");
      v.forEach((s, i) => {
        if ((name !== "GETPIVOTDATA" || i !== 1) && !missing(i)) scalar(s);
      });
      if (name === "GETPIVOTDATA") {
        if (a.length % 2 !== 0) fail();
        const r = ref(a[1]!, c); // Supply stable pivot geometry, rather than losing it in the cell's display value.
        v[1] = text(
          `${r.sheet}!R${r.firstRow}C${r.firstColumn}:R${r.firstRow + r.height - 1}C${r.firstColumn + r.width - 1}`,
        );
      }
      if (name === "RTD") {
        if (missing(1)) v[1] = text("");
        if (scalar(v[0]!).type !== "string" || scalar(v[1]!).type !== "string")
          fail();
      }
      if (name === "IMAGE") {
        if (
          scalar(v[0]!).type !== "string" ||
          (!missing(1) && scalar(v[1]!).type !== "string")
        )
          fail();
        const source = functionText(scalar(v[0]!));
        if (!/^https:\/\//i.test(source)) fail();
        const sizing = missing(2) ? 0 : integer(v[2]!);
        if (sizing < 0 || sizing > 3) fail();
        if (
          sizing === 3 &&
          ((missing(3) && missing(4)) ||
            (!missing(3) && numeric(v[3]!) < 1) ||
            (!missing(4) && numeric(v[4]!) < 1))
        )
          fail();
        if (sizing !== 3 && (!missing(3) || !missing(4))) fail();
      }
      const response = c.services?.invoke(name, v, c.address);
      if (response === undefined)
        return c.unavailable(
          `${name} requires an explicit host service adapter`,
        );
      matrix(response, c);
      return response;
    },
  ));

/** Grouping supports scalar aggregators and flat groups; advanced layouts stay explicitly unavailable. */
function aggregateHandler(pivot: boolean): ExtendedFunction {
  return (a, c) => {
    const fields = matrix(c.evaluate(a[0]!), c),
      columns = pivot ? matrix(c.evaluate(a[1]!), c) : undefined,
      values = matrix(c.evaluate(a[pivot ? 2 : 1]!), c),
      fn = c.evaluate(a[pivot ? 3 : 2]!);
    if (!("kind" in fn) || fn.kind !== "lambda") fail();
    if (
      values.length !== fields.length ||
      (columns && columns.length !== fields.length)
    )
      fail();
    const base = pivot ? 4 : 3,
      headers = optionInteger(a, c, base, -1);
    if (headers < -1 || headers > 3) fail();
    const hasHeader =
      headers === 1 ||
      headers === 3 ||
      (headers === -1 &&
        values[0]![0]!.type === "string" &&
        values[1]?.[0]?.type === "number");
    const showHeader =
      headers === 2 ||
      headers === 3 ||
      (headers === -1 &&
        (fields[0]!.length > 1 || (columns?.[0]?.length ?? 0) > 1));
    const rowDepth = optionInteger(a, c, base + 1, 1),
      rowSort = optionInteger(a, c, base + 2, 1);
    const colDepth = pivot ? optionInteger(a, c, base + 3, 1) : 0,
      colSort = pivot ? optionInteger(a, c, base + 4, 1) : 1;
    const filterValue = optional(a, c, base + (pivot ? 5 : 3)),
      filter = filterValue === undefined ? undefined : matrix(filterValue, c);
    if (!pivot) {
      const relation = optionInteger(a, c, 7, 0);
      if (relation !== 0 && relation !== 1) fail();
    }
    if (filter && (filter.length !== fields.length || filter[0]!.length !== 1))
      fail();
    if (
      Math.abs(rowDepth) > 1 ||
      Math.abs(colDepth) > 1 ||
      fields[0]!.length > 1 ||
      (columns && columns[0]!.length > 1) ||
      (pivot && values[0]!.length > 1)
    )
      return c.unavailable(
        "GROUPBY/PIVOTBY hierarchical subtotals and multi-field pivot layouts require further implementation",
      );
    if (
      rowSort === 0 ||
      Math.abs(rowSort) > fields[0]!.length + values[0]!.length ||
      (pivot && (colSort === 0 || Math.abs(colSort) > 1))
    )
      fail();
    if (pivot && optionInteger(a, c, 10, 0) !== 0)
      return c.unavailable(
        "PIVOTBY relative aggregation requires two-argument aggregate support",
      );
    const records = fields
      .map((row, i) => ({
        row,
        col: columns?.[i] ?? [],
        values: values[i]!,
        i,
      }))
      .filter(
        (r) => !(hasHeader && r.i === 0) && (!filter || bool(filter[r.i]![0]!)),
      );
    if (!records.length) fail("#CALC!");
    const distinct = (rows: readonly (readonly Scalar[])[]) => {
      const map = new Map<string, readonly Scalar[]>();
      for (const row of rows) {
        c.operation();
        map.set(key(row), row);
      }
      return [...map.values()];
    };
    const rowKeys = distinct(records.map((r) => r.row)),
      colKeys = pivot ? distinct(records.map((r) => r.col)) : [[]];
    const summarize = (
      rk: readonly Scalar[] | undefined,
      ck: readonly Scalar[] | undefined,
      j: number,
    ): Scalar => {
      const group = records
        .filter((r) => {
          c.operation();
          return (
            (!rk || key(r.row) === key(rk)) && (!ck || key(r.col) === key(ck))
          );
        })
        .map((r) => [r.values[j]!]);
      const result = fn.invoke([
        { kind: "array", rows: group.length ? group : [[{ type: "blank" }]] },
      ]);
      return functionScalar(result);
    };
    rowKeys.sort((x, y) => {
      c.operation();
      const i = Math.abs(rowSort) - 1;
      return (
        Math.sign(rowSort) *
        compare(
          i < fields[0]!.length
            ? x[i]!
            : summarize(x, undefined, i - fields[0]!.length),
          i < fields[0]!.length
            ? y[i]!
            : summarize(y, undefined, i - fields[0]!.length),
        )
      );
    });
    colKeys.sort((x, y) => {
      c.operation();
      return Math.sign(colSort) * compare(x[0] ?? num(0), y[0] ?? num(0));
    });
    const rowAxis: (readonly Scalar[] | undefined)[] = [...rowKeys],
      colAxis: (readonly Scalar[] | undefined)[] = [...colKeys];
    if (rowDepth)
      rowDepth < 0 ? rowAxis.unshift(undefined) : rowAxis.push(undefined);
    if (colDepth)
      colDepth < 0 ? colAxis.unshift(undefined) : colAxis.push(undefined);
    const out: Scalar[][] = [];
    if (pivot)
      out.push([text(""), ...colAxis.map((k) => k?.[0] ?? text("Total"))]);
    else if (showHeader)
      out.push(
        hasHeader
          ? [...fields[0]!, ...values[0]!]
          : [
              text("Row Field 1"),
              ...values[0]!.map((_, i) => text(`Value ${i + 1}`)),
            ],
      );
    budget(
      c,
      rowAxis.length + out.length,
      1 + (pivot ? colAxis.length : values[0]!.length),
    );
    for (const rk of rowAxis)
      out.push([
        ...(rk ?? [text("Total")]),
        ...(pivot
          ? colAxis.map((ck) => summarize(rk, ck, 0))
          : values[0]!.map((_, j) => summarize(rk, undefined, j))),
      ]);
    return { kind: "array", rows: out };
  };
}
define("GROUPBY", 3, 8, aggregateHandler(false));
define("PIVOTBY", 4, 11, aggregateHandler(true));
export const lookupFunctions: FunctionRegistry = registry;
