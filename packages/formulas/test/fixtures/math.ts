import type { FormulaScalarValue } from "../../src/evaluator.ts";
export interface MathCase {
  name: string; formula: string; expected: FormulaScalarValue | FormulaScalarValue[][];
  cells?: Record<string, FormulaScalarValue>; dateSystem?: "1900" | "1904"; tolerance?: number;
  oracle?: "excel" | "host" | "nondeterministic"; random?: number;
}
const n = (value: number): FormulaScalarValue => ({ type: "number", value });
const e = (value: `#${string}` = "#NUM!"): FormulaScalarValue => ({ type: "error", value });
const s = (value: string): FormulaScalarValue => ({ type: "string", value });
const matrix = (rows: number[][]) => rows.map(row => row.map(n));
// Independently authored examples; expected constants derive from elementary identities.
const scalar: [string, number | string, string, FormulaScalarValue][] = [
  ["ACOS(1)",0,"ACOS(1.01)",e()], ["ACOSH(1)",0,"ACOSH(0.99)",e()],
  ["ACOT(0)",Math.PI/2,"ACOT(\"bad\")",e("#VALUE!")], ["ACOTH(2)",0.5493061443340548,"ACOTH(1)",e()],
  ["ARABIC(\" mxmvii \")",1997,"ARABIC(123)",e("#VALUE!")],
  ["ASIN(1)",Math.PI/2,"ASIN(-1.01)",e()], ["ASINH(0)",0,"ASINH(\"x\")",e("#VALUE!")],
  ["ATAN(1)",Math.PI/4,"ATAN(#N/A)",e("#N/A")], ["ATAN2(1,1)",Math.PI/4,"ATAN2(0,0)",e("#DIV/0!")],
  ["ATANH(0)",0,"ATANH(1)",e()], ["BASE(31,16,4)","001F","BASE(1,1)",e()],
  ["CEILING.PRECISE(-4.3)",-4,"CEILING.PRECISE(\"bad\")",e("#VALUE!")],
  ["COMBIN(10,3)",120,"COMBIN(2,3)",e()], ["COMBINA(4,3)",20,"COMBINA(-1,1)",e()],
  ["COS(0)",1,"COS(\"x\")",e("#VALUE!")], ["COSH(0)",1,"COSH(1000)",e()],
  ["COT(PI()/4)",1,"COT(0)",e("#DIV/0!")], ["COTH(1)",1.3130352854993312,"COTH(0)",e("#DIV/0!")],
  ["CSC(PI()/2)",1,"CSC(0)",e("#DIV/0!")], ["CSCH(1)",0.8509181282393216,"CSCH(0)",e("#DIV/0!")],
  ["DECIMAL(\"ff\",16)",255,"DECIMAL(\"2\",2)",e()], ["DEGREES(PI())",180,"DEGREES(\"x\")",e("#VALUE!")],
  ["EVEN(-3)",-4,"EVEN(\"x\")",e("#VALUE!")], ["EXP(1)",2.718281828459045,"EXP(710)",e()],
  ["FACT(5.9)",120,"FACT(171)",e()], ["FACTDOUBLE(7)",105,"FACTDOUBLE(-1)",e()],
  ["FLOOR.PRECISE(-4.3)",-5,"FLOOR.PRECISE(\"bad\")",e("#VALUE!")],
  ["GCD(24,36)",12,"GCD(-1,2)",e()], ["ISO.CEILING(-4.3,-2)",-4,"ISO.CEILING(\"x\")",e("#VALUE!")],
  ["LCM(6,8)",24,"LCM(9007199254740992,1)",e()], ["LN(1)",0,"LN(0)",e()],
  ["LOG(100)",2,"LOG(2,1)",e()], ["LOG10(1000)",3,"LOG10(-1)",e()],
  ["MDETERM(2)",2,"MDETERM(\"x\")",e("#VALUE!")],
  ["MROUND(-10,-3)",-9,"MROUND(-1,2)",e()], ["MULTINOMIAL(2,3,4)",1260,"MULTINOMIAL(-1,2)",e()],
  ["ODD(0)",1,"ODD(\"x\")",e("#VALUE!")], ["PERCENTOF(25,100)",0.25,"PERCENTOF(1,0)",e("#DIV/0!")],
  ["PI()",Math.PI,"PI(1)",e("#VALUE!")], ["POWER(2,10)",1024,"POWER(-1,0.5)",e()],
  ["QUOTIENT(-10,3)",-3,"QUOTIENT(1,0)",e("#DIV/0!")], ["RADIANS(180)",Math.PI,"RADIANS(\"x\")",e("#VALUE!")],
  ["ROMAN(499,4)","ID","ROMAN(4000)",e("#VALUE!")],
  ["SEC(0)",1,"SEC(134217728)",e()], ["SECH(0)",1,"SECH(\"x\")",e("#VALUE!")],
  ["SERIESSUM(2,1,1,3)",6,"SERIESSUM(1,1,1,\"x\")",e("#VALUE!")],
  ["SIGN(-7)",-1,"SIGN(\"x\")",e("#VALUE!")], ["SIN(PI()/2)",1,"SIN(\"x\")",e("#VALUE!")],
  ["SINH(0)",0,"SINH(1000)",e()], ["SQRT(9)",3,"SQRT(-1)",e()],
  ["SQRTPI(1)",1.7724538509055159,"SQRTPI(-1)",e()],
  ["SUMSQ(3,4)",25,"SUMSQ(1,#N/A)",e("#N/A")],
  ["SUMX2MY2(3,4)",-7,"SUMX2MY2(1,#N/A)",e("#N/A")],
  ["SUMX2PY2(3,4)",25,"SUMX2PY2(1,#N/A)",e("#N/A")],
  ["SUMXMY2(3,4)",1,"SUMXMY2(1,#N/A)",e("#N/A")],
  ["TAN(PI()/4)",1,"TAN(\"x\")",e("#VALUE!")], ["TANH(0)",0,"TANH(\"x\")",e("#VALUE!")],
  ["TRUNC(-123.456,-1)",-120,"TRUNC(\"x\")",e("#VALUE!")],
];
export const cases: MathCase[] = scalar.flatMap(([formula, expected, edge, error]) => [
  { name: `math ${formula}`, formula, expected: typeof expected === "number" ? n(expected) : s(expected), tolerance: 1e-12 },
  { name: `math ${edge}`, formula: edge, expected: error },
]);
cases.push(
  { name: "inverse scalar", formula: "MINVERSE(4)", expected: matrix([[.25]]) },
  { name: "inverse singular", formula: "MINVERSE(0)", expected: e() },
  { name: "matrix product scalar", formula: "MMULT(3,4)", expected: matrix([[12]]) },
  { name: "matrix product text", formula: 'MMULT("x",1)', expected: e("#VALUE!") },
  { name: "identity", formula: "MUNIT(2)", expected: matrix([[1,0],[0,1]]) },
  { name: "identity zero", formula: "MUNIT(0)", expected: e() },
  { name: "sequence descending", formula: "SEQUENCE(2,3,10,-2)", expected: matrix([[10,8,6],[4,2,0]]) },
  { name: "sequence zero", formula: "SEQUENCE(0)", expected: e() },
  { name: "random scalar", formula: "RAND()", expected: n(.25), oracle: "nondeterministic", random: .25 },
  { name: "random arity", formula: "RAND(1)", expected: e("#VALUE!") },
  { name: "random between", formula: "RANDBETWEEN(2,5)", expected: n(3), oracle: "nondeterministic", random: .25 },
  { name: "random between reversed", formula: "RANDBETWEEN(5,2)", expected: e() },
  { name: "random matrix", formula: "RANDARRAY(2,2,0,8,TRUE)", expected: matrix([[2,2],[2,2]]), oracle: "nondeterministic", random: .25 },
  { name: "random matrix reversed", formula: "RANDARRAY(1,1,2,1)", expected: e("#VALUE!") },
  { name: "reference sumsq", formula: "SUMSQ(Inputs!A1:A4)", cells: { A1: n(3), A2: s("4"), A3: { type: "boolean", value: true }, A4: n(4) }, expected: n(25) },
  { name: "literal sumsq coercion", formula: 'SUMSQ("4",TRUE)', expected: n(17) },
  { name: "matrix determinant pivot", formula: "MDETERM(Inputs!A1:B2)", cells: { A1:n(0), B1:n(2), A2:n(3), B2:n(4) }, expected:n(-6) },
  { name: "matrix inverse pivot", formula: "MINVERSE(Inputs!A1:B2)", cells: { A1:n(0), B1:n(2), A2:n(4), B2:n(0) }, expected:matrix([[0,.25],[.5,0]]) },
  { name: "matrix rectangular product", formula: "MMULT(Inputs!A1:B2,Inputs!A3:A4)", cells: { A1:n(1), B1:n(2), A2:n(3), B2:n(4), A3:n(5), A4:n(6) }, expected:matrix([[17],[39]]) },
  { name: "matrix shape error", formula: "MDETERM(Inputs!A1:A2)", cells: { A1:n(1), A2:n(2) }, expected:e("#VALUE!") },
  { name: "matrix blank error", formula: "MINVERSE(Inputs!A1:B2)", cells: { A1:n(1), B2:n(1) }, expected:e("#VALUE!") },
  { name: "nested engineering norm", formula: "SQRT(SUMSQ(Inputs!A1:A2))", cells: { A1:n(3), A2:n(4) }, expected:n(5) },
  { name: "1900 serial math", formula: "TRUNC(Inputs!A1)", cells: { A1:n(46000.75) }, dateSystem:"1900", expected:n(46000) },
  { name: "1904 serial math", formula: "TRUNC(Inputs!A1)", cells: { A1:n(46000.75) }, dateSystem:"1904", expected:n(46000) },
  { name: "sum paired length mismatch", formula: "SUMXMY2(Inputs!A1:A2,Inputs!B1)", cells: { A1:n(1), A2:n(2), B1:n(1) }, expected:e("#N/A") },
  { name: "power zero negative", formula: "POWER(0,-1)", expected:e("#DIV/0!") },
  { name: "factorial zero", formula: "FACT(0)", expected:n(1) },
  { name: "round decimal multiple", formula: "CEILING.PRECISE(0.07,0.01)", expected:n(.07), tolerance:1e-15 },
  { name: "series polynomial", formula: "SERIESSUM(2,0,1,Inputs!A1:A3)", cells: { A1:n(1), A2:n(2), A3:n(3) }, expected:n(17) },
);
for (let form=0;form<5;form++) cases.push({ name:`roman form ${form}`,formula:`ROMAN(499,${form})`,expected:s(["CDXCIX","LDVLIV","XDIX","VDIV","ID"][form]!) });
const extremes: [string, number | FormulaScalarValue][] = [
  ["ACOS(-1)",Math.PI],["ASIN(-1)",-Math.PI/2],["ACOSH(1.000000000001)",1.4142764231805424e-6],
  ["ACOT(-1)",3*Math.PI/4],["ACOTH(-2)",-.5493061443340548],["ASINH(1e300)",691.4686750787736],
  ["ATAN2(-1,0)",Math.PI],["ATANH(0.999999999999)",14.162095209226402],
  ["BASE(9007199254740992,2)",e()],["BASE(15.9,2,8)",s("00001111")],["BASE(1,10,256)",e()],
  ["DECIMAL(\"11111111\",2)",255],["DECIMAL(\"-1\",10)",e()],["ARABIC(\"-MMXI\")",-2011],
  ["ARABIC(\"\")",0],["ARABIC(\"hello\")",e("#VALUE!")],["ROMAN(1,TRUE)",s("I")],["ROMAN(499,FALSE)",s("ID")],
  ["CEILING.PRECISE(4.1,-2)",6],["FLOOR.PRECISE(4.1,-2)",4],["ISO.CEILING(5,0)",0],
  ["COMBIN(0,0)",1],["COMBIN(1000,500)",2.7028824094543655e299],["COMBIN(2000,1000)",e()],
  ["COMBINA(0,0)",1],["COSH(-1)",1.5430806348152437],["COTH(1000)",1],["CSCH(-1)",-.8509181282393216],
  ["COT(-134217728)",e()],["CSC(134217728)",e()],["SECH(1000)",0],
  ["DEGREES(0)",0],["EVEN(0)",0],["EVEN(2)",2],["ODD(-2)",-3],["ODD(-3)",-3],
  ["EXP(-710)",0],["POWER(1e-200,2)",0],["EXP(-1000)",0],["FACT(170)",7.257415615307999e306],["FACT(-1)",e()],["FACTDOUBLE(0)",1],["FACTDOUBLE(301)",e()],
  ["GCD(0,0)",0],["GCD(9007199254740992)",e()],["GCD(12.9,8.9)",4],["LCM(0,8)",0],
  ["LN(1e300)",690.7755278982137],["LOG(8,2)",3],["LOG10(1e-300)",-300],
  ["MROUND(3,2)",4],["MROUND(8,0)",0],["MULTINOMIAL(0,0)",1],["MULTINOMIAL(2.9,3.1)",10],
  ["POWER(0,0)",e()],["POWER(1e308,2)",e()],["QUOTIENT(7,-2)",-3],["SIGN(0)",0],
  ["SIN(-PI()/2)",-1],["SINH(-1)",-1.1752011936438014],["SQRT(1e300)",1e150],["SQRTPI(0)",0],
  ["SUMSQ(1e308)",e()],["TAN(0)",0],["TANH(1000)",1],["TRUNC(0.29,2)",.29],["TRUNC(1e308,308)",1e308],
  ["TRUNC(1e-307,307)",1e-307],["TRUNC(100,-309)",0],
];
for (const [formula, expected] of extremes) cases.push({ name:`math boundary ${formula}`, formula, expected:typeof expected==="number"?n(expected):expected });
cases.push(
  { name:"sequence defaults",formula:"SEQUENCE(2)",expected:matrix([[1],[2]]) },
  { name:"sequence fractional dimensions",formula:"SEQUENCE(2.9,1)",expected:matrix([[1],[2]]) },
  { name:"random array defaults",formula:"RANDARRAY()",expected:matrix([[.25]]),oracle:"nondeterministic",random:.25 },
  { name:"series coefficient error",formula:"SERIESSUM(1,0,1,Inputs!A1:A2)",cells:{A1:n(1),A2:e("#N/A")},expected:e("#N/A") },
  { name:"paired ignores nonnumeric positions",formula:"SUMX2PY2(Inputs!A1:A3,Inputs!B1:B3)",cells:{A1:n(2),A2:s("3"),A3:n(4),B1:n(1),B2:n(2),B3:n(3)},expected:n(30) },
  { name:"percentof aggregate references",formula:"PERCENTOF(Inputs!A1:A2,Inputs!A1:A3)",cells:{A1:n(20),A2:n(30),A3:n(50)},expected:n(.5) },
  { name:"matrix product dimension error",formula:"MMULT(Inputs!A1:A2,Inputs!A1:A2)",cells:{A1:n(1),A2:n(2)},expected:e("#VALUE!") },
  { name:"matrix inverse singular dependent rows",formula:"MINVERSE(Inputs!A1:B2)",cells:{A1:n(1),B1:n(2),A2:n(2),B2:n(4)},expected:e() },
);
cases.push(
 {name:"factorial truncates before overflow check",formula:"FACT(170.5)",expected:n(7.257415615307999e306)},
 {name:"factorial rejects next integer",formula:"FACT(171)",expected:e()},
 {name:"mround opposite tiny normal signs",formula:"MROUND(-1e-200,1e-200)",expected:e()},
 {name:"mround reverse tiny normal signs",formula:"MROUND(1e-200,-1e-200)",expected:e()},
);
