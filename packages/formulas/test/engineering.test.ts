import { describe, expect, test } from 'bun:test';
import { engineeringFunctions } from '../src/functions/engineering.ts';
import { parseFormula } from '../src/parser.ts';
import type { FormulaExpression } from '../src/ast.ts';
import type { FormulaScalarValue as Scalar } from '../src/evaluator.ts';
import { functionMatrix, type FunctionContext, type FunctionValue } from '../src/function-runtime.ts';
import { cases, type EngineeringCase } from './fixtures/engineering.ts';

function harness(cells: EngineeringCase['cells'] = {}, options: { maxArrayCells?: number; budget?: number; dateSystem?: '1900'|'1904' } = {}) {
  let operations = 0;
  const blank: Scalar = { type: 'blank' };
  const ctx: FunctionContext = {
    address: { sheet: 'Results', row: 1, column: 1 }, dateSystem: options.dateSystem ?? '1900', maxArrayCells: options.maxArrayCells ?? 100000,
    services: undefined, source: { formulaCells: [], cell: () => undefined, resolveSheet: (_, name) => name },
    evaluate(expr): FunctionValue {
      if (expr.kind === 'number' || expr.kind === 'string' || expr.kind === 'boolean' || expr.kind === 'error') return { type: expr.kind, value: expr.value } as Scalar;
      if (expr.kind === 'unary') { const v = ctx.evaluate(expr.operand); if ('kind' in v || v.type !== 'number') throw Error('harness unary'); return { type:'number',value: expr.operator === '-' ? -v.value : v.value }; }
      if (expr.kind === 'reference') {
        const first = expr.startReference, last = expr.endReference ?? first;
        const rows: Scalar[][] = [];
        for (let r = first.row; r <= last.row; r++) {
          const row: Scalar[] = [];
          for (let c = first.column; c <= last.column; c++) row.push(cells[`${String.fromCharCode(64+c)}${r}`] ?? blank);
          rows.push(row);
        }
        return expr.endReference ? {kind:'array',rows} : rows[0]![0]!;
      }
      if (expr.kind === 'function') {
        const fn = engineeringFunctions.get(expr.name.replace(/^_XLFN\./,'')); if (!fn) throw Error(`Harness unknown ${expr.name}`);
        return fn(expr.arguments, ctx);
      }
      throw Error(`Harness unsupported ${expr.kind}`);
    },
    call(name, values) {
      const expressions = values.map((_, i) => ({ kind:'number',value:i,lexical:String(i),start:0,end:0 }) as FormulaExpression);
      const fn = engineeringFunctions.get(name); if (!fn) throw Error(`Harness unknown ${name}`);
      return fn(expressions, {...ctx,evaluate: e => values[(e as {value:number}).value]!});
    },
    operation(count = 1) { operations += count; if (operations > (options.budget ?? 2000000)) throw Error('budget exceeded'); },
    now: () => new Date('2026-01-01T00:00:00Z'), random: () => 0.5,
    unavailable: () => { throw Error('unavailable'); }, withBindings: () => { throw Error('unused'); },
    reference: () => { throw Error('unused'); }, readReference: () => { throw Error('unused'); }, cell: () => undefined,
  };
  return {ctx,run:(formula:string) => ctx.evaluate(parseFormula(formula.replace(/\b((?:BIN|DEC|HEX|OCT)2(?:BIN|DEC|HEX|OCT))(?=\()/g,'_xlfn.$1')).expression),operations:() => operations};
}
function compare(actual: FunctionValue, expected: EngineeringCase['expected'], tolerance?:number) {
  const wanted = Array.isArray(expected) ? expected : [[expected as Scalar]];
  const got = functionMatrix(actual);
  expect(got.length).toBe(wanted.length);
  for (let r = 0; r < wanted.length; r++) {
    expect(got[r]!.length).toBe(wanted[r]!.length);
    for (let c = 0; c < wanted[r]!.length; c++) {
      const a = got[r]![c]!, b = wanted[r]![c]!;
      expect(a.type).toBe(b.type);
      if (a.type === 'number' && b.type === 'number') expect(Math.abs(a.value-b.value)).toBeLessThanOrEqual(tolerance ?? 2e-13*Math.max(1,Math.abs(b.value)));
      else expect(a).toEqual(b);
    }
  }
}
describe('engineering generated workbook corpus', () => {
 for (const item of cases) test(item.name, () => compare(harness(item.cells,{...(item.dateSystem ? {dateSystem:item.dateSystem}: {})}).run(item.formula),item.expected,item.tolerance));
 test('all 54 functions have real success and error coverage', () => {
  expect(engineeringFunctions.size).toBe(54);
  for (const name of engineeringFunctions.keys()) {
   const own = cases.filter(c => c.formula.includes(`${name}(`));
   expect(own.some(c => !Array.isArray(c.expected) && (c.expected as Scalar).type !== 'error')).toBe(true);
   expect(own.some(c => !Array.isArray(c.expected) && (c.expected as Scalar).type === 'error')).toBe(true);
  }
 });
});
describe('engineering context contract', () => {
 for (const name of engineeringFunctions.keys()) test(`${name} rejects missing/extra arguments and propagates errors`, () => {
  const h = harness();
  compare(h.run(`${name}()`),{type:'error',value:'#VALUE!'});
  const count = ['COMPLEX','CONVERT'].includes(name) ? 3 : ['IMPRODUCT','IMSUM'].includes(name) ? 2 : name.startsWith('BESSEL') || name.startsWith('BIT') || ['IMDIV','IMSUB','IMPOWER'].includes(name) ? 2 : 1;
  compare(h.run(`${name}(${Array.from({length:count},(_,i) => i === 0 ? '#N/A' : '1').join(',')})`),{type:'error',value:'#N/A'});
  if (!['IMSUM','IMPRODUCT'].includes(name)) compare(h.run(`${name}(1,1,1,1)`),{type:'error',value:'#VALUE!'});
 });
 test('bounded output and numeric algorithms', () => {
  compare(harness({A1:{type:'number',value:1},A2:{type:'number',value:2}},{maxArrayCells:1}).run('DEC2BIN(Inputs!A1:A2)'),{type:'error',value:'#NUM!'});
  expect(() => harness({}, {budget:1}).run('BESSELI(20,1)')).toThrow('budget exceeded');
 });
 test('broadcast geometry and error elements', () => {
  compare(harness().ctx.call('BITAND',[{kind:'array',rows:[[{type:'number',value:3},{type:'error',value:'#N/A'}]]},{kind:'array',rows:[[{type:'number',value:1}],[{type:'number',value:2}]]}]),[[{type:'number',value:1},{type:'error',value:'#N/A'}],[{type:'number',value:2},{type:'error',value:'#N/A'}]]);
 });
 test('erfc retains relative tail accuracy', () => {
  const v = harness().run('ERFC(10)'); expect('type' in v && v.type === 'number' && Math.abs(v.value/2.088487583762545e-45-1)<2e-13).toBe(true);
 });
});

test('announced omitted-value convention uses optional defaults', () => {
 const h = harness();
 // This worktree predates FunctionOmitted in the shared contract. The parent
 // supplies that union; this cast only models its already agreed wire shape.
 const omitted = {kind:'omitted'} as unknown as FunctionValue;
 compare(h.ctx.call('COMPLEX',[{type:'number',value:1},{type:'number',value:2},omitted]),{type:'string',value:'1+2i'});
 compare(h.ctx.call('GESTEP',[{type:'number',value:1},omitted]),{type:'number',value:1});
 compare(h.ctx.call('DEC2BIN',[{type:'number',value:3},omitted]),{type:'string',value:'11'});
});

test('Bessel small results have relative accuracy', () => {
 const v = harness().run('BESSELJ(20,200)');
 expect('type' in v && v.type === 'number' && Math.abs(v.value/7.705086185921878e-176-1)<2e-12).toBe(true);
});
