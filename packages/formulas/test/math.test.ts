import { expect, test } from "bun:test";
import type { FormulaExpression } from "../src/ast.ts";
import type { FormulaScalarValue } from "../src/evaluator.ts";
import { type FunctionContext, type FunctionValue, functionNumber, functionError } from "../src/function-runtime.ts";
import { mathFunctions } from "../src/functions/math.ts";
import { parseFormula } from "../src/parser.ts";
import { cases, type MathCase } from "./fixtures/math.ts";

function context(fixture: Partial<MathCase> = {}, maxArrayCells = 10000, budget = 1000000): FunctionContext {
  const blank: FormulaScalarValue = { type:"blank" };
  const cell = (row:number,column:number): FormulaScalarValue => fixture.cells?.[`${String.fromCharCode(64+column)}${row}`] ?? blank;
  const c: FunctionContext = {
    evaluateAggregate(expression) { return this.evaluate(expression); },
    address:{sheet:"Results",row:1,column:1}, dateSystem:fixture.dateSystem??"1900", maxArrayCells, services:undefined,
    source:{formulaCells:[],cell:()=>undefined,resolveSheet:(_,name)=>name},
    operation:(count=1)=>{budget-=count;if(budget<0)throw new Error("operation budget");},
    random:()=>fixture.random??.25,now:()=>new Date("2026-01-01T00:00:00Z"),cell:()=>undefined,
    unavailable:()=>{throw new Error("unavailable");},
    reference:e=>{if(e.kind!=="reference")return functionError(); const last=e.endReference??e.startReference;return {sheet:e.sheet??"Inputs",firstRow:e.startReference.row,firstColumn:e.startReference.column,height:last.row-e.startReference.row+1,width:last.column-e.startReference.column+1};},
    readReference:r=>({kind:"array",rows:Array.from({length:r.height},(_,i)=>Array.from({length:r.width},(_,j)=>cell(r.firstRow+i,r.firstColumn+j)))}),
    call:(name,values)=>{
      const expressions=values.map((_,i)=>({kind:"number",value:i,lexical:String(i),start:0,end:0}) as FormulaExpression);
      return mathFunctions.get(name)!(expressions,{...c,evaluate:e=>values[(e as {value:number}).value]!});
    },
    withBindings:()=>{throw new Error("unused");},
    evaluate:(e):FunctionValue=>{
      switch(e.kind){
        case "number":case "boolean":case "string":case "error":return {type:e.kind,value:e.value} as FormulaScalarValue;
        case "reference":{const r=c.reference(e);return "height" in r?c.readReference(r):r;}
        case "function":{const fn=mathFunctions.get(e.name);if(!fn)throw new Error(`unknown ${e.name}`);return fn(e.arguments,c);}
        case "unary":{const v=c.evaluate(e.operand);if("kind" in v||v.type!=="number")throw new Error("test unary");return functionNumber(v.value*(e.operator==="-"?-1:1));}
        case "binary":{const a=c.evaluate(e.left),b=c.evaluate(e.right);if("kind" in a||"kind" in b||a.type!=="number"||b.type!=="number")throw new Error("test binary");return functionNumber(e.operator==="/"?a.value/b.value:e.operator==="*"?a.value*b.value:e.operator==="+"?a.value+b.value:e.operator==="-"?a.value-b.value:a.value**b.value);}
        default:throw new Error(`unsupported test expression ${e.kind}`);
      }
    },
  };return c;
}
function assertValue(actual:FunctionValue, expected:MathCase["expected"], tolerance=1e-12){
  if(Array.isArray(expected)){expect("kind" in actual&&actual.kind).toBe("array");if("kind" in actual&&actual.kind==="array"){expect(actual.rows.length).toBe(expected.length);actual.rows.forEach((row,r)=>{expect(row.length).toBe(expected[r]!.length);row.forEach((s,col)=>assertValue(s,expected[r]![col]!,tolerance));});}return;}
  expect("kind" in actual).toBe(false);
  if(!("kind" in actual)&&actual.type==="number"&&expected.type==="number"){expect(Math.abs(actual.value-expected.value)).toBeLessThanOrEqual(tolerance*Math.max(1,Math.abs(expected.value)));}else expect(actual).toEqual(expected);
}
for(const fixture of cases)test(fixture.name,()=>{const c=context(fixture);let result=c.evaluate(parseFormula(fixture.formula).expression); // A single-cell reference is an array in this harness; scalar math lifts it.
  if(!Array.isArray(fixture.expected)&&"kind" in result&&result.kind==="array"&&result.rows.length===1&&result.rows[0]?.length===1)result=result.rows[0][0]!;
  assertValue(result,fixture.expected,fixture.tolerance);
});
test("all 65 names have success and edge fixtures",()=>{expect(mathFunctions.size).toBe(65);for(const name of mathFunctions.keys()){const own=cases.filter(c=>c.formula.startsWith(name+"("));expect(own.some(c=>Array.isArray(c.expected)||c.expected.type!=="error")).toBe(true);expect(own.some(c=>!Array.isArray(c.expected)&&c.expected.type==="error")).toBe(true);}});
test("every function validates arity and propagates input errors",()=>{for(const [name,fn]of mathFunctions){const c=context();if(!["PI","RAND","RANDARRAY"].includes(name))expect(fn([],c)).toEqual(functionError());const errors=Array.from({length:name==="SERIESSUM"?4:["ATAN2","BASE","COMBIN","COMBINA","DECIMAL","MMULT","MROUND","PERCENTOF","POWER","QUOTIENT","RANDBETWEEN","SUMX2MY2","SUMX2PY2","SUMXMY2"].includes(name)?2:1},()=>({kind:"error",value:"#N/A",start:0,end:0}) as FormulaExpression);if(!["PI","RAND"].includes(name))expect(fn(errors,c)).toEqual(functionError("#N/A"));}});
test("array allocation and numerical work obey budgets",()=>{for(const formula of ["SEQUENCE(1000,1000)","MUNIT(1000)","RANDARRAY(1000,1000)"]){const c=context({},100);expect(c.evaluate(parseFormula(formula).expression)).toEqual(functionError("#NUM!"));}expect(()=>context({},10000,10).evaluate(parseFormula("COMBIN(100,50)").expression)).toThrow("operation budget");});
test("scalar array broadcasting",()=>{const c=context();assertValue(c.evaluate(parseFormula("POWER(SEQUENCE(2,2),2)").expression),[[1,4],[9,16]].map(row=>row.map(functionNumber)));});
test("random endpoints use injected RNG",()=>{for(const random of [0,.999999999999]){const c=context({random});const result=c.evaluate(parseFormula("RANDBETWEEN(-2,2)").expression);expect(result).toEqual(functionNumber(random===0?-2:2));}});
test("optional omissions use defaults while blank cells coerce to zero",()=>{
  const c=context();const omitted={kind:"omitted"} as unknown as FunctionValue;
  assertValue(c.call("LOG",[functionNumber(100),omitted]),functionNumber(2));
  assertValue(c.call("SEQUENCE",[functionNumber(2),omitted,omitted,functionNumber(2)]),[[1],[3]].map(row=>row.map(functionNumber)));
  assertValue(c.call("RANDARRAY",[omitted,omitted,omitted,omitted,omitted]),[[functionNumber(.25)]]);
  assertValue(c.call("CEILING.PRECISE",[functionNumber(1.2),omitted]),functionNumber(2));
  assertValue(c.call("CEILING.PRECISE",[functionNumber(1.2),{type:"blank"}]),functionNumber(0));
});
test("determinants recover from intermediate product overflow",()=>{
  const c=context();const rows=[[1e200,0,0],[0,1e200,0],[0,0,1e-200]].map(row=>row.map(functionNumber));
  assertValue(c.call("MDETERM",[{kind:"array",rows}]),functionNumber(1e200));
});
test("unary functions coerce referenced text and booleans",()=>{
  const c=context();
  for(const name of ["ACOS","ASIN","ATAN","COS","SIN","TAN","COSH","SINH","TANH","EVEN","ODD","SIGN","SQRT","FACT","FACTDOUBLE"]){
    const numeric=c.call(name,[functionNumber(1)]);
    assertValue(c.call(name,[{kind:"array",rows:[[{type:"string",value:"1"}]]}]),[[numeric as FormulaScalarValue]]);
    assertValue(c.call(name,[{type:"boolean",value:true}]),numeric as FormulaScalarValue);
  }
});
