import type { FormulaScalarValue } from "../../src/evaluator.ts";
const n = (value: number): FormulaScalarValue => ({ type: "number", value });
const s = (value: string): FormulaScalarValue => ({ type: "string", value });
const b = (value: boolean): FormulaScalarValue => ({ type: "boolean", value });
const e = (value: `#${string}`): FormulaScalarValue => ({ type: "error", value });
interface Case {
  name: string; formula: string; expected: FormulaScalarValue | FormulaScalarValue[][];
  cells?: Record<string, FormulaScalarValue>; dateSystem?: "1900" | "1904"; tolerance?: number;
  oracle?: "excel" | "host" | "nondeterministic";
}
const grid = { A1: n(2), B1: n(3), A2: n(4), B2: n(5) };
export const cases: Case[] = [
  { name: "true", formula: "TRUE()", expected: b(true) },
  { name: "false", formula: "FALSE()", expected: b(false) },
  { name: "true arithmetic", formula: "TRUE()+2", expected: n(3) },
  { name: "false arithmetic", formula: "FALSE()*7", expected: n(0) },
  { name: "true extra argument", formula: "TRUE(1)", expected: e("#VALUE!") },
  { name: "false extra argument", formula: "FALSE(1)", expected: e("#VALUE!") },
  { name: "lambda unused body", formula: "LAMBDA(item,item+1)", expected: e("#CALC!") },
  { name: "lambda invocation via let", formula: "LET(increment,LAMBDA(item,item+1),increment(8))", expected: n(9) },
  { name: "lambda wrong invocation arity", formula: "LET(increment,LAMBDA(item,item+1),increment(8,9))", expected: e("#VALUE!") },
  { name: "lambda duplicate parameters", formula: "LAMBDA(item,ITEM,item)", expected: e("#VALUE!") },
  { name: "lambda invalid parameter", formula: "LAMBDA(1,2)", expected: e("#VALUE!") },
  { name: "let sequential", formula: "LET(base,3,doubled,base*2,doubled+1)", expected: n(7) },
  { name: "let case insensitive", formula: "LET(rate,0.2,RATE*100)", expected: n(20) },
  { name: "let shadowing", formula: "LET(item,2,LET(item,9,item)+item)", expected: n(11) },
  { name: "let closure capture", formula: "LET(rate,2,scale,LAMBDA(item,item*rate),LET(rate,7,scale(3)))", expected: n(6) },
  { name: "let reference", formula: "LET(amount,Inputs!A1,amount*1.2)", cells: { A1: n(100) }, expected: n(120) },
  { name: "let error", formula: "LET(item,1/0,item)", expected: e("#DIV/0!") },
  { name: "let invalid name", formula: "LET(1,2,3)", expected: e("#VALUE!") },
  { name: "let invalid count", formula: "LET(item,2)", expected: e("#VALUE!") },
  { name: "byrow totals", formula: "BYROW(Inputs!A1:B2,LAMBDA(items,SUM(items)))", cells: grid, expected: [[n(5)], [n(9)]] },
  { name: "bycol totals", formula: "BYCOL(Inputs!A1:B2,LAMBDA(items,SUM(items)))", cells: grid, expected: [[n(6), n(8)]] },
  { name: "byrow scalar", formula: "BYROW(7,LAMBDA(items,SUM(items)))", expected: [[n(7)]] },
  { name: "bycol scalar", formula: "BYCOL(7,LAMBDA(items,SUM(items)))", expected: [[n(7)]] },
  { name: "byrow invalid lambda", formula: "BYROW(1,2)", expected: e("#VALUE!") },
  { name: "bycol wrong lambda arity", formula: "BYCOL(1,LAMBDA(a,b,a+b))", expected: e("#VALUE!") },
  { name: "byrow nested array", formula: "BYROW(Inputs!A1:B2,LAMBDA(items,items))", cells: grid, expected: e("#CALC!") },
  { name: "bycol nested array", formula: "BYCOL(Inputs!A1:B2,LAMBDA(items,items))", cells: grid, expected: e("#CALC!") },
  { name: "makearray multiplication table", formula: "MAKEARRAY(2,3,LAMBDA(row,col,row*col))", expected: [[n(1),n(2),n(3)],[n(2),n(4),n(6)]] },
  { name: "makearray zero", formula: "MAKEARRAY(0,1,LAMBDA(row,col,1))", expected: e("#VALUE!") },
  { name: "makearray negative", formula: "MAKEARRAY(1,-1,LAMBDA(row,col,1))", expected: e("#VALUE!") },
  { name: "makearray text invalid", formula: 'MAKEARRAY("no",1,LAMBDA(row,col,1))', expected: e("#VALUE!") },
  { name: "makearray wrong lambda", formula: "MAKEARRAY(1,1,LAMBDA(item,item))", expected: e("#VALUE!") },
  { name: "map square", formula: "MAP(Inputs!A1:B2,LAMBDA(item,item^2))", cells: grid, expected: [[n(4),n(9)],[n(16),n(25)]] },
  { name: "map multiple", formula: "MAP(Inputs!A1:A2,Inputs!B1:B2,LAMBDA(a,b,a*b))", cells: grid, expected: [[n(6)],[n(20)]] },
  { name: "map literal text", formula: 'MAP("2",LAMBDA(item,item+1))', expected: [[n(3)]] },
  { name: "map reference text", formula: "MAP(Inputs!A1,LAMBDA(item,item+1))", cells: { A1: s("2") }, expected: [[n(3)]] },
  { name: "map error", formula: "MAP(Inputs!A1:A2,LAMBDA(item,item+1))", cells: { A1: e("#N/A"), A2: n(4) }, expected: [[e("#N/A")],[n(5)]] },
  { name: "map overflow", formula: "MAP(1E308,LAMBDA(item,item*2))", expected: [[e("#NUM!")]] },
  { name: "map wrong arity", formula: "MAP(1,LAMBDA(a,b,a+b))", expected: e("#VALUE!") },
  { name: "reduce sum", formula: "REDUCE(0,Inputs!A1:B2,LAMBDA(total,item,total+item))", cells: grid, expected: n(14) },
  { name: "reduce default seed", formula: "REDUCE(,Inputs!A1:A2,LAMBDA(total,item,total*item))", cells: grid, expected: n(8) },
  { name: "reduce text order", formula: 'REDUCE("",Inputs!A1:B2,LAMBDA(total,item,total&item))', cells: grid, expected: s("2345") },
  { name: "reduce error", formula: "REDUCE(0,Inputs!A1,LAMBDA(total,item,total+item))", cells: { A1: e("#DIV/0!") }, expected: e("#DIV/0!") },
  { name: "reduce wrong lambda", formula: "REDUCE(0,1,LAMBDA(item,item))", expected: e("#VALUE!") },
  { name: "scan row major", formula: "SCAN(0,Inputs!A1:B2,LAMBDA(total,item,total+item))", cells: grid, expected: [[n(2),n(5)],[n(9),n(14)]] },
  { name: "scan default zero", formula: "SCAN(,Inputs!A1:A2,LAMBDA(total,item,total+item))", cells: grid, expected: [[n(2)],[n(6)]] },
  { name: "scan factorial", formula: "SCAN(1,Inputs!A1:B2,LAMBDA(total,item,total*item))", cells: grid, expected: [[n(2),n(6)],[n(24),n(120)]] },
  { name: "scan wrong lambda", formula: "SCAN(0,1,LAMBDA(item,item))", expected: e("#VALUE!") },
  { name: "scan error propagation", formula: "SCAN(0,Inputs!A1:A2,LAMBDA(total,item,total+item))", cells: { A1: e("#N/A"), A2: n(4) }, expected: [[e("#N/A")],[e("#N/A")]] },
  { name: "makearray reference dimensions", formula: "MAKEARRAY(Inputs!A1,Inputs!B1,LAMBDA(row,col,row+col))", cells: { A1: n(2), B1: n(1) }, expected: [[n(2)],[n(3)]] },
  { name: "makearray fractional dimensions", formula: "MAKEARRAY(1.999999999999,1,LAMBDA(row,col,row))", expected: e("#VALUE!"), oracle: "excel" },
  { name: "makearray near zero boundary", formula: "MAKEARRAY(0.999999999999,1,LAMBDA(row,col,1))", expected: e("#VALUE!") },
  { name: "makearray error dimension", formula: "MAKEARRAY(1/0,1,LAMBDA(row,col,1))", expected: e("#DIV/0!") },
  { name: "makearray scalar error body", formula: "MAKEARRAY(1,2,LAMBDA(row,col,1/0))", expected: [[e("#DIV/0!"),e("#DIV/0!")]] },
  { name: "map boolean", formula: "MAP(TRUE(),LAMBDA(item,item+1))", expected: [[n(2)]] },
  { name: "map blank reference", formula: "MAP(Inputs!A1,LAMBDA(item,item))", expected: [[n(0)]] },
  { name: "map nested array", formula: "MAP(1,LAMBDA(item,MAKEARRAY(1,2,LAMBDA(row,col,col))))", expected: e("#CALC!") },
  { name: "reduce scalar", formula: "REDUCE(10,3,LAMBDA(total,item,total-item))", expected: n(7) },
  { name: "reduce tiny input", formula: "REDUCE(0,1E-300,LAMBDA(total,item,total+item))", expected: n(1E-300), tolerance: 1E-313 },
  { name: "scan text", formula: 'SCAN("",Inputs!A1:A2,LAMBDA(total,item,total&item))', cells: { A1: s("a"), A2: s("b") }, expected: [[s("a")],[s("ab")]] },
  { name: "scan scalar", formula: "SCAN(10,3,LAMBDA(total,item,total-item))", expected: [[n(7)]] },
  ...(["1900", "1904"] as const).map(dateSystem => ({ name: `date serial identity ${dateSystem}`, formula: "LET(serial,Inputs!A1,MAP(serial,LAMBDA(item,item)))", cells: { A1: n(60) }, dateSystem, expected: [[n(60)]] })),
];
cases.push(
 {name:"map unequal row counts",formula:"MAP(Inputs!A1:A2,Inputs!B1,LAMBDA(a,b,a+b))",cells:{A1:n(2),A2:n(4),B1:n(3)},expected:[[n(5)],[e("#N/A")]]},
 {name:"map scalar alongside column",formula:"MAP(Inputs!A1:A2,10,LAMBDA(a,b,a+b))",cells:{A1:n(2),A2:n(4)},expected:e("#VALUE!")},
 {name:"map crossing row and column shapes",formula:"MAP(Inputs!A1:A2,Inputs!B1:C1,LAMBDA(a,b,a+b))",cells:{A1:n(2),A2:n(4),B1:n(3),C1:n(6)},expected:[[n(5),e("#N/A")],[e("#N/A"),e("#N/A")]]},
 {name:"let repeated name in same scope",formula:"LET(item,1,item,2,item)",expected:e("#VALUE!")},
 {name:"reduce forwarded omitted seed",formula:"LET(f,LAMBDA(seed,ignored,REDUCE(seed,Inputs!A1:A2,LAMBDA(total,item,total*item))),f(,0))",cells:{A1:n(2),A2:n(4)},expected:n(8)},
 {name:"byrow scalar array callback result",formula:"BYROW(Inputs!A1:A2,LAMBDA(item,MAKEARRAY(1,1,LAMBDA(row,col,1))))",cells:{A1:n(2),A2:n(4)},expected:[[n(1)],[n(1)]]},
);
cases.push(
 {name:"map multiple literal scalars reject",formula:"MAP(1,2,LAMBDA(a,b,a+b))",expected:e("#VALUE!")},
 {name:"map scalar array counterpart pads",formula:"MAP(Inputs!A1:A2,{10},LAMBDA(a,b,a+b))",cells:{A1:n(2),A2:n(4)},expected:[[n(12)],[e("#N/A")]]},
 {name:"map let scalar binding rejects",formula:"LET(seedValue,10,MAP(Inputs!A1:A2,seedValue,LAMBDA(a,b,a+b)))",cells:{A1:n(2),A2:n(4)},expected:e("#VALUE!")},
 {name:"map let reference binding preserves array input",formula:"LET(seedValue,Inputs!B1,MAP(Inputs!A1:A2,seedValue,LAMBDA(a,b,a+b)))",cells:{A1:n(2),A2:n(4),B1:n(3)},expected:[[n(5)],[e("#N/A")]]},
 {name:"let reference retains aggregate coercion",formula:"LET(amount,Inputs!A1,SUM(amount))",cells:{A1:s("7")},expected:n(0)},
);
cases.push(
 {name:"lambda parameter retains reference aggregation",formula:"LET(fn,LAMBDA(x,SUM(x)),fn(Inputs!A1))",cells:{A1:s("7")},expected:n(0)},
 {name:"lambda direct invocation retains reference aggregation",formula:"LAMBDA(x,SUM(x))(Inputs!A1)",cells:{A1:s("7")},expected:n(0)},
 {name:"lambda reference return retains aggregate provenance",formula:"SUM(LAMBDA(x,x)(Inputs!A1))",cells:{A1:s("7")},expected:n(0)},
 {name:"let alias through lambda retains aggregate provenance",formula:"LET(amount,Inputs!A1,fn,LAMBDA(x,x),SUM(fn(amount)))",cells:{A1:s("7")},expected:n(0)},
 {name:"lambda parameter retains MAP reference input",formula:"LET(fn,LAMBDA(x,MAP(Inputs!A1:A2,x,LAMBDA(a,b,a+b))),fn(Inputs!B1))",cells:{A1:n(2),A2:n(4),B1:s("7")},expected:[[n(9)],[e("#N/A")]]},
);
cases.push(
 {name:"let Unicode binding name",formula:"LET(税率,2,税率*3)",expected:n(6)},
 {name:"lambda Unicode parameter",formula:"LAMBDA(数量,数量+1)(Inputs!A1)",cells:{A1:n(2)},expected:n(3)},
 {name:"binding name extends a cell-reference prefix",formula:"LET(A1税,2,A1税+1)",expected:n(3)},
);
