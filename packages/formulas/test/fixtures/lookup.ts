import type { FormulaScalarValue as S } from "../../src/evaluator.ts";
const n = (value: number): S => ({ type: "number", value });
const s = (value: string): S => ({ type: "string", value });
const e = (value: `#${string}`): S => ({ type: "error", value });
const b = (value: boolean): S => ({ type: "boolean", value });
const mat = (v: (number | string)[][]): S[][] =>
  v.map((row) => row.map((x) => (typeof x === "number" ? n(x) : s(x))));
interface LookupCase {
  name: string;
  formula: string;
  expected: S | S[][];
  cells?: Record<string, S>;
  dateSystem?: "1900" | "1904";
  requiresService?: boolean;
  oracle?: "excel" | "host" | "nondeterministic";
}
const grid = { A1: n(3), B1: n(30), A2: n(1), B2: n(10), A3: n(2), B3: n(20) };
export const cases: LookupCase[] = [
  { name: "ADDRESS default", formula: "ADDRESS(2,3)", expected: s("$C$2") },
  {
    name: "ADDRESS R1C1",
    formula: "ADDRESS(2,3,2,FALSE)",
    expected: s("R2C[3]"),
  },
  {
    name: "ADDRESS quoted sheet",
    formula: `ADDRESS(1048576,16384,4,TRUE,"O'Brien")`,
    expected: s("'O''Brien'!XFD1048576"),
  },
  {
    name: "ADDRESS bounds",
    formula: "ADDRESS(1048577,1)",
    expected: e("#VALUE!"),
  },
  {
    name: "ADDRESS literal coercion",
    formula: 'ADDRESS("2.9",TRUE)',
    expected: s("$A$2"),
  },
  {
    name: "AREAS contiguous",
    formula: "AREAS(Inputs!A1:B3)",
    expected: n(1),
    cells: grid,
  },
  { name: "AREAS invalid", formula: "AREAS(5)", expected: e("#VALUE!") },
  {
    name: "COLUMN geometry",
    formula: "COLUMN(Inputs!B1)",
    expected: n(2),
    cells: grid,
  },
  {
    name: "COLUMN span",
    formula: "COLUMN(Inputs!A1:B2)",
    expected: mat([[1, 2]]),
    cells: grid,
  },
  { name: "COLUMN invalid", formula: "COLUMN(3)", expected: e("#VALUE!") },
  {
    name: "COLUMNS array",
    formula: "COLUMNS(Inputs!A1:B3)",
    expected: n(2),
    cells: grid,
  },
  { name: "COLUMNS error", formula: "COLUMNS(#N/A)", expected: e("#N/A") },
  {
    name: "ROW geometry",
    formula: "ROW(Inputs!B3)",
    expected: n(3),
    cells: grid,
  },
  {
    name: "ROW span",
    formula: "ROW(Inputs!A1:A3)",
    expected: mat([[1], [2], [3]]),
    cells: grid,
  },
  { name: "ROW invalid", formula: "ROW(3)", expected: e("#VALUE!") },
  {
    name: "ROWS array",
    formula: "ROWS(Inputs!A1:B3)",
    expected: n(3),
    cells: grid,
  },
  { name: "ROWS error", formula: "ROWS(#REF!)", expected: e("#REF!") },
  {
    name: "CHOOSECOLS reversed repeated",
    formula: "CHOOSECOLS(Inputs!A1:B3,-1,1,1)",
    expected: mat([
      [30, 3, 3],
      [10, 1, 1],
      [20, 2, 2],
    ]),
    cells: grid,
  },
  {
    name: "CHOOSECOLS zero",
    formula: "CHOOSECOLS(Inputs!A1:B3,0)",
    expected: e("#VALUE!"),
    cells: grid,
  },
  {
    name: "CHOOSEROWS reverse",
    formula: "CHOOSEROWS(Inputs!A1:B3,-1,1)",
    expected: mat([
      [2, 20],
      [3, 30],
    ]),
    cells: grid,
  },
  {
    name: "CHOOSEROWS outside",
    formula: "CHOOSEROWS(Inputs!A1:B3,4)",
    expected: e("#VALUE!"),
    cells: grid,
  },
  {
    name: "TAKE last rows",
    formula: "TAKE(Inputs!A1:B3,-2)",
    expected: mat([
      [1, 10],
      [2, 20],
    ]),
    cells: grid,
  },
  {
    name: "TAKE oversized",
    formula: "TAKE(Inputs!A1:B3,100,1)",
    expected: mat([[3], [1], [2]]),
    cells: grid,
  },
  {
    name: "TAKE empty",
    formula: "TAKE(Inputs!A1:B3,0)",
    expected: e("#CALC!"),
    cells: grid,
  },
  {
    name: "DROP end",
    formula: "DROP(Inputs!A1:B3,-1)",
    expected: mat([
      [3, 30],
      [1, 10],
    ]),
    cells: grid,
  },
  {
    name: "DROP all",
    formula: "DROP(Inputs!A1:B3,3)",
    expected: e("#CALC!"),
    cells: grid,
  },
  {
    name: "EXPAND padding",
    formula: "EXPAND(Inputs!A1:B1,2,3,0)",
    expected: mat([
      [3, 30, 0],
      [0, 0, 0],
    ]),
    cells: grid,
  },
  {
    name: "EXPAND shrink",
    formula: "EXPAND(Inputs!A1:B3,2)",
    expected: e("#VALUE!"),
    cells: grid,
  },
  {
    name: "FILTER rows",
    formula: "FILTER(Inputs!A1:B3,Inputs!C1:C3)",
    expected: mat([
      [3, 30],
      [2, 20],
    ]),
    cells: { ...grid, C1: b(true), C2: b(false), C3: b(true) },
  },
  {
    name: "FILTER fallback",
    formula: 'FILTER(Inputs!A1:B3,Inputs!C1:C3,"empty")',
    expected: s("empty"),
    cells: { ...grid, C1: n(0), C2: n(0), C3: n(0) },
  },
  {
    name: "FILTER include error",
    formula: "FILTER(Inputs!A1:B3,Inputs!C1:C3)",
    expected: e("#N/A"),
    cells: { ...grid, C1: n(1), C2: e("#N/A"), C3: n(1) },
  },
  {
    name: "FORMULATEXT nested",
    formula: "FORMULATEXT(Inputs!A1)",
    expected: e("#N/A"),
    cells: { A1: n(20) },
  },
  {
    name: "HSTACK padding",
    formula: "HSTACK(Inputs!A1:A3,Inputs!B1)",
    expected: [
      [n(3), n(30)],
      [n(1), e("#N/A")],
      [n(2), e("#N/A")],
    ],
    cells: grid,
  },
  {
    name: "HSTACK error value",
    formula: "HSTACK(1,#N/A)",
    expected: [[n(1), e("#N/A")]],
  },
  {
    name: "VSTACK padding",
    formula: "VSTACK(Inputs!A1:B1,Inputs!A2)",
    expected: [
      [n(3), n(30)],
      [n(1), e("#N/A")],
    ],
    cells: grid,
  },
  {
    name: "VSTACK error value",
    formula: "VSTACK(1,#N/A)",
    expected: [[n(1)], [e("#N/A")]],
  },
  {
    name: "HYPERLINK label",
    formula: 'HYPERLINK("https://example.org","Report")',
    expected: s("Report"),
  },
  {
    name: "HYPERLINK error",
    formula: 'HYPERLINK(#REF!,"Report")',
    expected: e("#REF!"),
  },
  {
    name: "INDIRECT A1",
    formula: 'INDIRECT("Inputs!B2")',
    expected: n(10),
    cells: grid,
  },
  {
    name: "INDIRECT R1C1",
    formula: 'INDIRECT("Inputs!R3C2",FALSE)',
    expected: n(20),
    cells: grid,
  },
  {
    name: "INDIRECT invalid",
    formula: 'INDIRECT("Inputs!XFE1")',
    expected: e("#REF!"),
  },
  {
    name: "LOOKUP vector",
    formula: "LOOKUP(2.5,Inputs!A1:A3,Inputs!B1:B3)",
    expected: n(20),
    cells: { A1: n(1), A2: n(2), A3: n(3), B1: n(10), B2: n(20), B3: n(30) },
  },
  {
    name: "LOOKUP below minimum",
    formula: "LOOKUP(0,Inputs!A1:A3)",
    expected: e("#N/A"),
    cells: { A1: n(1), A2: n(2), A3: n(3) },
  },
  {
    name: "LOOKUP array",
    formula: "LOOKUP(2,Inputs!A1:B3)",
    expected: n(20),
    cells: { A1: n(1), A2: n(2), A3: n(3), B1: n(10), B2: n(20), B3: n(30) },
  },
  {
    name: "OFFSET values",
    formula: "OFFSET(Inputs!A1,1,1,2,1)",
    expected: mat([[10], [20]]),
    cells: grid,
  },
  {
    name: "OFFSET outside",
    formula: "OFFSET(Inputs!A1,-1,0)",
    expected: e("#REF!"),
    cells: grid,
  },
  {
    name: "SORT rows",
    formula: "SORT(Inputs!A1:B3)",
    expected: mat([
      [1, 10],
      [2, 20],
      [3, 30],
    ]),
    cells: grid,
  },
  {
    name: "SORT bad index",
    formula: "SORT(Inputs!A1:B3,3)",
    expected: e("#VALUE!"),
    cells: grid,
  },
  {
    name: "SORTBY descending",
    formula: "SORTBY(Inputs!A1:B3,Inputs!B1:B3,-1)",
    expected: mat([
      [3, 30],
      [2, 20],
      [1, 10],
    ]),
    cells: grid,
  },
  {
    name: "SORTBY mismatch",
    formula: "SORTBY(Inputs!A1:B3,Inputs!B1:B2)",
    expected: e("#VALUE!"),
    cells: grid,
  },
  {
    name: "TOCOL row scan",
    formula: "TOCOL(Inputs!A1:B3)",
    expected: mat([[3], [30], [1], [10], [2], [20]]),
    cells: grid,
  },
  {
    name: "TOCOL ignore errors",
    formula: "TOCOL(Inputs!A1:B1,2)",
    expected: mat([[2]]),
    cells: { A1: e("#DIV/0!"), B1: n(2) },
  },
  {
    name: "TOCOL invalid ignore",
    formula: "TOCOL(1,4)",
    expected: e("#VALUE!"),
  },
  {
    name: "TOROW column scan",
    formula: "TOROW(Inputs!A1:B3,0,TRUE)",
    expected: mat([[3, 1, 2, 30, 10, 20]]),
    cells: grid,
  },
  {
    name: "TOROW invalid ignore",
    formula: "TOROW(1,-1)",
    expected: e("#VALUE!"),
  },
  {
    name: "TRANSPOSE grid",
    formula: "TRANSPOSE(Inputs!A1:B3)",
    expected: mat([
      [3, 1, 2],
      [30, 10, 20],
    ]),
    cells: grid,
  },
  {
    name: "TRANSPOSE error",
    formula: "TRANSPOSE(#N/A)",
    expected: [[e("#N/A")]],
  },
  {
    name: "TRIMRANGE blank edges",
    formula: "TRIMRANGE(Inputs!A1:C3)",
    expected: mat([[5]]),
    cells: { B2: n(5) },
  },
  {
    name: "TRIMRANGE invalid mode",
    formula: "TRIMRANGE(1,4)",
    expected: e("#VALUE!"),
  },
  {
    name: "UNIQUE stable case insensitive",
    formula: "UNIQUE(Inputs!A1:A3)",
    expected: mat([["North"], ["South"]]),
    cells: { A1: s("North"), A2: s("NORTH"), A3: s("South") },
  },
  {
    name: "UNIQUE exactly once",
    formula: "UNIQUE(Inputs!A1:A3,FALSE,TRUE)",
    expected: mat([[2]]),
    cells: { A1: n(1), A2: n(1), A3: n(2) },
  },
  {
    name: "UNIQUE no singles",
    formula: "UNIQUE(Inputs!A1:A2,FALSE,TRUE)",
    expected: e("#CALC!"),
    cells: { A1: n(1), A2: n(1) },
  },
  {
    name: "WRAPCOLS padded",
    formula: "WRAPCOLS(Inputs!A1:A3,2,0)",
    expected: mat([
      [3, 2],
      [1, 0],
    ]),
    cells: grid,
  },
  {
    name: "WRAPCOLS invalid count",
    formula: "WRAPCOLS(1,0)",
    expected: e("#VALUE!"),
  },
  {
    name: "WRAPROWS padded",
    formula: "WRAPROWS(Inputs!A1:A3,2,0)",
    expected: mat([
      [3, 1],
      [2, 0],
    ]),
    cells: grid,
  },
  {
    name: "WRAPROWS invalid matrix",
    formula: "WRAPROWS(Inputs!A1:B3,2)",
    expected: e("#VALUE!"),
    cells: grid,
  },
  {
    name: "GROUPBY sales totals",
    formula: "GROUPBY(Inputs!A1:A3,Inputs!B1:B3,LAMBDA(x,SUM(x)),0,0)",
    expected: mat([
      ["East", 30],
      ["West", 10],
    ]),
    cells: {
      A1: s("East"),
      A2: s("West"),
      A3: s("East"),
      B1: n(10),
      B2: n(10),
      B3: n(20),
    },
  },
  {
    name: "GROUPBY mismatched rows",
    formula: "GROUPBY(Inputs!A1:A3,Inputs!B1:B2,LAMBDA(x,SUM(x)),0,0)",
    expected: e("#VALUE!"),
    cells: grid,
  },
  {
    name: "PIVOTBY sales matrix",
    formula:
      "PIVOTBY(Inputs!A1:A3,Inputs!B1:B3,Inputs!C1:C3,LAMBDA(x,SUM(x)),0,0,1,0)",
    expected: mat([
      ["", "Q1", "Q2"],
      ["East", 10, 20],
      ["West", 5, 0],
    ]),
    cells: {
      A1: s("East"),
      A2: s("East"),
      A3: s("West"),
      B1: s("Q1"),
      B2: s("Q2"),
      B3: s("Q1"),
      C1: n(10),
      C2: n(20),
      C3: n(5),
    },
  },
  {
    name: "PIVOTBY mismatch",
    formula: "PIVOTBY(Inputs!A1:A3,Inputs!B1:B2,Inputs!C1:C3,LAMBDA(x,SUM(x)))",
    expected: e("#VALUE!"),
    cells: grid,
  },
  {
    name: "GETPIVOTDATA modeled response",
    formula: 'GETPIVOTDATA("Sales",Inputs!A1,"Region","East")',
    expected: n(125),
    cells: { A1: s("Pivot") },
    requiresService: true,
    oracle: "host",
  },
  {
    name: "GETPIVOTDATA invalid pairs",
    formula: 'GETPIVOTDATA("Sales",Inputs!A1,"Region")',
    expected: e("#VALUE!"),
  },
  {
    name: "RTD modeled quote",
    formula: 'RTD("Quotes.Feed","","ABC","Last")',
    expected: n(42.5),
    requiresService: true,
    oracle: "host",
  },
  {
    name: "RTD invalid progid",
    formula: 'RTD(1,"","ABC")',
    expected: e("#VALUE!"),
  },
  {
    name: "IMAGE modeled alt rendering",
    formula: 'IMAGE("https://example.org/picture.png","Product")',
    expected: s("[image: Product]"),
    requiresService: true,
    oracle: "host",
  },
  {
    name: "IMAGE invalid sizing",
    formula: 'IMAGE("https://example.org/picture.png","Product",4)',
    expected: e("#VALUE!"),
  },
  {
    name: "dates retained across reshape 1900",
    formula: "TRANSPOSE(Inputs!A1:A2)",
    expected: mat([[60, 61]]),
    cells: { A1: n(60), A2: n(61) },
    dateSystem: "1900",
  },
  {
    name: "dates retained across reshape 1904",
    formula: "TRANSPOSE(Inputs!A1:A2)",
    expected: mat([[0, 1]]),
    cells: { A1: n(0), A2: n(1) },
    dateSystem: "1904",
  },
  {
    name: "nested sort take",
    formula: "TAKE(SORT(Inputs!A1:B3,2,-1),2)",
    expected: mat([
      [3, 30],
      [2, 20],
    ]),
    cells: grid,
  },
];

// Additional cases use explicit omissions to distinguish missing options from zero or blank cells.
cases.push(
  {
    name: "FORMULATEXT self metadata",
    formula: "FORMULATEXT(Results!A1)",
    expected: s("=FORMULATEXT(Results!A1)"),
  },
  {
    name: "ADDRESS omitted options",
    formula: 'ADDRESS(2,3,,,"Inputs")',
    expected: s("Inputs!$C$2"),
  },
  {
    name: "ADDRESS lower invalid boundary",
    formula: "ADDRESS(0.999,1)",
    expected: e("#VALUE!"),
  },
  {
    name: "ADDRESS largest valid column",
    formula: "ADDRESS(1,16384)",
    expected: s("$XFD$1"),
  },
  { name: "ROW no argument", formula: "ROW()", expected: n(1) },
  { name: "COLUMN no argument", formula: "COLUMN()", expected: n(1) },
  {
    name: "TAKE omitted rows",
    formula: "TAKE(Inputs!A1:B3,,1)",
    expected: mat([[3], [1], [2]]),
    cells: grid,
  },
  {
    name: "DROP omitted rows",
    formula: "DROP(Inputs!A1:B3,,-1)",
    expected: mat([[3], [1], [2]]),
    cells: grid,
  },
  {
    name: "EXPAND omitted columns",
    formula: "EXPAND(Inputs!A1:B1,2,,0)",
    expected: mat([
      [3, 30],
      [0, 0],
    ]),
    cells: grid,
  },
  {
    name: "EXPAND worksheet overflow",
    formula: "EXPAND(1,1048577)",
    expected: e("#NUM!"),
  },
  {
    name: "FILTER empty error",
    formula: "FILTER(Inputs!A1:A2,Inputs!B1:B2)",
    expected: e("#CALC!"),
    cells: { A1: n(1), A2: n(2), B1: n(0), B2: n(0) },
  },
  {
    name: "FILTER columns",
    formula: "FILTER(Inputs!A1:B3,Inputs!C1:D1)",
    expected: mat([[30], [10], [20]]),
    cells: { ...grid, C1: b(false), D1: b(true) },
  },
  {
    name: "HYPERLINK omitted label",
    formula: 'HYPERLINK("#Inputs!A1")',
    expected: s("#Inputs!A1"),
  },
  {
    name: "INDIRECT reversed endpoints",
    formula: 'INDIRECT("Inputs!B2:A1")',
    expected: mat([
      [3, 30],
      [1, 10],
    ]),
    cells: grid,
  },
  {
    name: "OFFSET default geometry",
    formula: "OFFSET(Inputs!A1:A2,1,0)",
    expected: mat([[1], [2]]),
    cells: grid,
  },
  {
    name: "OFFSET column boundary",
    formula: "OFFSET(Inputs!A1,0,16384)",
    expected: e("#REF!"),
  },
  {
    name: "SORT omitted index",
    formula: "SORT(Inputs!A1:B3,,-1)",
    expected: mat([
      [3, 30],
      [2, 20],
      [1, 10],
    ]),
    cells: grid,
  },
  {
    name: "SORT blanks last",
    formula: "SORT(Inputs!A1:A3)",
    expected: mat([[1], [2], [0]]),
    cells: { A1: n(2), A3: n(1) },
  },
  {
    name: "SORTBY default ascending",
    formula: "SORTBY(Inputs!A1:B3,Inputs!B1:B3)",
    expected: mat([
      [1, 10],
      [2, 20],
      [3, 30],
    ]),
    cells: grid,
  },
  {
    name: "TOCOL column scan omitted ignore",
    formula: "TOCOL(Inputs!A1:B3,,TRUE)",
    expected: mat([[3], [1], [2], [30], [10], [20]]),
    cells: grid,
  },
  {
    name: "TOROW ignores blanks",
    formula: "TOROW(Inputs!A1:A3,1)",
    expected: mat([[5]]),
    cells: { A2: n(5) },
  },
  {
    name: "UNIQUE columns",
    formula: "UNIQUE(Inputs!A1:C2,TRUE)",
    expected: mat([
      [1, 2],
      [3, 4],
    ]),
    cells: { A1: n(1), A2: n(3), B1: n(1), B2: n(3), C1: n(2), C2: n(4) },
  },
  {
    name: "TRIMRANGE retain edges",
    formula: "TRIMRANGE(Inputs!A1:A3,0,0)",
    expected: mat([[0], [5], [0]]),
    cells: { A2: n(5) },
  },
  {
    name: "GROUPBY default grand total",
    formula: "GROUPBY(Inputs!A1:A3,Inputs!B1:B3,LAMBDA(x,SUM(x)))",
    expected: mat([
      ["East", 30],
      ["West", 10],
      ["Total", 40],
    ]),
    cells: {
      A1: s("East"),
      A2: s("West"),
      A3: s("East"),
      B1: n(10),
      B2: n(10),
      B3: n(20),
    },
  },
  {
    name: "GROUPBY explicit headers",
    formula: "GROUPBY(Inputs!A1:A3,Inputs!B1:B3,LAMBDA(x,SUM(x)),3,0)",
    expected: mat([
      ["Region", "Sales"],
      ["East", 10],
      ["West", 20],
    ]),
    cells: {
      A1: s("Region"),
      B1: s("Sales"),
      A2: s("East"),
      B2: n(10),
      A3: s("West"),
      B3: n(20),
    },
  },
  {
    name: "GROUPBY grand total on top",
    formula: "GROUPBY(Inputs!A1:A3,Inputs!B1:B3,LAMBDA(x,SUM(x)),0,-1)",
    expected: mat([
      ["Total", 40],
      ["East", 30],
      ["West", 10],
    ]),
    cells: {
      A1: s("East"),
      A2: s("West"),
      A3: s("East"),
      B1: n(10),
      B2: n(10),
      B3: n(20),
    },
  },
);

// Deterministic, independently computed permutation/reshape expectations; no runtime import.
for (let height = 1; height <= 5; height++)
  for (let width = 1; width <= 4; width++) {
    const cells: Record<string, S> = {};
    const input: S[][] = [];
    for (let r = 0; r < height; r++) {
      const row: S[] = [];
      for (let c = 0; c < width; c++) {
        const value = n((r + 1) * 100 + c + 1);
        cells[String.fromCharCode(65 + c) + (r + 1)] = value;
        row.push(value);
      }
      input.push(row);
    }
    const range = `Inputs!A1:${String.fromCharCode(64 + width)}${height}`;
    cases.push({
      name: `generated transpose ${height}x${width}`,
      formula: `TRANSPOSE(${range})`,
      expected: Array.from({ length: width }, (_, c) =>
        input.map((row) => row[c]!),
      ),
      cells,
    });
    cases.push({
      name: `generated reverse rows ${height}x${width}`,
      formula: `SORT(${range},1,-1)`,
      expected: [...input].reverse(),
      cells,
    });
    cases.push({
      name: `generated flatten rows ${height}x${width}`,
      formula: `TOROW(${range})`,
      expected: [input.flat()],
      cells,
    });
    cases.push({
      name: `generated reshape columns ${height}x${width}`,
      formula: `WRAPCOLS(TOCOL(${range},0,TRUE),${height})`,
      expected: input,
      cells,
    });
  }
