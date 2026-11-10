import type { FormulaScalarValue } from "../../src/evaluator.ts";
export interface FinancialFixture {
  name: string;
  formula: string;
  expected: FormulaScalarValue;
  cells?: Record<string, FormulaScalarValue>;
  dateSystem?: "1900" | "1904";
  tolerance?: number;
  oracle?: "excel" | "host" | "nondeterministic";
}
const number = (value: number): FormulaScalarValue => ({
  type: "number",
  value,
});
// Original, independently calculated examples. See docs/formula-categories/financial.md.
const samples: readonly [string, number, string, `#${string}`?][] = [
  [
    "ACCRINT(43831,44013,43921,0.1,1000,2)",
    25,
    "ACCRINT(43831,44013,43921,0,1000,2)",
  ],
  ["ACCRINTM(43831,44197,0.1)", 100, "ACCRINTM(43831,43831,0.1)"],
  [
    "AMORDEGRC(2400,39679,39813,300,1,0.15,1)",
    776,
    "AMORDEGRC(2400,39679,39813,300,1,0.4,1)",
  ],
  [
    "AMORLINC(1000,43831,44013,100,1,0.1)",
    100,
    "AMORLINC(1000,43831,44013,100,1,0.1,2)",
  ],
  ["COUPDAYBS(43921,44197,2)", 90, "COUPDAYBS(44197,43831,2)"],
  ["COUPDAYS(43921,44197,2)", 180, "COUPDAYS(43831,44197,3)"],
  ["COUPDAYSNC(43921,44197,2)", 90, "COUPDAYSNC(43831,44197,2,5)"],
  ["COUPNCD(43921,44197,2)", 44013, "COUPNCD(43831,44197,0)"],
  ["COUPNUM(43921,44197,2)", 2, "COUPNUM(44197,44197,2)"],
  ["COUPPCD(43921,44197,2)", 43831, "COUPPCD(43831,44197,2,-1)"],
  ["CUMIPMT(0.1,2,100,1,2,0)", -15.23809523809524, "CUMIPMT(0,2,100,1,2,0)"],
  ["CUMPRINC(0.1,2,100,1,2,0)", -100, "CUMPRINC(0.1,2,100,0,2,0)"],
  ["DB(1000,100,5,1)", 369, "DB(1000,100,5,1,0)"],
  ["DDB(1000,100,5,2)", 240, "DDB(1000,100,5,6)"],
  ["DISC(43831,44197,95,100)", 0.05, "DISC(43831,44197,0,100)"],
  ["DOLLARDE(1.02,16)", 1.125, "DOLLARDE(1.02,0)", "#DIV/0!"],
  ["DOLLARFR(1.125,16)", 1.02, "DOLLARFR(1.125,-1)"],
  [
    "DURATION(43831,44197,0.05,0.05,1)",
    1,
    "DURATION(43831,44197,-0.05,0.05,1)",
  ],
  ["EFFECT(0.1,2)", 0.1025, "EFFECT(0.1,0)"],
  ["FV(0.1,2,-100)", 210, "FV(1e308,3,-100)"],
  ["FVSCHEDULE(100,Inputs!A1:A2)", 132, "FVSCHEDULE(100,Inputs!B1)", "#VALUE!"],
  ["INTRATE(43831,44197,100,105)", 0.05, "INTRATE(44197,43831,100,105)"],
  ["IPMT(0.1,1,2,100)", -10, "IPMT(0.1,0,2,100)"],
  ["IRR(Inputs!C1:C2)", 0.1, "IRR(Inputs!A1:A2)"],
  ["ISPMT(0.1,1,2,100)", -5, "ISPMT(0.1,1,0,100)", "#DIV/0!"],
  [
    "MDURATION(43831,44197,0.05,0.05,1)",
    1 / 1.05,
    "MDURATION(43831,44197,0.05,-0.05,1)",
  ],
  ["MIRR(Inputs!C1:C2,0.1,0.1)", 0.1, "MIRR(Inputs!A1:A2,0.1,0.1)"],
  ["NOMINAL(0.1025,2)", 0.1, "NOMINAL(0,2)"],
  ["NPER(0,-10,100)", 10, "NPER(0,0,100)", "#DIV/0!"],
  ["NPV(0.1,110,121)", 200, "NPV(-1,100)", "#DIV/0!"],
  [
    "ODDFPRICE(43921,44378,43831,44013,0.1,0,100,2)",
    112.5,
    "ODDFPRICE(43921,44378,43831,44013,-0.1,0,100,2)",
  ],
  [
    "ODDFYIELD(43921,44378,43831,44013,0.1,112.5,100,2)",
    0,
    "ODDFYIELD(43921,44378,43831,44013,0.1,0,100,2)",
  ],
  [
    "ODDLPRICE(44013,44197,43831,0.05,0.05,100,1)",
    105 / 1.025 - 2.5,
    "ODDLPRICE(43831,44197,44013,0.05,0.05,100,1)",
  ],
  [
    "ODDLYIELD(44013,44197,43831,0.05,99.93902439024392,100,1)",
    0.05,
    "ODDLYIELD(44197,44013,43831,0.05,100,100,1)",
  ],
  ["PDURATION(0.1,100,121)", 2, "PDURATION(0,100,121)"],
  ["PMT(0,10,100)", -10, "PMT(0,0,100)", "#DIV/0!"],
  ["PPMT(0.1,1,2,100)", -47.61904761904762, "PPMT(0.1,3,2,100)"],
  [
    "PRICE(43831,44197,0.05,0.05,100,1)",
    100,
    "PRICE(43831,44197,-0.05,0.05,100,1)",
  ],
  ["PRICEDISC(43831,44197,0.05,100)", 95, "PRICEDISC(43831,44197,0,100)"],
  [
    "PRICEMAT(44013,44197,43831,0.1,0.05)",
    110 / 1.025 - 5,
    "PRICEMAT(44013,44197,43831,-0.1,0.05)",
  ],
  ["PV(0,10,-10)", 100, "PV(-1,2,10)", "#DIV/0!"],
  ["RATE(2,0,-100,121)", 0.1, "RATE(0,0,-100,121)"],
  ["RECEIVED(43831,44197,100,0.05)", 100 / 0.95, "RECEIVED(43831,44197,100,1)"],
  ["RRI(2,100,121)", 0.1, "RRI(0,100,121)"],
  ["SLN(1000,100,5)", 180, "SLN(1000,100,0)", "#DIV/0!"],
  ["SYD(1000,100,5,1)", 300, "SYD(1000,100,5,0)"],
  [
    "TBILLEQ(43831,44011,0.05)",
    (365 * 0.05) / (360 - 0.05 * 180),
    "TBILLEQ(43831,44197,0.05)",
  ],
  ["TBILLPRICE(43831,44011,0.05)", 97.5, "TBILLPRICE(43831,44011,0)"],
  [
    "TBILLYIELD(43831,44011,97.5)",
    (2.5 / 97.5) * 2,
    "TBILLYIELD(43831,44011,0)",
  ],
  ["VDB(1000,100,5,0,2)", 640, "VDB(1000,100,5,2,1)"],
  ["XIRR(Inputs!C1:C2,Inputs!D1:D2)", 0.1, "XIRR(Inputs!A1:A2,Inputs!D1:D2)"],
  [
    "XNPV(0.1,Inputs!C1:C2,Inputs!D1:D2)",
    0,
    "XNPV(0.1,Inputs!C1:C2,Inputs!D2:D3)",
  ],
  [
    "YIELD(43831,44197,0.05,100,100,1)",
    0.05,
    "YIELD(43831,44197,0.05,0,100,1)",
  ],
  ["YIELDDISC(43831,44197,95,100)", 5 / 95, "YIELDDISC(43831,44197,0,100)"],
  [
    "YIELDMAT(44013,44197,43831,0.1,102.3170731707317)",
    0.05,
    "YIELDMAT(44013,44197,43831,0.1,0)",
  ],
];
const cells: Record<string, FormulaScalarValue> = {
  A1: number(0.1),
  A2: number(0.2),
  B1: { type: "string", value: "invalid" },
  C1: number(-100),
  C2: number(110),
  D1: number(43831),
  D2: number(44196),
  D3: number(43830),
};
export const cases: FinancialFixture[] = samples.flatMap(
  ([formula, value, error, code]) => [
    {
      name: `financial ${formula.split("(")[0]} success`,
      formula,
      expected: number(value),
      cells,
      tolerance: 1e-8,
    },
    {
      name: `financial ${formula.split("(")[0]} domain`,
      formula: error,
      expected: { type: "error" as const, value: code ?? "#NUM!" },
      cells,
    },
  ],
);
cases.push(
  { name: "treasury bill price rejects equal dates", formula: "TBILLPRICE(45292,45292,0.05)", expected: { type: "error", value: "#NUM!" } },
  {
    name: "financial nested loan",
    formula: "PV(0,10,PMT(0,10,100))",
    expected: number(100),
  },
  {
    name: "financial input edit seed",
    formula: "PMT(0,10,Inputs!A1)",
    cells: { A1: number(100) },
    expected: number(-10),
  },
  {
    name: "financial numeric literal text",
    formula: 'PMT("0",10,100)',
    expected: number(-10),
  },
  {
    name: "financial reference text",
    formula: "PMT(Inputs!A1,10,100)",
    cells: { A1: { type: "string", value: "0" } },
    expected: number(-10),
  },
  {
    name: "financial logical literal",
    formula: "FV(0,TRUE,-100)",
    expected: number(100),
  },
  {
    name: "financial error propagation",
    formula: "PV(#N/A,10,-10)",
    expected: { type: "error", value: "#N/A" },
  },
  {
    name: "financial NPV ignores text in range",
    formula: "NPV(0,Inputs!A1:A3)",
    cells: {
      A1: number(10),
      A2: { type: "string", value: "20" },
      A3: number(30),
    },
    expected: number(40),
  },
  {
    name: "financial negative dollar conversion",
    formula: "DOLLARDE(-1.02,16)",
    expected: number(-1.125),
  },
  {
    name: "financial tiny annuity rate",
    formula: "PMT(1e-14,10,100)",
    expected: number(-10.00000000000055),
    tolerance: 1e-11,
  },
  {
    name: "financial annuity due interest",
    formula: "IPMT(0.1,1,2,100,0,1)",
    expected: number(0),
  },
  {
    name: "financial depreciation partial",
    formula: "VDB(2400,300,10,0,0.875,1.5)",
    expected: number(315),
  },
  {
    name: "financial actual leap coupon",
    formula: "COUPDAYS(43921,44197,2,1)",
    expected: number(182),
  },
  {
    name: "financial 1904 coupon serial",
    formula: "COUPNCD(42459,42735,2)",
    dateSystem: "1904",
    expected: number(42551),
  },
  {
    name: "financial 1900 phantom day",
    formula: "COUPPCD(60,244,2,1)",
    expected: number(60),
  },
);
// Independently derived boundary/identity cases; no cached producer values.
cases.push(
  {
    name: "financial zero yield endpoint",
    formula: "YIELD(43831,44197,0.05,105,100,1)",
    expected: number(0),
    tolerance: 1e-10,
  },
  {
    name: "financial negative bond yield",
    formula: "YIELD(43831,44197,0.05,110,100,1)",
    expected: number(105 / 110 - 1),
    tolerance: 1e-9,
  },
  {
    name: "financial negative PRICE yield rejected",
    formula: "PRICE(43831,44197,0.05,-0.01,100,1)",
    expected: { type: "error", value: "#NUM!" },
  },
  {
    name: "financial leap annual accrual",
    formula: "ACCRINTM(43831,44197,0.1,1000,1)",
    expected: number(100),
  },
  {
    name: "financial first period amortization",
    formula: "AMORLINC(1000,43831,44013,100,0,0.1)",
    expected: number(50),
  },
  {
    name: "financial subsequent depreciation cap",
    formula: "DDB(1000,900,5,1)",
    expected: number(100),
  },
  {
    name: "financial DB short first year",
    formula: "DB(1000,100,5,1,6)",
    expected: number(184.5),
  },
  {
    name: "financial cumulative interest annuity due",
    formula: "CUMIPMT(0.1,2,100,1,2,1)",
    expected: number(-100 / 21),
  },
  {
    name: "financial fractional VDB interval",
    formula: "VDB(1000,100,5,0.5,1.5,2,TRUE)",
    expected: number(320),
  },
  {
    name: "financial no switch VDB",
    formula: "VDB(1000,100,5,4,5,2,TRUE)",
    expected: number(29.6),
  },
  {
    name: "financial switched VDB",
    formula: "VDB(1000,0,5,4,5)",
    expected: number(108),
  },
  {
    name: "financial ACCRINT since first coupon",
    formula: "ACCRINT(43831,44013,44197,0.1,1000,2,0,FALSE)",
    expected: number(50),
  },
  {
    name: "financial true quarterly coupon frequency",
    formula: "COUPNUM(43921,44197,4)",
    expected: number(4),
  },
  {
    name: "financial European month end",
    formula: "COUPDAYBS(43921,44197,2,4)",
    expected: number(89),
  },
  {
    name: "financial actual 360 remaining days",
    formula: "COUPDAYSNC(43921,44197,2,2)",
    expected: number(92),
  },
  {
    name: "financial actual 365 coupon",
    formula: "COUPDAYS(43921,44197,2,3)",
    expected: number(182.5),
  },
  {
    name: "financial negative IRR",
    formula: "IRR(Inputs!A1:A2)",
    cells: { A1: number(-100), A2: number(90) },
    expected: number(-0.1),
    tolerance: 1e-9,
  },
  {
    name: "financial tiny cashflow IRR",
    formula: "IRR(Inputs!A1:A2)",
    cells: { A1: number(-1e-200), A2: number(1.1e-200) },
    expected: number(0.1),
    tolerance: 1e-9,
  },
  {
    name: "financial date truncation XNPV",
    formula: "XNPV(0.1,Inputs!A1:A2,Inputs!B1:B2)",
    cells: {
      A1: number(-100),
      A2: number(110),
      B1: number(43831.9),
      B2: number(44196.5),
    },
    expected: number(0),
    tolerance: 1e-10,
  },
  {
    name: "financial blank schedule zero rate",
    formula: "FVSCHEDULE(100,Inputs!A1:A2)",
    cells: { A1: number(0.1) },
    expected: number(110),
  },
  {
    name: "financial mismatched XIRR vectors",
    formula: "XIRR(Inputs!A1:A2,Inputs!B1:B3)",
    cells: {
      A1: number(-100),
      A2: number(110),
      B1: number(43831),
      B2: number(44196),
      B3: number(44561),
    },
    expected: { type: "error", value: "#NUM!" },
  },
  {
    name: "financial invalid numeric text date",
    formula: 'COUPNUM("invalid",44197,2)',
    expected: { type: "error", value: "#VALUE!" },
  },
);

cases.push({
  name: "financial same-day bill yield",
  formula: "TBILLYIELD(43831,43831,99)",
  expected: { type: "error", value: "#NUM!" },
});
cases.push(
 {name:"native RATE tiny future fails convergence",formula:"RATE(1000,0,-1,1e-100)",expected:{type:"error",value:"#NUM!"},oracle:"excel"},
 {name:"native RATE no finite root",formula:"RATE(1000,0,-1,0)",expected:{type:"error",value:"#NUM!"},oracle:"excel"},
);
for (const [label, sign] of [["positive",1],["negative",-1]] as const) {
 const cells = {A1:{type:"number" as const,value:0},A2:{type:"number" as const,value:sign},A3:{type:"number" as const,value:-sign},A4:{type:"number" as const,value:sign},B1:{type:"number" as const,value:43831},B2:{type:"number" as const,value:44196},B3:{type:"number" as const,value:44561},B4:{type:"number" as const,value:44926}};
 cases.push(
  {name:`IRR ${label} residual has no finite root`,formula:"IRR(Inputs!A1:A4)",cells,expected:{type:"error",value:"#NUM!"}},
  {name:`XIRR ${label} residual has no finite root`,formula:"XIRR(Inputs!A1:A4,Inputs!B1:B4)",cells,expected:{type:"error",value:"#NUM!"}},
 );
}
cases.push(
 {name:"IRR leading zero retains a genuine root",formula:"IRR(Inputs!A1:A3)",cells:{A1:{type:"number",value:0},A2:{type:"number",value:-100},A3:{type:"number",value:110}},expected:{type:"number",value:.1}},
 {name:"XIRR leading zero retains a genuine root",formula:"XIRR(Inputs!A1:A3,Inputs!B1:B3)",cells:{A1:{type:"number",value:0},A2:{type:"number",value:-100},A3:{type:"number",value:110},B1:{type:"number",value:43831},B2:{type:"number",value:44196},B3:{type:"number",value:44561}},expected:{type:"number",value:.1}},
);
for (const guess of ["",",-0.9"]) {
 const cells = {A1:{type:"number" as const,value:0},A2:{type:"number" as const,value:100},A3:{type:"number" as const,value:-100},A4:{type:"number" as const,value:1},B1:{type:"number" as const,value:43831},B2:{type:"number" as const,value:47481},B3:{type:"number" as const,value:47481},B4:{type:"number" as const,value:43831}};
 cases.push({name:`XIRR cancelled same-date terms leave no root ${guess||"default"}`,formula:`XIRR(Inputs!A1:A4,Inputs!B1:B4${guess})`,cells,expected:{type:"error",value:"#NUM!"}});
 cases.push({name:`XIRR cancelled same-date terms retain a genuine root ${guess||"default"}`,formula:`XIRR(Inputs!A1:A5,Inputs!B1:B5${guess})`,cells:{...cells,A4:{type:"number",value:-1},A5:{type:"number",value:2},B5:{type:"number",value:44196}},expected:{type:"number",value:1}});
}
cases.push({name:"XIRR exact same-date net retains a small term between huge cancellations",formula:"XIRR(Inputs!A1:A5,Inputs!B1:B5)",cells:{A1:{type:"number",value:0},A2:{type:"number",value:1e300},A3:{type:"number",value:1},A4:{type:"number",value:-1e300},A5:{type:"number",value:-2},B1:{type:"number",value:43831},B2:{type:"number",value:47481},B3:{type:"number",value:47481},B4:{type:"number",value:47481},B5:{type:"number",value:47846}},expected:{type:"number",value:1}});
for (const future of [1e-3,1e-5,1e-10]) for (const guess of ["",`,${future-1}`]) {
 const cells = {A1:{type:"number" as const,value:-1},A2:{type:"number" as const,value:future},B1:{type:"number" as const,value:43831},B2:{type:"number" as const,value:44196}};
 cases.push(
  {name:`IRR negative root log precision ${future} ${guess||"default"}`,formula:`IRR(Inputs!A1:A2${guess})`,cells,expected:{type:"number",value:future-1}},
  {name:`XIRR negative root log precision ${future} ${guess||"default"}`,formula:`XIRR(Inputs!A1:A2,Inputs!B1:B2${guess})`,cells,expected:{type:"number",value:future-1}},
 );
}
