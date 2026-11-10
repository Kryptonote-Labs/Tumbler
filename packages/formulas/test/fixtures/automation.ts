import type { FormulaScalarValue } from "../../src/evaluator.ts";
import { functionError, functionNumber, type FormulaFunctionServices } from "../../src/function-runtime.ts";

const n = (value: number): FormulaScalarValue => ({ type: "number", value });
const s = (value: string): FormulaScalarValue => ({ type: "string", value });
const error = (value: `#${string}` = "#VALUE!"): FormulaScalarValue => ({ type: "error", value });

interface AutomationCase {
  readonly name: string;
  readonly formula: string;
  readonly expected: FormulaScalarValue | readonly (readonly FormulaScalarValue[])[];
  readonly cells?: Record<string, FormulaScalarValue>;
  readonly dateSystem?: "1900" | "1904";
  readonly tolerance?: number;
  readonly requiresService?: boolean;
  readonly oracle?: "excel" | "host" | "nondeterministic";
}

/**
 * Explicit deterministic model for host-profile fixtures; it never loads code.
 * Demo.Scale doubles its sole numeric argument. Registration ID is stable at 42.
 * Configure this profile only for cases with names beginning "host model:".
 */
export const modeledAutomationServices: FormulaFunctionServices = {
  invoke(name, args) {
    const module = args[0];
    const proc = args[1];
    const typed = args[2];
    const matches = module && !("kind" in module) && module.type === "string" && module.value === "Demo"
      && proc && !("kind" in proc)
      && ((proc.type === "string" && proc.value === "Scale") || (proc.type === "number" && proc.value === 1));
    if (name === "REGISTER.ID") {
      if (!matches) return functionError("#N/A");
      return typed === undefined || (!("kind" in typed) && typed.type === "string" && typed.value === "BB")
        ? functionNumber(42) : functionError();
    }
    if (name === "CALL") {
      const byId = module && !("kind" in module) && module.type === "number" && module.value === 42;
      if (!byId && !matches) return functionError("#N/A");
      const value = args[byId ? 1 : 3];
      if (!byId && (!typed || "kind" in typed || typed.type !== "string" || typed.value !== "BB")) return functionError();
      if (args.length !== (byId ? 2 : 4) || !value || "kind" in value || value.type !== "number") return functionError();
      return functionNumber(value.value * 2);
    }
    return undefined;
  },
};

// Original MIT-licensed fixtures. Published Microsoft examples are identified
// by name; all other numbers are independently derived from the fixed rates.
export const cases: readonly AutomationCase[] = [
  { name: "Microsoft: DEM to EUR defaults", formula: 'EUROCONVERT(1.2,"DEM","EUR")', expected: n(0.61) },
  { name: "Microsoft: intermediate euro precision", formula: 'EUROCONVERT(1,"FRF","EUR",TRUE,3)', expected: n(0.152) },
  { name: "Microsoft: intermediate plus final rounding", formula: 'EUROCONVERT(1,"FRF","EUR",FALSE,3)', expected: n(0.15) },
  { name: "Microsoft: triangulation", formula: 'EUROCONVERT(1,"FRF","DEM",TRUE,3)', expected: n(0.29728616), tolerance: 1e-14 },
  { name: "reference invoice", formula: 'EUROCONVERT(Inputs!A1,"DEM","EUR")', cells: { A1: n(1955.83) }, expected: n(1000) },
  { name: "reference currency", formula: 'EUROCONVERT(1,Inputs!A1,"DEM",TRUE)', cells: { A1: s("EUR") }, expected: n(1.95583) },
  { name: "reference numeric text", formula: 'EUROCONVERT(Inputs!A1,"DEM","EUR")', cells: { A1: s("1.2") }, expected: n(0.61) },
  { name: "literal numeric text", formula: 'EUROCONVERT("1.2","DEM","EUR")', expected: n(0.61) },
  { name: "zero", formula: 'EUROCONVERT(0,"EUR","FRF")', expected: n(0) },
  { name: "negative", formula: 'EUROCONVERT(-1.2,"DEM","EUR")', expected: n(-0.61) },
  { name: "blank reference", formula: 'EUROCONVERT(Inputs!A1,"EUR","DEM")', cells: { A1: { type: "blank" } }, expected: n(0) },
  { name: "boolean amount", formula: 'EUROCONVERT(TRUE,"EUR","DEM")', expected: n(1.96) },
  { name: "full precision", formula: 'EUROCONVERT(1,"EUR","DEM",TRUE)', expected: n(1.95583) },
  { name: "nested conversion", formula: 'EUROCONVERT(EUROCONVERT(100,"EUR","DEM",TRUE),"DEM","EUR",TRUE)', expected: n(100), tolerance: 1e-12 },
  { name: "same currency preserves decimals", formula: 'EUROCONVERT(1.234567,"DEM","DEM")', expected: n(1.234567) },
  { name: "half away positive", formula: 'EUROCONVERT(0.5,"EUR","LUF",FALSE)', expected: n(20) },
  { name: "currency integer rounding", formula: 'EUROCONVERT(1,"EUR","ITL")', expected: n(1936) },
  { name: "Slovenian rate", formula: 'EUROCONVERT(1,"EUR","SIT",TRUE)', expected: n(239.64) },
  { name: "literal currency case", formula: 'EUROCONVERT(1,"eur","dem",TRUE)', expected: n(1.95583) },
  { name: "unsupported currency", formula: 'EUROCONVERT(1,"USD","EUR")', expected: error() },
  { name: "currency whitespace", formula: 'EUROCONVERT(1," EUR","DEM")', expected: error() },
  { name: "invalid amount", formula: 'EUROCONVERT("invoice","EUR","DEM")', expected: error() },
  { name: "bad precision", formula: 'EUROCONVERT(1,"FRF","EUR",TRUE,2)', expected: error() },
  { name: "bad flag", formula: 'EUROCONVERT(1,"FRF","EUR","maybe")', expected: error() },
  { name: "input error", formula: 'EUROCONVERT(Inputs!A1,"EUR","DEM")', cells: { A1: error("#DIV/0!") }, expected: error("#DIV/0!") },
  { name: "overflow", formula: 'EUROCONVERT(1e308,"EUR","ITL",TRUE)', expected: error("#NUM!") },
  { name: "huge rounded finite amount", formula: 'EUROCONVERT(1e300,"EUR","DEM")', expected: n(1.95583e300), tolerance: 1e285 },
  { name: "large precision bounded", formula: 'EUROCONVERT(1,"FRF","EUR",TRUE,1e300)', expected: n(1 / 6.55957), tolerance: 1e-16 },
  { name: "tiny rounds to zero", formula: 'EUROCONVERT(1e-300,"EUR","DEM")', expected: n(0) },
  { name: "1904 independent", formula: 'EUROCONVERT(1.2,"DEM","EUR")', dateSystem: "1904", expected: n(0.61) },
  { name: "CALL empty", oracle: "host", formula: 'CALL()', expected: error() },
  { name: "CALL invalid ID", oracle: "host", formula: 'CALL(-1)', expected: error() },
  { name: "CALL missing procedure", oracle: "host", formula: 'CALL("Demo")', expected: error() },
  { name: "REGISTER.ID missing procedure", oracle: "host", formula: 'REGISTER.ID("Demo")', expected: error() },
  { name: "REGISTER.ID error propagation", oracle: "host", formula: 'REGISTER.ID("Demo",Inputs!A1)', cells: { A1: error("#REF!") }, expected: error("#REF!") },
  { name: "REGISTER.ID invalid ordinal", oracle: "host", formula: 'REGISTER.ID("Demo",0,"BB")', expected: error() },
  { name: "host model: registration", requiresService: true, oracle: "host", formula: 'REGISTER.ID("Demo","Scale","BB")', expected: n(42) },
  { name: "host model: existing registration", requiresService: true, oracle: "host", formula: 'REGISTER.ID("Demo","Scale")', expected: n(42) },
  { name: "host model: ordinal registration", requiresService: true, oracle: "host", formula: 'REGISTER.ID("Demo",1,"BB")', expected: n(42) },
  { name: "host model: direct call", requiresService: true, oracle: "host", formula: 'CALL("Demo","Scale","BB",21)', expected: n(42) },
  { name: "host model: registered call", requiresService: true, oracle: "host", formula: 'CALL(42,21)', expected: n(42) },
  { name: "host model: nested registration", requiresService: true, oracle: "host", formula: 'CALL(REGISTER.ID("Demo","Scale","BB"),21)', expected: n(42) },
  { name: "host model: reference argument", requiresService: true, oracle: "host", formula: 'CALL(42,Inputs!A1)', cells: { A1: n(12.5) }, expected: n(25) },
  { name: "host model: unknown resource", requiresService: true, oracle: "host", formula: 'REGISTER.ID("Unknown","Scale","BB")', expected: error("#N/A") },
  { name: "host model: unknown ID", requiresService: true, oracle: "host", formula: 'CALL(43,21)', expected: error("#N/A") },
  { name: "host model: signature mismatch", requiresService: true, oracle: "host", formula: 'REGISTER.ID("Demo","Scale","JJ")', expected: error() },
  { name: "host model: argument type mismatch", requiresService: true, oracle: "host", formula: 'CALL(42,"21")', expected: error() },
  { name: "host model: call overflow", requiresService: true, oracle: "host", formula: 'CALL(42,1e308)', expected: error("#NUM!") },
];
