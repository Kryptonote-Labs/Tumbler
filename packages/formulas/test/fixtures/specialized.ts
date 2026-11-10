import type { FormulaScalarValue } from "../../src/evaluator.ts";

interface SpecializedCase {
  name: string;
  formula: string;
  expected: FormulaScalarValue | readonly (readonly FormulaScalarValue[])[];
  cells?: Record<string, FormulaScalarValue>;
  requiresService?: boolean;
  oracle?: "excel" | "host" | "nondeterministic";
}
const n = (value: number): FormulaScalarValue => ({ type: "number", value });
const s = (value: string): FormulaScalarValue => ({ type: "string", value });
const e = (value: `#${string}`): FormulaScalarValue => ({ type: "error", value });

// hosted-* cases require the explicitly documented deterministic service model.
// No producer cache is used to obtain these expected results.
export const cases: readonly SpecializedCase[] = [
  { requiresService: true, oracle: "host", name: "hosted-field-price", formula: 'FIELDVALUE(Inputs!A1,"Price")', cells: { A1: s("Contoso") }, expected: n(125.5) },
  { requiresService: true, oracle: "host", name: "hosted-field-name", formula: 'FIELDVALUE(Inputs!A1,"Name")', cells: { A1: s("Contoso") }, expected: s("Contoso Corporation") },
  { requiresService: true, oracle: "host", name: "hosted-field-reference-name", formula: 'FIELDVALUE(Inputs!A1,Inputs!B1)', cells: { A1: s("Contoso"), B1: s("Price") }, expected: n(125.5) },
  { requiresService: true, oracle: "host", name: "hosted-field-missing", formula: 'FIELDVALUE(Inputs!A1,"Prices")', cells: { A1: s("Contoso") }, expected: e("#FIELD!") },
  { requiresService: true, oracle: "host", name: "hosted-field-nested", formula: 'IFERROR(FIELDVALUE(Inputs!A1,"Prices"),"")', cells: { A1: s("Contoso") }, expected: s("") },
  { requiresService: true, oracle: "host", name: "hosted-field-date-serial", formula: 'FIELDVALUE(Inputs!A1,"Date")', cells: { A1: s("Contoso") }, expected: n(45292) },
  { name: "field-error", formula: 'FIELDVALUE(#N/A,"Price")', expected: e("#N/A") },
  { name: "field-name-error", formula: 'FIELDVALUE(Inputs!A1,#REF!)', cells: { A1: s("Contoso") }, expected: e("#REF!") },
  { name: "field-arity", formula: 'FIELDVALUE("Contoso")', expected: e("#VALUE!") },
  { requiresService: true, oracle: "host", name: "hosted-py-arithmetic", formula: 'PY("1 + 2",0)', expected: n(3) },
  { requiresService: true, oracle: "host", name: "hosted-py-text", formula: `PY("'Hello' + ' ' + 'World'",0)`, expected: s("Hello World") },
  { requiresService: true, oracle: "host", name: "hosted-py-array", formula: 'PY("[[1, 2], [3, 4]]",0)', expected: [[n(1), n(2)], [n(3), n(4)]] },
  { requiresService: true, oracle: "host", name: "hosted-py-reference", formula: 'PY("xl(""Inputs!A1"") * 2",0)', cells: { A1: n(21) }, expected: n(42) },
  { requiresService: true, oracle: "host", name: "hosted-py-exception", formula: 'PY("1 / 0",0)', expected: e("#PYTHON!") },
  { oracle: "host", name: "py-required-mode", formula: 'PY("1 + 2")', expected: e("#VALUE!") },
  { oracle: "host", name: "py-invalid-mode", formula: 'PY("1 + 2",2)', expected: e("#VALUE!") },
  { oracle: "host", name: "py-fractional-mode", formula: 'PY("1 + 2",0.5)', expected: e("#VALUE!") },
  { oracle: "host", name: "py-text-mode", formula: 'PY("1 + 2","0")', expected: e("#VALUE!") },
  { oracle: "host", name: "py-reference-not-static", formula: 'PY(Inputs!A1,0)', cells: { A1: s("1 + 2") }, expected: e("#VALUE!") },
  { oracle: "host", name: "py-reference-mode-not-static", formula: 'PY("1 + 2",Inputs!A1)', cells: { A1: n(0) }, expected: e("#VALUE!") },
];
