import type { FormulaScalarValue } from "../../src/evaluator.ts";

// Original synthetic data and expectations, released under the repository MIT license.
const s = (value: string): FormulaScalarValue => ({ type: "string", value });
const n = (value: number): FormulaScalarValue => ({ type: "number", value });
const e = (value: `#${string}`): FormulaScalarValue => ({ type: "error", value });
const b: FormulaScalarValue = { type: "blank" };
export interface DatabaseFixture {
  name: string;
  formula: string;
  expected: FormulaScalarValue;
  cells: Record<string, FormulaScalarValue>;
  dateSystem?: "1900" | "1904";
  tolerance?: number;
}
const base: Record<string, FormulaScalarValue> = {
  A1: s("Team"), B1: s("Amount"), C1: s("Serial"),
  A2: s("North"), B2: n(2), C2: n(45000),
  A3: s("northwest"), B3: n(4), C3: n(45001),
  A4: s("South"), B4: n(8), C4: n(45002),
  A5: s("North"), B5: s("16"), C5: n(45003),
  A6: s("South"), B6: b, C6: n(45004),
  E1: s("Team"), E2: s("North"),
};
const expression = (name: string, criteria = "Inputs!E1:E2", field = '"Amount"') => `${name}(Inputs!A1:C6,${field},${criteria})`;
export const cases: DatabaseFixture[] = [];
const results: Record<string, number> = { DAVERAGE: 3, DCOUNT: 2, DCOUNTA: 3, DMAX: 4, DMIN: 2, DPRODUCT: 8, DSTDEV: Math.SQRT2, DSTDEVP: 1, DSUM: 6, DVAR: 2, DVARP: 1 };
for (const [name, result] of Object.entries(results)) {
  cases.push({ name: `${name}: prefix criteria and numeric-only field`, formula: expression(name), expected: n(result), cells: { ...base } });
  const empty = ["DAVERAGE", "DSTDEV", "DSTDEVP", "DVAR", "DVARP"].includes(name) ? e("#DIV/0!") : n(0);
  cases.push({ name: `${name}: no records`, formula: expression(name), expected: empty, cells: { ...base, E2: s("West") } });
  cases.push({ name: `${name}: invalid field`, formula: expression(name, undefined, '"Missing"'), expected: e("#VALUE!"), cells: { ...base } });
}
cases.push(
  { name: "DGET: unique text", formula: expression("DGET", undefined, '"Team"'), expected: s("northwest"), cells: { ...base, E2: s("=northwest") } },
  { name: "DGET: no record", formula: expression("DGET"), expected: e("#VALUE!"), cells: { ...base, E2: s("West") } },
  { name: "DGET: multiple records", formula: expression("DGET"), expected: e("#NUM!"), cells: { ...base } },
  { name: "DGET: blank field becomes zero", formula: expression("DGET"), expected: n(0), cells: { ...base, E1: s("Serial"), E2: n(45004) } },
  { name: "DSUM: AND with duplicate numeric headers", formula: expression("DSUM", "Inputs!E1:G2"), expected: n(4), cells: { ...base, F1: s("Amount"), F2: s(">2"), G1: s("Amount"), G2: s("<8") } },
  { name: "DSUM: OR does not double count", formula: expression("DSUM", "Inputs!E1:E3"), expected: n(6), cells: { ...base, E3: s("=North") } },
  { name: "DSUM: blank criterion selects all", formula: expression("DSUM"), expected: n(14), cells: { ...base, E2: b } },
  { name: "DSUM: escaped wildcard", formula: expression("DSUM"), expected: n(2), cells: { ...base, A2: s("N*"), E2: s("=N~*") } },
  { name: "DCOUNT: omitted field counts records", formula: expression("DCOUNT", undefined, ""), expected: n(3), cells: { ...base } },
  { name: "DCOUNTA: omitted field counts records", formula: expression("DCOUNTA", undefined, ""), expected: n(3), cells: { ...base } },
  { name: "DSUM: nested arithmetic", formula: `${expression("DSUM")}*2+1`, expected: n(13), cells: { ...base } },
  { name: "DSUM: field by reference", formula: expression("DSUM", undefined, "Inputs!H1"), expected: n(6), cells: { ...base, H1: s("amount") } },
  { name: "DAVERAGE: avoids intermediate overflow", formula: expression("DAVERAGE"), expected: n(1e308), cells: { ...base, B2: n(1e308), B3: n(1e308) } },
  { name: "DSUM: numeric overflow", formula: expression("DSUM"), expected: e("#NUM!"), cells: { ...base, B2: n(1e308), B3: n(1e308) } },
  { name: "DPRODUCT: numeric overflow", formula: expression("DPRODUCT"), expected: e("#NUM!"), cells: { ...base, B2: n(1e200), B3: n(1e200) } },
  { name: "DVAR: stable small spread", formula: expression("DVAR"), expected: n(2), cells: { ...base, B2: n(1e12), B3: n(1e12 + 2) } },
  { name: "DVARP: variance overflow", formula: expression("DVARP"), expected: e("#NUM!"), cells: { ...base, B2: n(-1e308), B3: n(1e308) } },
  { name: "DSTDEVP: finite extreme spread", formula: expression("DSTDEVP"), expected: n(1e308), cells: { ...base, B2: n(-1e308), B3: n(1e308) } },
);
for (const dateSystem of ["1900", "1904"] as const) cases.push({
  name: `DSUM: date serial criteria (${dateSystem})`, formula: expression("DSUM", "Inputs!E1:F2", '"Serial"'), expected: n(90005), dateSystem,
  cells: { ...base, E1: s("Serial"), E2: s(">=45002"), F1: s("Serial"), F2: s("<45004") },
});

for (const name of Object.keys(results)) {
  cases.push({ name: `${name}: matched error field`, formula: expression(name), expected: name === "DCOUNT" ? n(1) : name === "DCOUNTA" ? n(3) : e("#N/A"), cells: { ...base, B2: e("#N/A") } });
}
cases.push(
  { name: "DGET: unique error", formula: expression("DGET"), expected: e("#N/A"), cells: { ...base, E2: s("=northwest"), B3: e("#N/A") } },
  { name: "DVARP: small finite variance", formula: expression("DVARP"), expected: n(2.5e-201), tolerance: 1e-215, cells: { ...base, B2: n(1e-100), B3: n(2e-100) } },
);
