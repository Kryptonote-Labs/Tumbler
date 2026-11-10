import type { FormulaScalarValue } from "../../src/evaluator.ts";
import type { CubeSnapshot } from "../../src/functions/cube.ts";

const s = (value: string): FormulaScalarValue => ({ type: "string", value });
const n = (value: number): FormulaScalarValue => ({ type: "number", value });
const e = (value: `#${string}`): FormulaScalarValue => ({ type: "error", value });
const a = "[Product].[Apple]", b = "[Product].[Banana]", measure = "[Measures].[Sales]";
/** Original MIT-licensed synthetic snapshot; all totals are explicitly supplied. */
export const cubeFixtureConnections: Readonly<Record<string, CubeSnapshot>> = {
  Sales: {
    members: {
      [a]: { caption: "Apple", properties: { Color: s("Red"), Weight: n(120) }, sortValues: { [measure]: 20 } },
      [b]: { caption: "Banana", properties: { Color: s("Yellow") }, sortValues: { [measure]: 10 } },
      [measure]: { caption: "Sales" },
      "[Measures].[Goal]": { caption: "Goal" },
      "[Measures].[Status]": { caption: "Status" },
      "[Measures].[Trend]": { caption: "Trend" },
      "[Measures].[Weight]": { caption: "Weight" },
      "[Time].[Current]": { caption: "Current" },
    },
    sets: { Products: [b, a], Empty: [] },
    kpis: { Revenue: [measure, "[Measures].[Goal]", "[Measures].[Status]", "[Measures].[Trend]", "[Measures].[Weight]", "[Time].[Current]"] },
    aggregates: {
      "[]": n(30),
      [JSON.stringify([measure])]: n(30),
      [JSON.stringify([a, measure].sort())]: n(20),
      [JSON.stringify([a, b, measure].sort())]: n(30),
      [JSON.stringify(["[Measures].[Goal]"])]: n(40),
      [JSON.stringify([b])]: { type: "blank" },
    },
  },
};

interface CubeCase {
  name: string;
  formula: string;
  expected: FormulaScalarValue | FormulaScalarValue[][];
  cells?: Record<string, FormulaScalarValue>;
  dateSystem?: "1900" | "1904";
  requiresService?: boolean;
  oracle?: "excel" | "host" | "nondeterministic";
}
/** Success fixtures require the explicit Sales snapshot (or an equivalent real cube). */
const modeledCases: CubeCase[] = [
  { name: "member caption", formula: `CUBEMEMBER("Sales","${a}")`, expected: s("Apple") },
  { name: "member custom caption", formula: `CUBEMEMBER("Sales","${a}","Fruit")`, expected: s("Fruit") },
  { name: "member reference", formula: 'CUBEMEMBER("Sales",Inputs!A1)', cells: { A1: s(a) }, expected: s("Apple") },
  { name: "missing member", formula: 'CUBEMEMBER("Sales","[Missing]")', expected: e("#N/A") },
  { name: "missing connection", formula: `CUBEMEMBER("Missing","${a}")`, expected: e("#NAME?") },
  { name: "property text", formula: `CUBEMEMBERPROPERTY("Sales","${a}","Color")`, expected: s("Red") },
  { name: "property number", formula: `CUBEMEMBERPROPERTY("Sales","${a}","Weight")`, expected: n(120) },
  { name: "property reference", formula: `CUBEMEMBERPROPERTY("Sales","${a}",Inputs!A1)`, cells: { A1: s("Color") }, expected: s("Red") },
  { name: "missing property", formula: `CUBEMEMBERPROPERTY("Sales","${a}","Missing")`, expected: e("#N/A") },
  { name: "KPI value caption", formula: 'CUBEKPIMEMBER("Sales","Revenue",1)', expected: s("Revenue") },
  { name: "KPI goal caption", formula: 'CUBEKPIMEMBER("Sales","Revenue",2,"Target")', expected: s("Target") },
  { name: "KPI invalid property", formula: 'CUBEKPIMEMBER("Sales","Revenue",7)', expected: e("#N/A") },
  { name: "missing KPI", formula: 'CUBEKPIMEMBER("Sales","Missing",1)', expected: e("#N/A") },
  { name: "set default caption", formula: 'CUBESET("Sales","Products")', expected: s("") },
  { name: "set caption", formula: 'CUBESET("Sales","Products","Fruit")', expected: s("Fruit") },
  { name: "set invalid sort", formula: 'CUBESET("Sales","Products","Fruit",7)', expected: e("#VALUE!") },
  { name: "set missing sort measure", formula: 'CUBESET("Sales","Products","Fruit",1)', expected: e("#VALUE!") },
  { name: "set missing expression", formula: 'CUBESET("Sales","Missing")', expected: e("#N/A") },
  { name: "set count", formula: 'CUBESETCOUNT(CUBESET("Sales","Products","Fruit"))', expected: n(2) },
  { name: "empty set count", formula: 'CUBESETCOUNT(CUBESET("Sales","Empty"))', expected: n(0) },
  { name: "caption is not a set", formula: 'CUBESETCOUNT("Fruit")', expected: e("#VALUE!") },
  { name: "rank first", formula: 'CUBERANKEDMEMBER("Sales","Products",1)', expected: s("Banana") },
  { name: "rank last", formula: 'CUBERANKEDMEMBER("Sales","Products",2)', expected: s("Apple") },
  { name: "rank sorted numeric", formula: `CUBERANKEDMEMBER("Sales",CUBESET("Sales","Products","Fruit",2,"${measure}"),1)`, expected: s("Apple") },
  { name: "rank alpha", formula: 'CUBERANKEDMEMBER("Sales",CUBESET("Sales","Products","Fruit",3),1,"First")', expected: s("First") },
  { name: "rank out of range", formula: 'CUBERANKEDMEMBER("Sales","Products",3)', expected: e("#N/A") },
  { name: "rank zero", formula: 'CUBERANKEDMEMBER("Sales","Products",0)', expected: e("#N/A") },
  { name: "value default measure", formula: 'CUBEVALUE("Sales")', expected: n(30) },
  { name: "value member identity despite caption", formula: `CUBEVALUE("Sales",CUBEMEMBER("Sales","${a}","Same"),"${measure}")`, expected: n(20) },
  { name: "value set aggregation", formula: `CUBEVALUE("Sales",CUBESET("Sales","Products","Fruit"),"${measure}")`, expected: n(30) },
  { name: "value KPI goal", formula: 'CUBEVALUE("Sales",CUBEKPIMEMBER("Sales","Revenue",2,"Target"))', expected: n(40) },
  { name: "value null becomes empty text", formula: `CUBEVALUE("Sales","${b}")`, expected: s("") },
  { name: "value missing member", formula: 'CUBEVALUE("Sales","[Missing]")', expected: e("#N/A") },
  { name: "input error propagation", formula: 'CUBEVALUE("Sales",Inputs!A1)', cells: { A1: e("#REF!") }, expected: e("#REF!") },
  { name: "date system independent cube measure", formula: `CUBEVALUE("Sales","${measure}")`, dateSystem: "1904", expected: n(30) },
];

export const cases: CubeCase[] = [
  ...modeledCases.map(c => ({ ...c, requiresService: true, oracle: "host" as const })),
  { name: "member literal exceeds Excel MDX limit", formula: `CUBEMEMBER("Sales","${"x".repeat(256)}")`, expected: e("#VALUE!"), oracle: "excel" },
  { name: "set literal exceeds Excel MDX limit", formula: `CUBESET("Sales","${"x".repeat(256)}")`, expected: e("#VALUE!"), oracle: "excel" },
  { name: "reference error without host", formula: 'CUBEVALUE("Sales",Inputs!A1)', cells: { A1: e("#REF!") }, expected: e("#REF!"), oracle: "excel" },
];
