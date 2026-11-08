import type { FormulaScalarValue } from "../../src/evaluator.ts";

export interface CompatibilityCase {
  readonly name: string;
  readonly formula: string;
  readonly expected:
    | FormulaScalarValue
    | readonly (readonly FormulaScalarValue[])[];
  readonly cells?: Record<string, FormulaScalarValue>;
  readonly dateSystem?: "1900" | "1904";
  readonly tolerance?: number;
  readonly requiresService?: boolean;
  readonly oracle?: "excel" | "host" | "nondeterministic";
  readonly now?: string;
  readonly random?: number;
  readonly expectedDiagnostics?: readonly string[];
}
// Original test data; distribution expectations independently computed with SciPy 1.18.0.
export const cases: readonly CompatibilityCase[] = [
  {
    name: "betadist-success",
    formula: "BETADIST(0.3,2,5)",
    expected: {
      type: "number",
      value: 0.5798250000000003,
    },
    tolerance: 1e-11,
  },
  {
    name: "betadist-domain",
    formula: "BETADIST(-.1,2,5)",
    expected: {
      type: "error",
      value: "#NUM!",
    },
  },
  {
    name: "betadist-propagation",
    formula: "BETADIST(#REF!,2,5)",
    expected: {
      type: "error",
      value: "#REF!",
    },
  },
  {
    name: "betadist-nested",
    formula: "BETADIST(0.3,2,5)+1",
    expected: {
      type: "number",
      value: 1.5798250000000003,
    },
    tolerance: 1e-11,
  },
  {
    name: "betainv-success",
    formula: "BETAINV(.6,2,5)",
    expected: {
      type: "number",
      value: 0.3094444275453145,
    },
    tolerance: 1e-11,
  },
  {
    name: "betainv-domain",
    formula: "BETAINV(0,2,5)",
    expected: {
      type: "error",
      value: "#NUM!",
    },
  },
  {
    name: "betainv-propagation",
    formula: "BETAINV(#REF!,2,5)",
    expected: {
      type: "error",
      value: "#REF!",
    },
  },
  {
    name: "betainv-nested",
    formula: "BETAINV(.6,2,5)+1",
    expected: {
      type: "number",
      value: 1.3094444275453145,
    },
    tolerance: 1e-11,
  },
  {
    name: "binomdist-success",
    formula: "BINOMDIST(3,10,.2,FALSE)",
    expected: {
      type: "number",
      value: 0.201326592,
    },
    tolerance: 1e-11,
  },
  {
    name: "binomdist-domain",
    formula: "BINOMDIST(11,10,.2,TRUE)",
    expected: {
      type: "error",
      value: "#NUM!",
    },
  },
  {
    name: "binomdist-propagation",
    formula: "BINOMDIST(#REF!,10,.2,FALSE)",
    expected: {
      type: "error",
      value: "#REF!",
    },
  },
  {
    name: "binomdist-nested",
    formula: "BINOMDIST(3,10,.2,FALSE)+1",
    expected: {
      type: "number",
      value: 1.201326592,
    },
    tolerance: 1e-11,
  },
  {
    name: "ceiling-success",
    formula: "CEILING(4.42,.05)",
    expected: {
      type: "number",
      value: 4.45,
    },
    tolerance: 1e-11,
  },
  {
    name: "ceiling-domain",
    formula: "CEILING(2,-1)",
    expected: {
      type: "error",
      value: "#NUM!",
    },
  },
  {
    name: "ceiling-propagation",
    formula: "CEILING(#REF!,.05)",
    expected: {
      type: "error",
      value: "#REF!",
    },
  },
  {
    name: "ceiling-nested",
    formula: "CEILING(4.42,.05)+1",
    expected: {
      type: "number",
      value: 5.45,
    },
    tolerance: 1e-11,
  },
  {
    name: "chidist-success",
    formula: "CHIDIST(8,4)",
    expected: {
      type: "number",
      value: 0.0915781944436709,
    },
    tolerance: 1e-11,
  },
  {
    name: "chidist-domain",
    formula: "CHIDIST(-1,4)",
    expected: {
      type: "error",
      value: "#NUM!",
    },
  },
  {
    name: "chidist-propagation",
    formula: "CHIDIST(#REF!,4)",
    expected: {
      type: "error",
      value: "#REF!",
    },
  },
  {
    name: "chidist-nested",
    formula: "CHIDIST(8,4)+1",
    expected: {
      type: "number",
      value: 1.0915781944436709,
    },
    tolerance: 1e-11,
  },
  {
    name: "chiinv-success",
    formula: "CHIINV(.05,4)",
    expected: {
      type: "number",
      value: 9.487729036781158,
    },
    tolerance: 1e-11,
  },
  {
    name: "chiinv-domain",
    formula: "CHIINV(.5,0)",
    expected: {
      type: "error",
      value: "#NUM!",
    },
  },
  {
    name: "chiinv-propagation",
    formula: "CHIINV(#REF!,4)",
    expected: {
      type: "error",
      value: "#REF!",
    },
  },
  {
    name: "chiinv-nested",
    formula: "CHIINV(.05,4)+1",
    expected: {
      type: "number",
      value: 10.487729036781158,
    },
    tolerance: 1e-11,
  },
  {
    name: "chitest-success",
    formula: "CHITEST(Inputs!A1:A3,Inputs!B1:B3)",
    expected: {
      type: "number",
      value: 0.7400702972514047,
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
      A2: {
        type: "number",
        value: 12,
      },
      A3: {
        type: "number",
        value: 10,
      },
      B1: {
        type: "number",
        value: 9,
      },
      B2: {
        type: "number",
        value: 10,
      },
      B3: {
        type: "number",
        value: 11,
      },
      C1: {
        type: "number",
        value: 1,
      },
      C2: {
        type: "number",
        value: 1,
      },
      C3: {
        type: "number",
        value: 1,
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "chitest-domain",
    formula: "CHITEST(Inputs!A1:A3,Inputs!B1:B2)",
    expected: {
      type: "error",
      value: "#N/A",
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
      A2: {
        type: "number",
        value: 12,
      },
      A3: {
        type: "number",
        value: 10,
      },
      B1: {
        type: "number",
        value: 9,
      },
      B2: {
        type: "number",
        value: 10,
      },
      B3: {
        type: "number",
        value: 11,
      },
      C1: {
        type: "number",
        value: 1,
      },
      C2: {
        type: "number",
        value: 1,
      },
      C3: {
        type: "number",
        value: 1,
      },
    },
  },
  {
    name: "chitest-propagation",
    formula: "CHITEST(#REF!,Inputs!B1:B3)",
    expected: {
      type: "error",
      value: "#REF!",
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
      A2: {
        type: "number",
        value: 12,
      },
      A3: {
        type: "number",
        value: 10,
      },
      B1: {
        type: "number",
        value: 9,
      },
      B2: {
        type: "number",
        value: 10,
      },
      B3: {
        type: "number",
        value: 11,
      },
      C1: {
        type: "number",
        value: 1,
      },
      C2: {
        type: "number",
        value: 1,
      },
      C3: {
        type: "number",
        value: 1,
      },
    },
  },
  {
    name: "chitest-nested",
    formula: "CHITEST(Inputs!A1:A3,Inputs!B1:B3)+1",
    expected: {
      type: "number",
      value: 1.7400702972514046,
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
      A2: {
        type: "number",
        value: 12,
      },
      A3: {
        type: "number",
        value: 10,
      },
      B1: {
        type: "number",
        value: 9,
      },
      B2: {
        type: "number",
        value: 10,
      },
      B3: {
        type: "number",
        value: 11,
      },
      C1: {
        type: "number",
        value: 1,
      },
      C2: {
        type: "number",
        value: 1,
      },
      C3: {
        type: "number",
        value: 1,
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "confidence-success",
    formula: "CONFIDENCE(.05,2,100)",
    expected: {
      type: "number",
      value: 0.3919927969080109,
    },
    tolerance: 1e-11,
  },
  {
    name: "confidence-domain",
    formula: "CONFIDENCE(1,2,100)",
    expected: {
      type: "error",
      value: "#NUM!",
    },
  },
  {
    name: "confidence-propagation",
    formula: "CONFIDENCE(#REF!,2,100)",
    expected: {
      type: "error",
      value: "#REF!",
    },
  },
  {
    name: "confidence-nested",
    formula: "CONFIDENCE(.05,2,100)+1",
    expected: {
      type: "number",
      value: 1.3919927969080108,
    },
    tolerance: 1e-11,
  },
  {
    name: "covar-success",
    formula: "COVAR(Inputs!A1:A3,Inputs!B1:B3)",
    expected: {
      type: "number",
      value: 0.6666666666666666,
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
      A2: {
        type: "number",
        value: 12,
      },
      A3: {
        type: "number",
        value: 10,
      },
      B1: {
        type: "number",
        value: 9,
      },
      B2: {
        type: "number",
        value: 10,
      },
      B3: {
        type: "number",
        value: 11,
      },
      C1: {
        type: "number",
        value: 1,
      },
      C2: {
        type: "number",
        value: 1,
      },
      C3: {
        type: "number",
        value: 1,
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "covar-domain",
    formula: "COVAR(Inputs!A1:A3,Inputs!B1:B2)",
    expected: {
      type: "error",
      value: "#N/A",
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
      A2: {
        type: "number",
        value: 12,
      },
      A3: {
        type: "number",
        value: 10,
      },
      B1: {
        type: "number",
        value: 9,
      },
      B2: {
        type: "number",
        value: 10,
      },
      B3: {
        type: "number",
        value: 11,
      },
      C1: {
        type: "number",
        value: 1,
      },
      C2: {
        type: "number",
        value: 1,
      },
      C3: {
        type: "number",
        value: 1,
      },
    },
  },
  {
    name: "covar-propagation",
    formula: "COVAR(#REF!,Inputs!B1:B3)",
    expected: {
      type: "error",
      value: "#REF!",
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
      A2: {
        type: "number",
        value: 12,
      },
      A3: {
        type: "number",
        value: 10,
      },
      B1: {
        type: "number",
        value: 9,
      },
      B2: {
        type: "number",
        value: 10,
      },
      B3: {
        type: "number",
        value: 11,
      },
      C1: {
        type: "number",
        value: 1,
      },
      C2: {
        type: "number",
        value: 1,
      },
      C3: {
        type: "number",
        value: 1,
      },
    },
  },
  {
    name: "covar-nested",
    formula: "COVAR(Inputs!A1:A3,Inputs!B1:B3)+1",
    expected: {
      type: "number",
      value: 1.6666666666666665,
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
      A2: {
        type: "number",
        value: 12,
      },
      A3: {
        type: "number",
        value: 10,
      },
      B1: {
        type: "number",
        value: 9,
      },
      B2: {
        type: "number",
        value: 10,
      },
      B3: {
        type: "number",
        value: 11,
      },
      C1: {
        type: "number",
        value: 1,
      },
      C2: {
        type: "number",
        value: 1,
      },
      C3: {
        type: "number",
        value: 1,
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "critbinom-success",
    formula: "CRITBINOM(6,.5,.75)",
    expected: {
      type: "number",
      value: 4,
    },
    tolerance: 1e-11,
  },
  {
    name: "critbinom-domain",
    formula: "CRITBINOM(-1,.5,.75)",
    expected: {
      type: "error",
      value: "#NUM!",
    },
  },
  {
    name: "critbinom-propagation",
    formula: "CRITBINOM(#REF!,.5,.75)",
    expected: {
      type: "error",
      value: "#REF!",
    },
  },
  {
    name: "critbinom-nested",
    formula: "CRITBINOM(6,.5,.75)+1",
    expected: {
      type: "number",
      value: 5,
    },
    tolerance: 1e-11,
  },
  {
    name: "expondist-success",
    formula: "EXPONDIST(2,3,TRUE)",
    expected: {
      type: "number",
      value: 0.9975212478233336,
    },
    tolerance: 1e-11,
  },
  {
    name: "expondist-domain",
    formula: "EXPONDIST(2,0,TRUE)",
    expected: {
      type: "error",
      value: "#NUM!",
    },
  },
  {
    name: "expondist-propagation",
    formula: "EXPONDIST(#REF!,3,TRUE)",
    expected: {
      type: "error",
      value: "#REF!",
    },
  },
  {
    name: "expondist-nested",
    formula: "EXPONDIST(2,3,TRUE)+1",
    expected: {
      type: "number",
      value: 1.9975212478233337,
    },
    tolerance: 1e-11,
  },
  {
    name: "fdist-success",
    formula: "FDIST(3,5,7)",
    expected: {
      type: "number",
      value: 0.0922465610205496,
    },
    tolerance: 1e-11,
  },
  {
    name: "fdist-domain",
    formula: "FDIST(3,0,7)",
    expected: {
      type: "error",
      value: "#NUM!",
    },
  },
  {
    name: "fdist-propagation",
    formula: "FDIST(#REF!,5,7)",
    expected: {
      type: "error",
      value: "#REF!",
    },
  },
  {
    name: "fdist-nested",
    formula: "FDIST(3,5,7)+1",
    expected: {
      type: "number",
      value: 1.0922465610205496,
    },
    tolerance: 1e-11,
  },
  {
    name: "finv-success",
    formula: "FINV(.05,5,7)",
    expected: {
      type: "number",
      value: 3.9715231506113415,
    },
    tolerance: 1e-11,
  },
  {
    name: "finv-domain",
    formula: "FINV(1.1,5,7)",
    expected: {
      type: "error",
      value: "#NUM!",
    },
  },
  {
    name: "finv-propagation",
    formula: "FINV(#REF!,5,7)",
    expected: {
      type: "error",
      value: "#REF!",
    },
  },
  {
    name: "finv-nested",
    formula: "FINV(.05,5,7)+1",
    expected: {
      type: "number",
      value: 4.9715231506113415,
    },
    tolerance: 1e-11,
  },
  {
    name: "floor-success",
    formula: "FLOOR(-2.5,-2)",
    expected: {
      type: "number",
      value: -2,
    },
    tolerance: 1e-11,
  },
  {
    name: "floor-domain",
    formula: "FLOOR(2,-2)",
    expected: {
      type: "error",
      value: "#NUM!",
    },
  },
  {
    name: "floor-propagation",
    formula: "FLOOR(#REF!,-2)",
    expected: {
      type: "error",
      value: "#REF!",
    },
  },
  {
    name: "floor-nested",
    formula: "FLOOR(-2.5,-2)+1",
    expected: {
      type: "number",
      value: -1,
    },
    tolerance: 1e-11,
  },
  {
    name: "ftest-success",
    formula: "FTEST(Inputs!A1:A3,Inputs!B1:B3)",
    expected: {
      type: "number",
      value: 0.4,
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
      A2: {
        type: "number",
        value: 12,
      },
      A3: {
        type: "number",
        value: 10,
      },
      B1: {
        type: "number",
        value: 9,
      },
      B2: {
        type: "number",
        value: 10,
      },
      B3: {
        type: "number",
        value: 11,
      },
      C1: {
        type: "number",
        value: 1,
      },
      C2: {
        type: "number",
        value: 1,
      },
      C3: {
        type: "number",
        value: 1,
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "ftest-domain",
    formula: "FTEST(Inputs!C1:C3,Inputs!B1:B3)",
    expected: {
      type: "error",
      value: "#DIV/0!",
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
      A2: {
        type: "number",
        value: 12,
      },
      A3: {
        type: "number",
        value: 10,
      },
      B1: {
        type: "number",
        value: 9,
      },
      B2: {
        type: "number",
        value: 10,
      },
      B3: {
        type: "number",
        value: 11,
      },
      C1: {
        type: "number",
        value: 1,
      },
      C2: {
        type: "number",
        value: 1,
      },
      C3: {
        type: "number",
        value: 1,
      },
    },
  },
  {
    name: "ftest-propagation",
    formula: "FTEST(#REF!,Inputs!B1:B3)",
    expected: {
      type: "error",
      value: "#REF!",
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
      A2: {
        type: "number",
        value: 12,
      },
      A3: {
        type: "number",
        value: 10,
      },
      B1: {
        type: "number",
        value: 9,
      },
      B2: {
        type: "number",
        value: 10,
      },
      B3: {
        type: "number",
        value: 11,
      },
      C1: {
        type: "number",
        value: 1,
      },
      C2: {
        type: "number",
        value: 1,
      },
      C3: {
        type: "number",
        value: 1,
      },
    },
  },
  {
    name: "ftest-nested",
    formula: "FTEST(Inputs!A1:A3,Inputs!B1:B3)+1",
    expected: {
      type: "number",
      value: 1.4,
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
      A2: {
        type: "number",
        value: 12,
      },
      A3: {
        type: "number",
        value: 10,
      },
      B1: {
        type: "number",
        value: 9,
      },
      B2: {
        type: "number",
        value: 10,
      },
      B3: {
        type: "number",
        value: 11,
      },
      C1: {
        type: "number",
        value: 1,
      },
      C2: {
        type: "number",
        value: 1,
      },
      C3: {
        type: "number",
        value: 1,
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "gammadist-success",
    formula: "GAMMADIST(3,2,4,TRUE)",
    expected: {
      type: "number",
      value: 0.17335853270322427,
    },
    tolerance: 1e-11,
  },
  {
    name: "gammadist-domain",
    formula: "GAMMADIST(3,0,4,TRUE)",
    expected: {
      type: "error",
      value: "#NUM!",
    },
  },
  {
    name: "gammadist-propagation",
    formula: "GAMMADIST(#REF!,2,4,TRUE)",
    expected: {
      type: "error",
      value: "#REF!",
    },
  },
  {
    name: "gammadist-nested",
    formula: "GAMMADIST(3,2,4,TRUE)+1",
    expected: {
      type: "number",
      value: 1.1733585327032243,
    },
    tolerance: 1e-11,
  },
  {
    name: "gammainv-success",
    formula: "GAMMAINV(.7,2,4)",
    expected: {
      type: "number",
      value: 9.756865933120816,
    },
    tolerance: 1e-11,
  },
  {
    name: "gammainv-domain",
    formula: "GAMMAINV(.5,2,0)",
    expected: {
      type: "error",
      value: "#NUM!",
    },
  },
  {
    name: "gammainv-propagation",
    formula: "GAMMAINV(#REF!,2,4)",
    expected: {
      type: "error",
      value: "#REF!",
    },
  },
  {
    name: "gammainv-nested",
    formula: "GAMMAINV(.7,2,4)+1",
    expected: {
      type: "number",
      value: 10.756865933120816,
    },
    tolerance: 1e-11,
  },
  {
    name: "hypgeomdist-success",
    formula: "HYPGEOMDIST(2,5,8,20)",
    expected: {
      type: "number",
      value: 0.39731682146542835,
    },
    tolerance: 1e-11,
  },
  {
    name: "hypgeomdist-domain",
    formula: "HYPGEOMDIST(6,5,8,20)",
    expected: {
      type: "error",
      value: "#NUM!",
    },
  },
  {
    name: "hypgeomdist-propagation",
    formula: "HYPGEOMDIST(#REF!,5,8,20)",
    expected: {
      type: "error",
      value: "#REF!",
    },
  },
  {
    name: "hypgeomdist-nested",
    formula: "HYPGEOMDIST(2,5,8,20)+1",
    expected: {
      type: "number",
      value: 1.3973168214654283,
    },
    tolerance: 1e-11,
  },
  {
    name: "loginv-success",
    formula: "LOGINV(.7,1,2)",
    expected: {
      type: "number",
      value: 7.758593171413643,
    },
    tolerance: 1e-11,
  },
  {
    name: "loginv-domain",
    formula: "LOGINV(0,1,2)",
    expected: {
      type: "error",
      value: "#NUM!",
    },
  },
  {
    name: "loginv-propagation",
    formula: "LOGINV(#REF!,1,2)",
    expected: {
      type: "error",
      value: "#REF!",
    },
  },
  {
    name: "loginv-nested",
    formula: "LOGINV(.7,1,2)+1",
    expected: {
      type: "number",
      value: 8.758593171413644,
    },
    tolerance: 1e-11,
  },
  {
    name: "lognormdist-success",
    formula: "LOGNORMDIST(3,1,2)",
    expected: {
      type: "number",
      value: 0.5196623384975168,
    },
    tolerance: 1e-11,
  },
  {
    name: "lognormdist-domain",
    formula: "LOGNORMDIST(0,1,2)",
    expected: {
      type: "error",
      value: "#NUM!",
    },
  },
  {
    name: "lognormdist-propagation",
    formula: "LOGNORMDIST(#REF!,1,2)",
    expected: {
      type: "error",
      value: "#REF!",
    },
  },
  {
    name: "lognormdist-nested",
    formula: "LOGNORMDIST(3,1,2)+1",
    expected: {
      type: "number",
      value: 1.5196623384975168,
    },
    tolerance: 1e-11,
  },
  {
    name: "mode-success",
    formula: "MODE(8,2,8,2,5)",
    expected: {
      type: "number",
      value: 2,
    },
    tolerance: 1e-11,
  },
  {
    name: "mode-domain",
    formula: "MODE(1,2,3)",
    expected: {
      type: "error",
      value: "#N/A",
    },
  },
  {
    name: "mode-propagation",
    formula: "MODE(#REF!,2,8,2,5)",
    expected: {
      type: "error",
      value: "#REF!",
    },
  },
  {
    name: "mode-nested",
    formula: "MODE(8,2,8,2,5)+1",
    expected: {
      type: "number",
      value: 3,
    },
    tolerance: 1e-11,
  },
  {
    name: "negbinomdist-success",
    formula: "NEGBINOMDIST(4,3,.2)",
    expected: {
      type: "number",
      value: 0.049152000000000064,
    },
    tolerance: 1e-11,
  },
  {
    name: "negbinomdist-domain",
    formula: "NEGBINOMDIST(4,0,.2)",
    expected: {
      type: "error",
      value: "#NUM!",
    },
  },
  {
    name: "negbinomdist-propagation",
    formula: "NEGBINOMDIST(#REF!,3,.2)",
    expected: {
      type: "error",
      value: "#REF!",
    },
  },
  {
    name: "negbinomdist-nested",
    formula: "NEGBINOMDIST(4,3,.2)+1",
    expected: {
      type: "number",
      value: 1.049152,
    },
    tolerance: 1e-11,
  },
  {
    name: "normdist-success",
    formula: "NORMDIST(3,1,2,TRUE)",
    expected: {
      type: "number",
      value: 0.8413447460685429,
    },
    tolerance: 1e-11,
  },
  {
    name: "normdist-domain",
    formula: "NORMDIST(3,1,0,TRUE)",
    expected: {
      type: "error",
      value: "#NUM!",
    },
  },
  {
    name: "normdist-propagation",
    formula: "NORMDIST(#REF!,1,2,TRUE)",
    expected: {
      type: "error",
      value: "#REF!",
    },
  },
  {
    name: "normdist-nested",
    formula: "NORMDIST(3,1,2,TRUE)+1",
    expected: {
      type: "number",
      value: 1.8413447460685428,
    },
    tolerance: 1e-11,
  },
  {
    name: "norminv-success",
    formula: "NORMINV(.7,1,2)",
    expected: {
      type: "number",
      value: 2.0488010254160813,
    },
    tolerance: 1e-11,
  },
  {
    name: "norminv-domain",
    formula: "NORMINV(1,1,2)",
    expected: {
      type: "error",
      value: "#NUM!",
    },
  },
  {
    name: "norminv-propagation",
    formula: "NORMINV(#REF!,1,2)",
    expected: {
      type: "error",
      value: "#REF!",
    },
  },
  {
    name: "norminv-nested",
    formula: "NORMINV(.7,1,2)+1",
    expected: {
      type: "number",
      value: 3.0488010254160813,
    },
    tolerance: 1e-11,
  },
  {
    name: "normsdist-success",
    formula: "NORMSDIST(-2)",
    expected: {
      type: "number",
      value: 0.022750131948179198,
    },
    tolerance: 1e-11,
  },
  {
    name: "normsdist-domain",
    formula: 'NORMSDIST("bad")',
    expected: {
      type: "error",
      value: "#VALUE!",
    },
  },
  {
    name: "normsdist-propagation",
    formula: "NORMSDIST(#REF!)",
    expected: {
      type: "error",
      value: "#REF!",
    },
  },
  {
    name: "normsdist-nested",
    formula: "NORMSDIST(-2)+1",
    expected: {
      type: "number",
      value: 1.022750131948179,
    },
    tolerance: 1e-11,
  },
  {
    name: "normsinv-success",
    formula: "NORMSINV(.025)",
    expected: {
      type: "number",
      value: -1.9599639845400545,
    },
    tolerance: 1e-11,
  },
  {
    name: "normsinv-domain",
    formula: "NORMSINV(0)",
    expected: {
      type: "error",
      value: "#NUM!",
    },
  },
  {
    name: "normsinv-propagation",
    formula: "NORMSINV(#REF!)",
    expected: {
      type: "error",
      value: "#REF!",
    },
  },
  {
    name: "normsinv-nested",
    formula: "NORMSINV(.025)+1",
    expected: {
      type: "number",
      value: -0.9599639845400545,
    },
    tolerance: 1e-11,
  },
  {
    name: "percentile-success",
    formula: "PERCENTILE(Inputs!A1:A3,.25)",
    expected: {
      type: "number",
      value: 9,
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
      A2: {
        type: "number",
        value: 12,
      },
      A3: {
        type: "number",
        value: 10,
      },
      B1: {
        type: "number",
        value: 9,
      },
      B2: {
        type: "number",
        value: 10,
      },
      B3: {
        type: "number",
        value: 11,
      },
      C1: {
        type: "number",
        value: 1,
      },
      C2: {
        type: "number",
        value: 1,
      },
      C3: {
        type: "number",
        value: 1,
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "percentile-domain",
    formula: "PERCENTILE(Inputs!A1:A3,2)",
    expected: {
      type: "error",
      value: "#NUM!",
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
      A2: {
        type: "number",
        value: 12,
      },
      A3: {
        type: "number",
        value: 10,
      },
      B1: {
        type: "number",
        value: 9,
      },
      B2: {
        type: "number",
        value: 10,
      },
      B3: {
        type: "number",
        value: 11,
      },
      C1: {
        type: "number",
        value: 1,
      },
      C2: {
        type: "number",
        value: 1,
      },
      C3: {
        type: "number",
        value: 1,
      },
    },
  },
  {
    name: "percentile-propagation",
    formula: "PERCENTILE(#REF!,.25)",
    expected: {
      type: "error",
      value: "#REF!",
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
      A2: {
        type: "number",
        value: 12,
      },
      A3: {
        type: "number",
        value: 10,
      },
      B1: {
        type: "number",
        value: 9,
      },
      B2: {
        type: "number",
        value: 10,
      },
      B3: {
        type: "number",
        value: 11,
      },
      C1: {
        type: "number",
        value: 1,
      },
      C2: {
        type: "number",
        value: 1,
      },
      C3: {
        type: "number",
        value: 1,
      },
    },
  },
  {
    name: "percentile-nested",
    formula: "PERCENTILE(Inputs!A1:A3,.25)+1",
    expected: {
      type: "number",
      value: 10,
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
      A2: {
        type: "number",
        value: 12,
      },
      A3: {
        type: "number",
        value: 10,
      },
      B1: {
        type: "number",
        value: 9,
      },
      B2: {
        type: "number",
        value: 10,
      },
      B3: {
        type: "number",
        value: 11,
      },
      C1: {
        type: "number",
        value: 1,
      },
      C2: {
        type: "number",
        value: 1,
      },
      C3: {
        type: "number",
        value: 1,
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "percentrank-success",
    formula: "PERCENTRANK(Inputs!A1:A3,9)",
    expected: {
      type: "number",
      value: 0.25,
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
      A2: {
        type: "number",
        value: 12,
      },
      A3: {
        type: "number",
        value: 10,
      },
      B1: {
        type: "number",
        value: 9,
      },
      B2: {
        type: "number",
        value: 10,
      },
      B3: {
        type: "number",
        value: 11,
      },
      C1: {
        type: "number",
        value: 1,
      },
      C2: {
        type: "number",
        value: 1,
      },
      C3: {
        type: "number",
        value: 1,
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "percentrank-domain",
    formula: "PERCENTRANK(Inputs!A1:A3,20)",
    expected: {
      type: "error",
      value: "#N/A",
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
      A2: {
        type: "number",
        value: 12,
      },
      A3: {
        type: "number",
        value: 10,
      },
      B1: {
        type: "number",
        value: 9,
      },
      B2: {
        type: "number",
        value: 10,
      },
      B3: {
        type: "number",
        value: 11,
      },
      C1: {
        type: "number",
        value: 1,
      },
      C2: {
        type: "number",
        value: 1,
      },
      C3: {
        type: "number",
        value: 1,
      },
    },
  },
  {
    name: "percentrank-propagation",
    formula: "PERCENTRANK(#REF!,9)",
    expected: {
      type: "error",
      value: "#REF!",
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
      A2: {
        type: "number",
        value: 12,
      },
      A3: {
        type: "number",
        value: 10,
      },
      B1: {
        type: "number",
        value: 9,
      },
      B2: {
        type: "number",
        value: 10,
      },
      B3: {
        type: "number",
        value: 11,
      },
      C1: {
        type: "number",
        value: 1,
      },
      C2: {
        type: "number",
        value: 1,
      },
      C3: {
        type: "number",
        value: 1,
      },
    },
  },
  {
    name: "percentrank-nested",
    formula: "PERCENTRANK(Inputs!A1:A3,9)+1",
    expected: {
      type: "number",
      value: 1.25,
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
      A2: {
        type: "number",
        value: 12,
      },
      A3: {
        type: "number",
        value: 10,
      },
      B1: {
        type: "number",
        value: 9,
      },
      B2: {
        type: "number",
        value: 10,
      },
      B3: {
        type: "number",
        value: 11,
      },
      C1: {
        type: "number",
        value: 1,
      },
      C2: {
        type: "number",
        value: 1,
      },
      C3: {
        type: "number",
        value: 1,
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "poisson-success",
    formula: "POISSON(2,5,TRUE)",
    expected: {
      type: "number",
      value: 0.12465201948308109,
    },
    tolerance: 1e-11,
  },
  {
    name: "poisson-domain",
    formula: "POISSON(2,-5,TRUE)",
    expected: {
      type: "error",
      value: "#NUM!",
    },
  },
  {
    name: "poisson-propagation",
    formula: "POISSON(#REF!,5,TRUE)",
    expected: {
      type: "error",
      value: "#REF!",
    },
  },
  {
    name: "poisson-nested",
    formula: "POISSON(2,5,TRUE)+1",
    expected: {
      type: "number",
      value: 1.1246520194830811,
    },
    tolerance: 1e-11,
  },
  {
    name: "quartile-success",
    formula: "QUARTILE(Inputs!A1:A3,3)",
    expected: {
      type: "number",
      value: 11,
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
      A2: {
        type: "number",
        value: 12,
      },
      A3: {
        type: "number",
        value: 10,
      },
      B1: {
        type: "number",
        value: 9,
      },
      B2: {
        type: "number",
        value: 10,
      },
      B3: {
        type: "number",
        value: 11,
      },
      C1: {
        type: "number",
        value: 1,
      },
      C2: {
        type: "number",
        value: 1,
      },
      C3: {
        type: "number",
        value: 1,
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "quartile-domain",
    formula: "QUARTILE(Inputs!A1:A3,5)",
    expected: {
      type: "error",
      value: "#NUM!",
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
      A2: {
        type: "number",
        value: 12,
      },
      A3: {
        type: "number",
        value: 10,
      },
      B1: {
        type: "number",
        value: 9,
      },
      B2: {
        type: "number",
        value: 10,
      },
      B3: {
        type: "number",
        value: 11,
      },
      C1: {
        type: "number",
        value: 1,
      },
      C2: {
        type: "number",
        value: 1,
      },
      C3: {
        type: "number",
        value: 1,
      },
    },
  },
  {
    name: "quartile-propagation",
    formula: "QUARTILE(#REF!,3)",
    expected: {
      type: "error",
      value: "#REF!",
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
      A2: {
        type: "number",
        value: 12,
      },
      A3: {
        type: "number",
        value: 10,
      },
      B1: {
        type: "number",
        value: 9,
      },
      B2: {
        type: "number",
        value: 10,
      },
      B3: {
        type: "number",
        value: 11,
      },
      C1: {
        type: "number",
        value: 1,
      },
      C2: {
        type: "number",
        value: 1,
      },
      C3: {
        type: "number",
        value: 1,
      },
    },
  },
  {
    name: "quartile-nested",
    formula: "QUARTILE(Inputs!A1:A3,3)+1",
    expected: {
      type: "number",
      value: 12,
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
      A2: {
        type: "number",
        value: 12,
      },
      A3: {
        type: "number",
        value: 10,
      },
      B1: {
        type: "number",
        value: 9,
      },
      B2: {
        type: "number",
        value: 10,
      },
      B3: {
        type: "number",
        value: 11,
      },
      C1: {
        type: "number",
        value: 1,
      },
      C2: {
        type: "number",
        value: 1,
      },
      C3: {
        type: "number",
        value: 1,
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "rank-success",
    formula: "RANK(10,Inputs!A1:A3)",
    expected: {
      type: "number",
      value: 2,
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
      A2: {
        type: "number",
        value: 12,
      },
      A3: {
        type: "number",
        value: 10,
      },
      B1: {
        type: "number",
        value: 9,
      },
      B2: {
        type: "number",
        value: 10,
      },
      B3: {
        type: "number",
        value: 11,
      },
      C1: {
        type: "number",
        value: 1,
      },
      C2: {
        type: "number",
        value: 1,
      },
      C3: {
        type: "number",
        value: 1,
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "rank-domain",
    formula: "RANK(11,Inputs!A1:A3)",
    expected: {
      type: "error",
      value: "#N/A",
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
      A2: {
        type: "number",
        value: 12,
      },
      A3: {
        type: "number",
        value: 10,
      },
      B1: {
        type: "number",
        value: 9,
      },
      B2: {
        type: "number",
        value: 10,
      },
      B3: {
        type: "number",
        value: 11,
      },
      C1: {
        type: "number",
        value: 1,
      },
      C2: {
        type: "number",
        value: 1,
      },
      C3: {
        type: "number",
        value: 1,
      },
    },
  },
  {
    name: "rank-propagation",
    formula: "RANK(#REF!,Inputs!A1:A3)",
    expected: {
      type: "error",
      value: "#REF!",
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
      A2: {
        type: "number",
        value: 12,
      },
      A3: {
        type: "number",
        value: 10,
      },
      B1: {
        type: "number",
        value: 9,
      },
      B2: {
        type: "number",
        value: 10,
      },
      B3: {
        type: "number",
        value: 11,
      },
      C1: {
        type: "number",
        value: 1,
      },
      C2: {
        type: "number",
        value: 1,
      },
      C3: {
        type: "number",
        value: 1,
      },
    },
  },
  {
    name: "rank-nested",
    formula: "RANK(10,Inputs!A1:A3)+1",
    expected: {
      type: "number",
      value: 3,
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
      A2: {
        type: "number",
        value: 12,
      },
      A3: {
        type: "number",
        value: 10,
      },
      B1: {
        type: "number",
        value: 9,
      },
      B2: {
        type: "number",
        value: 10,
      },
      B3: {
        type: "number",
        value: 11,
      },
      C1: {
        type: "number",
        value: 1,
      },
      C2: {
        type: "number",
        value: 1,
      },
      C3: {
        type: "number",
        value: 1,
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "stdev-success",
    formula: "STDEV(Inputs!A1:A3)",
    expected: {
      type: "number",
      value: 2,
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
      A2: {
        type: "number",
        value: 12,
      },
      A3: {
        type: "number",
        value: 10,
      },
      B1: {
        type: "number",
        value: 9,
      },
      B2: {
        type: "number",
        value: 10,
      },
      B3: {
        type: "number",
        value: 11,
      },
      C1: {
        type: "number",
        value: 1,
      },
      C2: {
        type: "number",
        value: 1,
      },
      C3: {
        type: "number",
        value: 1,
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "stdev-domain",
    formula: "STDEV(Inputs!C1)",
    expected: {
      type: "error",
      value: "#DIV/0!",
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
      A2: {
        type: "number",
        value: 12,
      },
      A3: {
        type: "number",
        value: 10,
      },
      B1: {
        type: "number",
        value: 9,
      },
      B2: {
        type: "number",
        value: 10,
      },
      B3: {
        type: "number",
        value: 11,
      },
      C1: {
        type: "number",
        value: 1,
      },
      C2: {
        type: "number",
        value: 1,
      },
      C3: {
        type: "number",
        value: 1,
      },
    },
  },
  {
    name: "stdev-propagation",
    formula: "STDEV(#REF!)",
    expected: {
      type: "error",
      value: "#REF!",
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
      A2: {
        type: "number",
        value: 12,
      },
      A3: {
        type: "number",
        value: 10,
      },
      B1: {
        type: "number",
        value: 9,
      },
      B2: {
        type: "number",
        value: 10,
      },
      B3: {
        type: "number",
        value: 11,
      },
      C1: {
        type: "number",
        value: 1,
      },
      C2: {
        type: "number",
        value: 1,
      },
      C3: {
        type: "number",
        value: 1,
      },
    },
  },
  {
    name: "stdev-nested",
    formula: "STDEV(Inputs!A1:A3)+1",
    expected: {
      type: "number",
      value: 3,
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
      A2: {
        type: "number",
        value: 12,
      },
      A3: {
        type: "number",
        value: 10,
      },
      B1: {
        type: "number",
        value: 9,
      },
      B2: {
        type: "number",
        value: 10,
      },
      B3: {
        type: "number",
        value: 11,
      },
      C1: {
        type: "number",
        value: 1,
      },
      C2: {
        type: "number",
        value: 1,
      },
      C3: {
        type: "number",
        value: 1,
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "stdevp-success",
    formula: "STDEVP(Inputs!A1:A3)",
    expected: {
      type: "number",
      value: 1.632993161855452,
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
      A2: {
        type: "number",
        value: 12,
      },
      A3: {
        type: "number",
        value: 10,
      },
      B1: {
        type: "number",
        value: 9,
      },
      B2: {
        type: "number",
        value: 10,
      },
      B3: {
        type: "number",
        value: 11,
      },
      C1: {
        type: "number",
        value: 1,
      },
      C2: {
        type: "number",
        value: 1,
      },
      C3: {
        type: "number",
        value: 1,
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "stdevp-domain",
    formula: "STDEVP(Inputs!D1)",
    expected: {
      type: "error",
      value: "#DIV/0!",
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
      A2: {
        type: "number",
        value: 12,
      },
      A3: {
        type: "number",
        value: 10,
      },
      B1: {
        type: "number",
        value: 9,
      },
      B2: {
        type: "number",
        value: 10,
      },
      B3: {
        type: "number",
        value: 11,
      },
      C1: {
        type: "number",
        value: 1,
      },
      C2: {
        type: "number",
        value: 1,
      },
      C3: {
        type: "number",
        value: 1,
      },
    },
  },
  {
    name: "stdevp-propagation",
    formula: "STDEVP(#REF!)",
    expected: {
      type: "error",
      value: "#REF!",
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
      A2: {
        type: "number",
        value: 12,
      },
      A3: {
        type: "number",
        value: 10,
      },
      B1: {
        type: "number",
        value: 9,
      },
      B2: {
        type: "number",
        value: 10,
      },
      B3: {
        type: "number",
        value: 11,
      },
      C1: {
        type: "number",
        value: 1,
      },
      C2: {
        type: "number",
        value: 1,
      },
      C3: {
        type: "number",
        value: 1,
      },
    },
  },
  {
    name: "stdevp-nested",
    formula: "STDEVP(Inputs!A1:A3)+1",
    expected: {
      type: "number",
      value: 2.632993161855452,
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
      A2: {
        type: "number",
        value: 12,
      },
      A3: {
        type: "number",
        value: 10,
      },
      B1: {
        type: "number",
        value: 9,
      },
      B2: {
        type: "number",
        value: 10,
      },
      B3: {
        type: "number",
        value: 11,
      },
      C1: {
        type: "number",
        value: 1,
      },
      C2: {
        type: "number",
        value: 1,
      },
      C3: {
        type: "number",
        value: 1,
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "tdist-success",
    formula: "TDIST(2,5,2)",
    expected: {
      type: "number",
      value: 0.10193947882985832,
    },
    tolerance: 1e-11,
  },
  {
    name: "tdist-domain",
    formula: "TDIST(-2,5,2)",
    expected: {
      type: "error",
      value: "#NUM!",
    },
  },
  {
    name: "tdist-propagation",
    formula: "TDIST(#REF!,5,2)",
    expected: {
      type: "error",
      value: "#REF!",
    },
  },
  {
    name: "tdist-nested",
    formula: "TDIST(2,5,2)+1",
    expected: {
      type: "number",
      value: 1.1019394788298582,
    },
    tolerance: 1e-11,
  },
  {
    name: "tinv-success",
    formula: "TINV(.05,5)",
    expected: {
      type: "number",
      value: 2.5705818356363155,
    },
    tolerance: 1e-11,
  },
  {
    name: "tinv-domain",
    formula: "TINV(0,5)",
    expected: {
      type: "error",
      value: "#NUM!",
    },
  },
  {
    name: "tinv-propagation",
    formula: "TINV(#REF!,5)",
    expected: {
      type: "error",
      value: "#REF!",
    },
  },
  {
    name: "tinv-nested",
    formula: "TINV(.05,5)+1",
    expected: {
      type: "number",
      value: 3.5705818356363155,
    },
    tolerance: 1e-11,
  },
  {
    name: "ttest-success",
    formula: "TTEST(Inputs!A1:A3,Inputs!B1:B3,2,3)",
    expected: {
      type: "number",
      value: 1,
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
      A2: {
        type: "number",
        value: 12,
      },
      A3: {
        type: "number",
        value: 10,
      },
      B1: {
        type: "number",
        value: 9,
      },
      B2: {
        type: "number",
        value: 10,
      },
      B3: {
        type: "number",
        value: 11,
      },
      C1: {
        type: "number",
        value: 1,
      },
      C2: {
        type: "number",
        value: 1,
      },
      C3: {
        type: "number",
        value: 1,
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "ttest-domain",
    formula: "TTEST(Inputs!A1:A3,Inputs!B1:B2,2,1)",
    expected: {
      type: "error",
      value: "#N/A",
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
      A2: {
        type: "number",
        value: 12,
      },
      A3: {
        type: "number",
        value: 10,
      },
      B1: {
        type: "number",
        value: 9,
      },
      B2: {
        type: "number",
        value: 10,
      },
      B3: {
        type: "number",
        value: 11,
      },
      C1: {
        type: "number",
        value: 1,
      },
      C2: {
        type: "number",
        value: 1,
      },
      C3: {
        type: "number",
        value: 1,
      },
    },
  },
  {
    name: "ttest-propagation",
    formula: "TTEST(#REF!,Inputs!B1:B3,2,3)",
    expected: {
      type: "error",
      value: "#REF!",
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
      A2: {
        type: "number",
        value: 12,
      },
      A3: {
        type: "number",
        value: 10,
      },
      B1: {
        type: "number",
        value: 9,
      },
      B2: {
        type: "number",
        value: 10,
      },
      B3: {
        type: "number",
        value: 11,
      },
      C1: {
        type: "number",
        value: 1,
      },
      C2: {
        type: "number",
        value: 1,
      },
      C3: {
        type: "number",
        value: 1,
      },
    },
  },
  {
    name: "ttest-nested",
    formula: "TTEST(Inputs!A1:A3,Inputs!B1:B3,2,3)+1",
    expected: {
      type: "number",
      value: 2,
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
      A2: {
        type: "number",
        value: 12,
      },
      A3: {
        type: "number",
        value: 10,
      },
      B1: {
        type: "number",
        value: 9,
      },
      B2: {
        type: "number",
        value: 10,
      },
      B3: {
        type: "number",
        value: 11,
      },
      C1: {
        type: "number",
        value: 1,
      },
      C2: {
        type: "number",
        value: 1,
      },
      C3: {
        type: "number",
        value: 1,
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "var-success",
    formula: "VAR(Inputs!A1:A3)",
    expected: {
      type: "number",
      value: 4,
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
      A2: {
        type: "number",
        value: 12,
      },
      A3: {
        type: "number",
        value: 10,
      },
      B1: {
        type: "number",
        value: 9,
      },
      B2: {
        type: "number",
        value: 10,
      },
      B3: {
        type: "number",
        value: 11,
      },
      C1: {
        type: "number",
        value: 1,
      },
      C2: {
        type: "number",
        value: 1,
      },
      C3: {
        type: "number",
        value: 1,
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "var-domain",
    formula: "VAR(Inputs!C1)",
    expected: {
      type: "error",
      value: "#DIV/0!",
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
      A2: {
        type: "number",
        value: 12,
      },
      A3: {
        type: "number",
        value: 10,
      },
      B1: {
        type: "number",
        value: 9,
      },
      B2: {
        type: "number",
        value: 10,
      },
      B3: {
        type: "number",
        value: 11,
      },
      C1: {
        type: "number",
        value: 1,
      },
      C2: {
        type: "number",
        value: 1,
      },
      C3: {
        type: "number",
        value: 1,
      },
    },
  },
  {
    name: "var-propagation",
    formula: "VAR(#REF!)",
    expected: {
      type: "error",
      value: "#REF!",
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
      A2: {
        type: "number",
        value: 12,
      },
      A3: {
        type: "number",
        value: 10,
      },
      B1: {
        type: "number",
        value: 9,
      },
      B2: {
        type: "number",
        value: 10,
      },
      B3: {
        type: "number",
        value: 11,
      },
      C1: {
        type: "number",
        value: 1,
      },
      C2: {
        type: "number",
        value: 1,
      },
      C3: {
        type: "number",
        value: 1,
      },
    },
  },
  {
    name: "var-nested",
    formula: "VAR(Inputs!A1:A3)+1",
    expected: {
      type: "number",
      value: 5,
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
      A2: {
        type: "number",
        value: 12,
      },
      A3: {
        type: "number",
        value: 10,
      },
      B1: {
        type: "number",
        value: 9,
      },
      B2: {
        type: "number",
        value: 10,
      },
      B3: {
        type: "number",
        value: 11,
      },
      C1: {
        type: "number",
        value: 1,
      },
      C2: {
        type: "number",
        value: 1,
      },
      C3: {
        type: "number",
        value: 1,
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "varp-success",
    formula: "VARP(Inputs!A1:A3)",
    expected: {
      type: "number",
      value: 2.6666666666666665,
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
      A2: {
        type: "number",
        value: 12,
      },
      A3: {
        type: "number",
        value: 10,
      },
      B1: {
        type: "number",
        value: 9,
      },
      B2: {
        type: "number",
        value: 10,
      },
      B3: {
        type: "number",
        value: 11,
      },
      C1: {
        type: "number",
        value: 1,
      },
      C2: {
        type: "number",
        value: 1,
      },
      C3: {
        type: "number",
        value: 1,
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "varp-domain",
    formula: "VARP(Inputs!D1)",
    expected: {
      type: "error",
      value: "#DIV/0!",
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
      A2: {
        type: "number",
        value: 12,
      },
      A3: {
        type: "number",
        value: 10,
      },
      B1: {
        type: "number",
        value: 9,
      },
      B2: {
        type: "number",
        value: 10,
      },
      B3: {
        type: "number",
        value: 11,
      },
      C1: {
        type: "number",
        value: 1,
      },
      C2: {
        type: "number",
        value: 1,
      },
      C3: {
        type: "number",
        value: 1,
      },
    },
  },
  {
    name: "varp-propagation",
    formula: "VARP(#REF!)",
    expected: {
      type: "error",
      value: "#REF!",
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
      A2: {
        type: "number",
        value: 12,
      },
      A3: {
        type: "number",
        value: 10,
      },
      B1: {
        type: "number",
        value: 9,
      },
      B2: {
        type: "number",
        value: 10,
      },
      B3: {
        type: "number",
        value: 11,
      },
      C1: {
        type: "number",
        value: 1,
      },
      C2: {
        type: "number",
        value: 1,
      },
      C3: {
        type: "number",
        value: 1,
      },
    },
  },
  {
    name: "varp-nested",
    formula: "VARP(Inputs!A1:A3)+1",
    expected: {
      type: "number",
      value: 3.6666666666666665,
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
      A2: {
        type: "number",
        value: 12,
      },
      A3: {
        type: "number",
        value: 10,
      },
      B1: {
        type: "number",
        value: 9,
      },
      B2: {
        type: "number",
        value: 10,
      },
      B3: {
        type: "number",
        value: 11,
      },
      C1: {
        type: "number",
        value: 1,
      },
      C2: {
        type: "number",
        value: 1,
      },
      C3: {
        type: "number",
        value: 1,
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "weibull-success",
    formula: "WEIBULL(3,2,4,TRUE)",
    expected: {
      type: "number",
      value: 0.430217175269077,
    },
    tolerance: 1e-11,
  },
  {
    name: "weibull-domain",
    formula: "WEIBULL(3,0,4,TRUE)",
    expected: {
      type: "error",
      value: "#NUM!",
    },
  },
  {
    name: "weibull-propagation",
    formula: "WEIBULL(#REF!,2,4,TRUE)",
    expected: {
      type: "error",
      value: "#REF!",
    },
  },
  {
    name: "weibull-nested",
    formula: "WEIBULL(3,2,4,TRUE)+1",
    expected: {
      type: "number",
      value: 1.4302171752690769,
    },
    tolerance: 1e-11,
  },
  {
    name: "ztest-success",
    formula: "ZTEST(Inputs!A1:A3,9)",
    expected: {
      type: "number",
      value: 0.19323811538561636,
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
      A2: {
        type: "number",
        value: 12,
      },
      A3: {
        type: "number",
        value: 10,
      },
      B1: {
        type: "number",
        value: 9,
      },
      B2: {
        type: "number",
        value: 10,
      },
      B3: {
        type: "number",
        value: 11,
      },
      C1: {
        type: "number",
        value: 1,
      },
      C2: {
        type: "number",
        value: 1,
      },
      C3: {
        type: "number",
        value: 1,
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "ztest-domain",
    formula: "ZTEST(Inputs!D1,9)",
    expected: {
      type: "error",
      value: "#N/A",
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
      A2: {
        type: "number",
        value: 12,
      },
      A3: {
        type: "number",
        value: 10,
      },
      B1: {
        type: "number",
        value: 9,
      },
      B2: {
        type: "number",
        value: 10,
      },
      B3: {
        type: "number",
        value: 11,
      },
      C1: {
        type: "number",
        value: 1,
      },
      C2: {
        type: "number",
        value: 1,
      },
      C3: {
        type: "number",
        value: 1,
      },
    },
  },
  {
    name: "ztest-propagation",
    formula: "ZTEST(#REF!,9)",
    expected: {
      type: "error",
      value: "#REF!",
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
      A2: {
        type: "number",
        value: 12,
      },
      A3: {
        type: "number",
        value: 10,
      },
      B1: {
        type: "number",
        value: 9,
      },
      B2: {
        type: "number",
        value: 10,
      },
      B3: {
        type: "number",
        value: 11,
      },
      C1: {
        type: "number",
        value: 1,
      },
      C2: {
        type: "number",
        value: 1,
      },
      C3: {
        type: "number",
        value: 1,
      },
    },
  },
  {
    name: "ztest-nested",
    formula: "ZTEST(Inputs!A1:A3,9)+1",
    expected: {
      type: "number",
      value: 1.1932381153856164,
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
      A2: {
        type: "number",
        value: 12,
      },
      A3: {
        type: "number",
        value: 10,
      },
      B1: {
        type: "number",
        value: 9,
      },
      B2: {
        type: "number",
        value: 10,
      },
      B3: {
        type: "number",
        value: 11,
      },
      C1: {
        type: "number",
        value: 1,
      },
      C2: {
        type: "number",
        value: 1,
      },
      C3: {
        type: "number",
        value: 1,
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "beta-bounds",
    formula: "BETADIST(2,8,10,1,3)",
    expected: {
      type: "number",
      value: 0.6854705810546875,
    },
    tolerance: 1e-11,
  },
  {
    name: "beta-upper",
    formula: "BETAINV(1,2,5)",
    expected: {
      type: "number",
      value: 1,
    },
    tolerance: 1e-11,
  },
  {
    name: "binomial-cumulative",
    formula: "BINOMDIST(3.9,10.9,.2,TRUE)",
    expected: {
      type: "number",
      value: 0.8791261183999999,
    },
    tolerance: 1e-11,
  },
  {
    name: "binomial-zero",
    formula: "BINOMDIST(0,10,0,FALSE)",
    expected: {
      type: "number",
      value: 1,
    },
    tolerance: 1e-11,
  },
  {
    name: "ceiling-negative",
    formula: "CEILING(-2.5,2)",
    expected: {
      type: "number",
      value: -2,
    },
    tolerance: 1e-11,
  },
  {
    name: "ceiling-negative-significance",
    formula: "CEILING(-2.5,-2)",
    expected: {
      type: "number",
      value: -4,
    },
    tolerance: 1e-11,
  },
  {
    name: "ceiling-zero",
    formula: "CEILING(2,0)",
    expected: {
      type: "number",
      value: 0,
    },
    tolerance: 1e-11,
  },
  {
    name: "floor-zero",
    formula: "FLOOR(2,0)",
    expected: {
      type: "error",
      value: "#DIV/0!",
    },
  },
  {
    name: "floor-negative",
    formula: "FLOOR(-2.5,2)",
    expected: {
      type: "number",
      value: -4,
    },
    tolerance: 1e-11,
  },
  {
    name: "floor-decimal",
    formula: "FLOOR(.3,.1)",
    expected: {
      type: "number",
      value: 0.3,
    },
    tolerance: 1e-11,
  },
  {
    name: "normal-density",
    formula: "NORMDIST(1,1,2,FALSE)",
    expected: {
      type: "number",
      value: 0.19947114020071635,
    },
    tolerance: 1e-11,
  },
  {
    name: "normal-left-tail",
    formula: "NORMSDIST(-10)",
    expected: {
      type: "number",
      value: 7.619853024160474e-24,
    },
    tolerance: 1e-11,
  },
  {
    name: "normal-tiny-inverse",
    formula: "NORMSINV(1E-100)",
    expected: {
      type: "number",
      value: -21.273453560965322,
    },
    tolerance: 1e-11,
  },
  {
    name: "normal-upper-inverse",
    formula: "NORMSINV(.9999999999)",
    expected: {
      type: "number",
      value: 6.361340889697422,
    },
    tolerance: 1e-11,
  },
  {
    name: "gamma-density",
    formula: "GAMMADIST(3,2,4,FALSE)",
    expected: {
      type: "number",
      value: 0.08856872863894028,
    },
    tolerance: 1e-11,
  },
  {
    name: "gamma-zero-density",
    formula: "GAMMADIST(0,1,2,FALSE)",
    expected: {
      type: "number",
      value: 0.5,
    },
    tolerance: 1e-11,
  },
  {
    name: "gamma-zero-cdf",
    formula: "GAMMADIST(0,.5,2,TRUE)",
    expected: {
      type: "number",
      value: 0,
    },
    tolerance: 1e-11,
  },
  {
    name: "gamma-zero-inverse",
    formula: "GAMMAINV(0,2,4)",
    expected: {
      type: "number",
      value: 0,
    },
    tolerance: 1e-11,
  },
  {
    name: "gamma-small-shape",
    formula: "GAMMAINV(.1,.1,1)",
    expected: {
      type: "number",
      value: 6.073048362743206e-11,
    },
    tolerance: 1e-11,
  },
  {
    name: "exp-density",
    formula: "EXPONDIST(2,3,FALSE)",
    expected: {
      type: "number",
      value: 0.0074362565299990755,
    },
    tolerance: 1e-11,
  },
  {
    name: "exp-tiny",
    formula: "EXPONDIST(1E-12,1,TRUE)",
    expected: {
      type: "number",
      value: 9.999999999995e-13,
    },
    tolerance: 1e-11,
  },
  {
    name: "poisson-mass",
    formula: "POISSON(2,5,FALSE)",
    expected: {
      type: "number",
      value: 0.08422433748856832,
    },
    tolerance: 1e-11,
  },
  {
    name: "poisson-zero",
    formula: "POISSON(0,0,FALSE)",
    expected: {
      type: "number",
      value: 1,
    },
    tolerance: 1e-11,
  },
  {
    name: "weibull-density",
    formula: "WEIBULL(3,2,4,FALSE)",
    expected: {
      type: "number",
      value: 0.21366855927409611,
    },
    tolerance: 1e-11,
  },
  {
    name: "weibull-zero",
    formula: "WEIBULL(0,2,4,FALSE)",
    expected: {
      type: "number",
      value: 0,
    },
    tolerance: 1e-11,
  },
  {
    name: "loginv-overflow",
    formula: "LOGINV(.99,1000,1)",
    expected: {
      type: "error",
      value: "#NUM!",
    },
  },
  {
    name: "var-literal-coercion",
    formula: 'VAR("1",TRUE,3)',
    expected: {
      type: "number",
      value: 1.3333333333333333,
    },
    tolerance: 1e-11,
  },
  {
    name: "mode-literal-coercion",
    formula: 'MODE("2",2,3)',
    expected: {
      type: "number",
      value: 2,
    },
    tolerance: 1e-11,
  },
  {
    name: "var-stable",
    formula: "VAR(1000000001,1000000002,1000000003)",
    expected: {
      type: "number",
      value: 1,
    },
    tolerance: 1e-11,
  },
  {
    name: "rank-ascending",
    formula: "RANK(10,Inputs!A1:A3,1)",
    expected: {
      type: "number",
      value: 2,
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
      A2: {
        type: "number",
        value: 12,
      },
      A3: {
        type: "number",
        value: 10,
      },
      B1: {
        type: "number",
        value: 9,
      },
      B2: {
        type: "number",
        value: 10,
      },
      B3: {
        type: "number",
        value: 11,
      },
      C1: {
        type: "number",
        value: 1,
      },
      C2: {
        type: "number",
        value: 1,
      },
      C3: {
        type: "number",
        value: 1,
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "percentile-endpoint",
    formula: "PERCENTILE(Inputs!A1:A3,1)",
    expected: {
      type: "number",
      value: 12,
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
      A2: {
        type: "number",
        value: 12,
      },
      A3: {
        type: "number",
        value: 10,
      },
      B1: {
        type: "number",
        value: 9,
      },
      B2: {
        type: "number",
        value: 10,
      },
      B3: {
        type: "number",
        value: 11,
      },
      C1: {
        type: "number",
        value: 1,
      },
      C2: {
        type: "number",
        value: 1,
      },
      C3: {
        type: "number",
        value: 1,
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "quartile-truncate",
    formula: "QUARTILE(Inputs!A1:A3,1.9)",
    expected: {
      type: "number",
      value: 9,
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
      A2: {
        type: "number",
        value: 12,
      },
      A3: {
        type: "number",
        value: 10,
      },
      B1: {
        type: "number",
        value: 9,
      },
      B2: {
        type: "number",
        value: 10,
      },
      B3: {
        type: "number",
        value: 11,
      },
      C1: {
        type: "number",
        value: 1,
      },
      C2: {
        type: "number",
        value: 1,
      },
      C3: {
        type: "number",
        value: 1,
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "percentrank-precision",
    formula: "PERCENTRANK(Inputs!A1:A3,9.333,4)",
    expected: {
      type: "number",
      value: 0.3332,
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
      A2: {
        type: "number",
        value: 12,
      },
      A3: {
        type: "number",
        value: 10,
      },
      B1: {
        type: "number",
        value: 9,
      },
      B2: {
        type: "number",
        value: 10,
      },
      B3: {
        type: "number",
        value: 11,
      },
      C1: {
        type: "number",
        value: 1,
      },
      C2: {
        type: "number",
        value: 1,
      },
      C3: {
        type: "number",
        value: 1,
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "ttest-paired",
    formula: "TTEST(Inputs!A1:A3,Inputs!B1:B3,2,1)",
    expected: {
      type: "number",
      value: 1,
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
      A2: {
        type: "number",
        value: 12,
      },
      A3: {
        type: "number",
        value: 10,
      },
      B1: {
        type: "number",
        value: 9,
      },
      B2: {
        type: "number",
        value: 10,
      },
      B3: {
        type: "number",
        value: 11,
      },
      C1: {
        type: "number",
        value: 1,
      },
      C2: {
        type: "number",
        value: 1,
      },
      C3: {
        type: "number",
        value: 1,
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "ttest-pooled",
    formula: "TTEST(Inputs!A1:A3,Inputs!B1:B3,1,2)",
    expected: {
      type: "number",
      value: 0.5,
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
      A2: {
        type: "number",
        value: 12,
      },
      A3: {
        type: "number",
        value: 10,
      },
      B1: {
        type: "number",
        value: 9,
      },
      B2: {
        type: "number",
        value: 10,
      },
      B3: {
        type: "number",
        value: 11,
      },
      C1: {
        type: "number",
        value: 1,
      },
      C2: {
        type: "number",
        value: 1,
      },
      C3: {
        type: "number",
        value: 1,
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "ztest-sigma",
    formula: "ZTEST(Inputs!A1:A3,9,2)",
    expected: {
      type: "number",
      value: 0.19323811538561636,
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
      A2: {
        type: "number",
        value: 12,
      },
      A3: {
        type: "number",
        value: 10,
      },
      B1: {
        type: "number",
        value: 9,
      },
      B2: {
        type: "number",
        value: 10,
      },
      B3: {
        type: "number",
        value: 11,
      },
      C1: {
        type: "number",
        value: 1,
      },
      C2: {
        type: "number",
        value: 1,
      },
      C3: {
        type: "number",
        value: 1,
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "chi-zero",
    formula: "CHIDIST(0,2)",
    expected: {
      type: "number",
      value: 1,
    },
    tolerance: 1e-11,
  },
  {
    name: "chi-one",
    formula: "CHIINV(1,2)",
    expected: {
      type: "number",
      value: 0,
    },
    tolerance: 1e-11,
  },
  {
    name: "f-zero",
    formula: "FDIST(0,2,2)",
    expected: {
      type: "number",
      value: 1,
    },
    tolerance: 1e-11,
  },
  {
    name: "f-one",
    formula: "FINV(1,2,2)",
    expected: {
      type: "number",
      value: 0,
    },
    tolerance: 1e-11,
  },
  {
    name: "t-zero",
    formula: "TDIST(0,5,1)",
    expected: {
      type: "number",
      value: 0.5,
    },
    tolerance: 1e-11,
  },
  {
    name: "t-one",
    formula: "TINV(1,5)",
    expected: {
      type: "number",
      value: 0,
    },
    tolerance: 1e-11,
  },
  {
    name: "date-serials-1900",
    formula: "VAR(Inputs!A1:A3)",
    expected: {
      type: "number",
      value: 1,
    },
    cells: {
      A1: {
        type: "number",
        value: 45000,
      },
      A2: {
        type: "number",
        value: 45001,
      },
      A3: {
        type: "number",
        value: 45002,
      },
    },
    dateSystem: "1900",
  },
  {
    name: "date-serials-1904",
    formula: "VAR(Inputs!A1:A3)",
    expected: {
      type: "number",
      value: 1,
    },
    cells: {
      A1: {
        type: "number",
        value: 45000,
      },
      A2: {
        type: "number",
        value: 45001,
      },
      A3: {
        type: "number",
        value: 45002,
      },
    },
    dateSystem: "1904",
  },
  {
    name: "betadist-numeric-reference",
    formula: "BETADIST(Inputs!A1,2,5)",
    expected: {
      type: "number",
      value: 0.5798250000000003,
    },
    cells: {
      A1: {
        type: "number",
        value: 0.3,
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "betadist-text-reference",
    formula: "BETADIST(Inputs!A1,2,5)",
    expected: {
      type: "number",
      value: 0.5798250000000003,
    },
    cells: {
      A1: {
        type: "string",
        value: "0.3",
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "betadist-bad-reference",
    formula: "BETADIST(Inputs!A1,2,5)",
    expected: {
      type: "error",
      value: "#VALUE!",
    },
    cells: {
      A1: {
        type: "string",
        value: "bad",
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "betainv-numeric-reference",
    formula: "BETAINV(Inputs!A1,2,5)",
    expected: {
      type: "number",
      value: 0.3094444275453145,
    },
    cells: {
      A1: {
        type: "number",
        value: 0.6,
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "betainv-text-reference",
    formula: "BETAINV(Inputs!A1,2,5)",
    expected: {
      type: "number",
      value: 0.3094444275453145,
    },
    cells: {
      A1: {
        type: "string",
        value: "0.6",
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "betainv-bad-reference",
    formula: "BETAINV(Inputs!A1,2,5)",
    expected: {
      type: "error",
      value: "#VALUE!",
    },
    cells: {
      A1: {
        type: "string",
        value: "bad",
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "binomdist-numeric-reference",
    formula: "BINOMDIST(Inputs!A1,10,.2,FALSE)",
    expected: {
      type: "number",
      value: 0.201326592,
    },
    cells: {
      A1: {
        type: "number",
        value: 3,
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "binomdist-text-reference",
    formula: "BINOMDIST(Inputs!A1,10,.2,FALSE)",
    expected: {
      type: "number",
      value: 0.201326592,
    },
    cells: {
      A1: {
        type: "string",
        value: "3.0",
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "binomdist-bad-reference",
    formula: "BINOMDIST(Inputs!A1,10,.2,FALSE)",
    expected: {
      type: "error",
      value: "#VALUE!",
    },
    cells: {
      A1: {
        type: "string",
        value: "bad",
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "ceiling-numeric-reference",
    formula: "CEILING(Inputs!A1,.05)",
    expected: {
      type: "number",
      value: 4.45,
    },
    cells: {
      A1: {
        type: "number",
        value: 4.42,
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "ceiling-text-reference",
    formula: "CEILING(Inputs!A1,.05)",
    expected: {
      type: "number",
      value: 4.45,
    },
    cells: {
      A1: {
        type: "string",
        value: "4.42",
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "ceiling-bad-reference",
    formula: "CEILING(Inputs!A1,.05)",
    expected: {
      type: "error",
      value: "#VALUE!",
    },
    cells: {
      A1: {
        type: "string",
        value: "bad",
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "chidist-numeric-reference",
    formula: "CHIDIST(Inputs!A1,4)",
    expected: {
      type: "number",
      value: 0.0915781944436709,
    },
    cells: {
      A1: {
        type: "number",
        value: 8,
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "chidist-text-reference",
    formula: "CHIDIST(Inputs!A1,4)",
    expected: {
      type: "number",
      value: 0.0915781944436709,
    },
    cells: {
      A1: {
        type: "string",
        value: "8.0",
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "chidist-bad-reference",
    formula: "CHIDIST(Inputs!A1,4)",
    expected: {
      type: "error",
      value: "#VALUE!",
    },
    cells: {
      A1: {
        type: "string",
        value: "bad",
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "chiinv-numeric-reference",
    formula: "CHIINV(Inputs!A1,4)",
    expected: {
      type: "number",
      value: 9.487729036781158,
    },
    cells: {
      A1: {
        type: "number",
        value: 0.05,
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "chiinv-text-reference",
    formula: "CHIINV(Inputs!A1,4)",
    expected: {
      type: "number",
      value: 9.487729036781158,
    },
    cells: {
      A1: {
        type: "string",
        value: "0.05",
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "chiinv-bad-reference",
    formula: "CHIINV(Inputs!A1,4)",
    expected: {
      type: "error",
      value: "#VALUE!",
    },
    cells: {
      A1: {
        type: "string",
        value: "bad",
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "confidence-numeric-reference",
    formula: "CONFIDENCE(Inputs!A1,2,100)",
    expected: {
      type: "number",
      value: 0.3919927969080109,
    },
    cells: {
      A1: {
        type: "number",
        value: 0.05,
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "confidence-text-reference",
    formula: "CONFIDENCE(Inputs!A1,2,100)",
    expected: {
      type: "number",
      value: 0.3919927969080109,
    },
    cells: {
      A1: {
        type: "string",
        value: "0.05",
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "confidence-bad-reference",
    formula: "CONFIDENCE(Inputs!A1,2,100)",
    expected: {
      type: "error",
      value: "#VALUE!",
    },
    cells: {
      A1: {
        type: "string",
        value: "bad",
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "critbinom-numeric-reference",
    formula: "CRITBINOM(Inputs!A1,.5,.75)",
    expected: {
      type: "number",
      value: 4,
    },
    cells: {
      A1: {
        type: "number",
        value: 6,
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "critbinom-text-reference",
    formula: "CRITBINOM(Inputs!A1,.5,.75)",
    expected: {
      type: "number",
      value: 4,
    },
    cells: {
      A1: {
        type: "string",
        value: "6.0",
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "critbinom-bad-reference",
    formula: "CRITBINOM(Inputs!A1,.5,.75)",
    expected: {
      type: "error",
      value: "#VALUE!",
    },
    cells: {
      A1: {
        type: "string",
        value: "bad",
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "expondist-numeric-reference",
    formula: "EXPONDIST(Inputs!A1,3,TRUE)",
    expected: {
      type: "number",
      value: 0.9975212478233336,
    },
    cells: {
      A1: {
        type: "number",
        value: 2,
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "expondist-text-reference",
    formula: "EXPONDIST(Inputs!A1,3,TRUE)",
    expected: {
      type: "number",
      value: 0.9975212478233336,
    },
    cells: {
      A1: {
        type: "string",
        value: "2.0",
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "expondist-bad-reference",
    formula: "EXPONDIST(Inputs!A1,3,TRUE)",
    expected: {
      type: "error",
      value: "#VALUE!",
    },
    cells: {
      A1: {
        type: "string",
        value: "bad",
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "fdist-numeric-reference",
    formula: "FDIST(Inputs!A1,5,7)",
    expected: {
      type: "number",
      value: 0.0922465610205496,
    },
    cells: {
      A1: {
        type: "number",
        value: 3,
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "fdist-text-reference",
    formula: "FDIST(Inputs!A1,5,7)",
    expected: {
      type: "number",
      value: 0.0922465610205496,
    },
    cells: {
      A1: {
        type: "string",
        value: "3.0",
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "fdist-bad-reference",
    formula: "FDIST(Inputs!A1,5,7)",
    expected: {
      type: "error",
      value: "#VALUE!",
    },
    cells: {
      A1: {
        type: "string",
        value: "bad",
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "finv-numeric-reference",
    formula: "FINV(Inputs!A1,5,7)",
    expected: {
      type: "number",
      value: 3.9715231506113415,
    },
    cells: {
      A1: {
        type: "number",
        value: 0.05,
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "finv-text-reference",
    formula: "FINV(Inputs!A1,5,7)",
    expected: {
      type: "number",
      value: 3.9715231506113415,
    },
    cells: {
      A1: {
        type: "string",
        value: "0.05",
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "finv-bad-reference",
    formula: "FINV(Inputs!A1,5,7)",
    expected: {
      type: "error",
      value: "#VALUE!",
    },
    cells: {
      A1: {
        type: "string",
        value: "bad",
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "floor-numeric-reference",
    formula: "FLOOR(Inputs!A1,-2)",
    expected: {
      type: "number",
      value: -2,
    },
    cells: {
      A1: {
        type: "number",
        value: -2.5,
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "floor-text-reference",
    formula: "FLOOR(Inputs!A1,-2)",
    expected: {
      type: "number",
      value: -2,
    },
    cells: {
      A1: {
        type: "string",
        value: "-2.5",
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "floor-bad-reference",
    formula: "FLOOR(Inputs!A1,-2)",
    expected: {
      type: "error",
      value: "#VALUE!",
    },
    cells: {
      A1: {
        type: "string",
        value: "bad",
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "gammadist-numeric-reference",
    formula: "GAMMADIST(Inputs!A1,2,4,TRUE)",
    expected: {
      type: "number",
      value: 0.17335853270322427,
    },
    cells: {
      A1: {
        type: "number",
        value: 3,
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "gammadist-text-reference",
    formula: "GAMMADIST(Inputs!A1,2,4,TRUE)",
    expected: {
      type: "number",
      value: 0.17335853270322427,
    },
    cells: {
      A1: {
        type: "string",
        value: "3.0",
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "gammadist-bad-reference",
    formula: "GAMMADIST(Inputs!A1,2,4,TRUE)",
    expected: {
      type: "error",
      value: "#VALUE!",
    },
    cells: {
      A1: {
        type: "string",
        value: "bad",
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "gammainv-numeric-reference",
    formula: "GAMMAINV(Inputs!A1,2,4)",
    expected: {
      type: "number",
      value: 9.756865933120816,
    },
    cells: {
      A1: {
        type: "number",
        value: 0.7,
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "gammainv-text-reference",
    formula: "GAMMAINV(Inputs!A1,2,4)",
    expected: {
      type: "number",
      value: 9.756865933120816,
    },
    cells: {
      A1: {
        type: "string",
        value: "0.7",
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "gammainv-bad-reference",
    formula: "GAMMAINV(Inputs!A1,2,4)",
    expected: {
      type: "error",
      value: "#VALUE!",
    },
    cells: {
      A1: {
        type: "string",
        value: "bad",
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "hypgeomdist-numeric-reference",
    formula: "HYPGEOMDIST(Inputs!A1,5,8,20)",
    expected: {
      type: "number",
      value: 0.39731682146542835,
    },
    cells: {
      A1: {
        type: "number",
        value: 2,
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "hypgeomdist-text-reference",
    formula: "HYPGEOMDIST(Inputs!A1,5,8,20)",
    expected: {
      type: "number",
      value: 0.39731682146542835,
    },
    cells: {
      A1: {
        type: "string",
        value: "2.0",
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "hypgeomdist-bad-reference",
    formula: "HYPGEOMDIST(Inputs!A1,5,8,20)",
    expected: {
      type: "error",
      value: "#VALUE!",
    },
    cells: {
      A1: {
        type: "string",
        value: "bad",
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "loginv-numeric-reference",
    formula: "LOGINV(Inputs!A1,1,2)",
    expected: {
      type: "number",
      value: 7.758593171413643,
    },
    cells: {
      A1: {
        type: "number",
        value: 0.7,
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "loginv-text-reference",
    formula: "LOGINV(Inputs!A1,1,2)",
    expected: {
      type: "number",
      value: 7.758593171413643,
    },
    cells: {
      A1: {
        type: "string",
        value: "0.7",
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "loginv-bad-reference",
    formula: "LOGINV(Inputs!A1,1,2)",
    expected: {
      type: "error",
      value: "#VALUE!",
    },
    cells: {
      A1: {
        type: "string",
        value: "bad",
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "lognormdist-numeric-reference",
    formula: "LOGNORMDIST(Inputs!A1,1,2)",
    expected: {
      type: "number",
      value: 0.5196623384975168,
    },
    cells: {
      A1: {
        type: "number",
        value: 3,
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "lognormdist-text-reference",
    formula: "LOGNORMDIST(Inputs!A1,1,2)",
    expected: {
      type: "number",
      value: 0.5196623384975168,
    },
    cells: {
      A1: {
        type: "string",
        value: "3.0",
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "lognormdist-bad-reference",
    formula: "LOGNORMDIST(Inputs!A1,1,2)",
    expected: {
      type: "error",
      value: "#VALUE!",
    },
    cells: {
      A1: {
        type: "string",
        value: "bad",
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "negbinomdist-numeric-reference",
    formula: "NEGBINOMDIST(Inputs!A1,3,.2)",
    expected: {
      type: "number",
      value: 0.049152000000000064,
    },
    cells: {
      A1: {
        type: "number",
        value: 4,
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "negbinomdist-text-reference",
    formula: "NEGBINOMDIST(Inputs!A1,3,.2)",
    expected: {
      type: "number",
      value: 0.049152000000000064,
    },
    cells: {
      A1: {
        type: "string",
        value: "4.0",
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "negbinomdist-bad-reference",
    formula: "NEGBINOMDIST(Inputs!A1,3,.2)",
    expected: {
      type: "error",
      value: "#VALUE!",
    },
    cells: {
      A1: {
        type: "string",
        value: "bad",
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "normdist-numeric-reference",
    formula: "NORMDIST(Inputs!A1,1,2,TRUE)",
    expected: {
      type: "number",
      value: 0.8413447460685429,
    },
    cells: {
      A1: {
        type: "number",
        value: 3,
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "normdist-text-reference",
    formula: "NORMDIST(Inputs!A1,1,2,TRUE)",
    expected: {
      type: "number",
      value: 0.8413447460685429,
    },
    cells: {
      A1: {
        type: "string",
        value: "3.0",
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "normdist-bad-reference",
    formula: "NORMDIST(Inputs!A1,1,2,TRUE)",
    expected: {
      type: "error",
      value: "#VALUE!",
    },
    cells: {
      A1: {
        type: "string",
        value: "bad",
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "norminv-numeric-reference",
    formula: "NORMINV(Inputs!A1,1,2)",
    expected: {
      type: "number",
      value: 2.0488010254160813,
    },
    cells: {
      A1: {
        type: "number",
        value: 0.7,
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "norminv-text-reference",
    formula: "NORMINV(Inputs!A1,1,2)",
    expected: {
      type: "number",
      value: 2.0488010254160813,
    },
    cells: {
      A1: {
        type: "string",
        value: "0.7",
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "norminv-bad-reference",
    formula: "NORMINV(Inputs!A1,1,2)",
    expected: {
      type: "error",
      value: "#VALUE!",
    },
    cells: {
      A1: {
        type: "string",
        value: "bad",
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "normsdist-numeric-reference",
    formula: "NORMSDIST(Inputs!A1)",
    expected: {
      type: "number",
      value: 0.022750131948179198,
    },
    cells: {
      A1: {
        type: "number",
        value: -2,
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "normsdist-text-reference",
    formula: "NORMSDIST(Inputs!A1)",
    expected: {
      type: "number",
      value: 0.022750131948179198,
    },
    cells: {
      A1: {
        type: "string",
        value: "-2.0",
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "normsdist-bad-reference",
    formula: "NORMSDIST(Inputs!A1)",
    expected: {
      type: "error",
      value: "#VALUE!",
    },
    cells: {
      A1: {
        type: "string",
        value: "bad",
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "normsinv-numeric-reference",
    formula: "NORMSINV(Inputs!A1)",
    expected: {
      type: "number",
      value: -1.9599639845400545,
    },
    cells: {
      A1: {
        type: "number",
        value: 0.025,
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "normsinv-text-reference",
    formula: "NORMSINV(Inputs!A1)",
    expected: {
      type: "number",
      value: -1.9599639845400545,
    },
    cells: {
      A1: {
        type: "string",
        value: "0.025",
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "normsinv-bad-reference",
    formula: "NORMSINV(Inputs!A1)",
    expected: {
      type: "error",
      value: "#VALUE!",
    },
    cells: {
      A1: {
        type: "string",
        value: "bad",
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "poisson-numeric-reference",
    formula: "POISSON(Inputs!A1,5,TRUE)",
    expected: {
      type: "number",
      value: 0.12465201948308109,
    },
    cells: {
      A1: {
        type: "number",
        value: 2,
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "poisson-text-reference",
    formula: "POISSON(Inputs!A1,5,TRUE)",
    expected: {
      type: "number",
      value: 0.12465201948308109,
    },
    cells: {
      A1: {
        type: "string",
        value: "2.0",
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "poisson-bad-reference",
    formula: "POISSON(Inputs!A1,5,TRUE)",
    expected: {
      type: "error",
      value: "#VALUE!",
    },
    cells: {
      A1: {
        type: "string",
        value: "bad",
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "tdist-numeric-reference",
    formula: "TDIST(Inputs!A1,5,2)",
    expected: {
      type: "number",
      value: 0.10193947882985832,
    },
    cells: {
      A1: {
        type: "number",
        value: 2,
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "tdist-text-reference",
    formula: "TDIST(Inputs!A1,5,2)",
    expected: {
      type: "number",
      value: 0.10193947882985832,
    },
    cells: {
      A1: {
        type: "string",
        value: "2.0",
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "tdist-bad-reference",
    formula: "TDIST(Inputs!A1,5,2)",
    expected: {
      type: "error",
      value: "#VALUE!",
    },
    cells: {
      A1: {
        type: "string",
        value: "bad",
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "tinv-numeric-reference",
    formula: "TINV(Inputs!A1,5)",
    expected: {
      type: "number",
      value: 2.5705818356363155,
    },
    cells: {
      A1: {
        type: "number",
        value: 0.05,
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "tinv-text-reference",
    formula: "TINV(Inputs!A1,5)",
    expected: {
      type: "number",
      value: 2.5705818356363155,
    },
    cells: {
      A1: {
        type: "string",
        value: "0.05",
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "tinv-bad-reference",
    formula: "TINV(Inputs!A1,5)",
    expected: {
      type: "error",
      value: "#VALUE!",
    },
    cells: {
      A1: {
        type: "string",
        value: "bad",
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "weibull-numeric-reference",
    formula: "WEIBULL(Inputs!A1,2,4,TRUE)",
    expected: {
      type: "number",
      value: 0.430217175269077,
    },
    cells: {
      A1: {
        type: "number",
        value: 3,
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "weibull-text-reference",
    formula: "WEIBULL(Inputs!A1,2,4,TRUE)",
    expected: {
      type: "number",
      value: 0.430217175269077,
    },
    cells: {
      A1: {
        type: "string",
        value: "3.0",
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "weibull-bad-reference",
    formula: "WEIBULL(Inputs!A1,2,4,TRUE)",
    expected: {
      type: "error",
      value: "#VALUE!",
    },
    cells: {
      A1: {
        type: "string",
        value: "bad",
      },
    },
    tolerance: 1e-11,
  },
  {
    name: "beta-grid-0.1-0.3",
    formula: "BETADIST(1e-12,0.1,0.3)",
    expected: {
      type: "number",
      value: 0.04917598681730221,
    },
    tolerance: 2e-12,
  },
  {
    name: "beta-grid-0.1-10",
    formula: "BETADIST(0.05,0.1,10)",
    expected: {
      type: "number",
      value: 0.9402167355790857,
    },
    tolerance: 2e-12,
  },
  {
    name: "beta-grid-50-100",
    formula: "BETADIST(0.3,50,100)",
    expected: {
      type: "number",
      value: 0.1945518337722456,
    },
    tolerance: 2e-12,
  },
  {
    name: "beta-grid-1000-1000",
    formula: "BETADIST(0.5,1000,1000)",
    expected: {
      type: "number",
      value: 0.4999999999999984,
    },
    tolerance: 2e-12,
  },
  {
    name: "beta-grid-2-5",
    formula: "BETADIST(0.999999,2,5)",
    expected: {
      type: "number",
      value: 1,
    },
    tolerance: 2e-12,
  },
  {
    name: "gamma-grid-0.1",
    formula: "GAMMADIST(1e-12,0.1,1,TRUE)",
    expected: {
      type: "number",
      value: 0.06632226140610875,
    },
    tolerance: 3e-11,
  },
  {
    name: "gamma-grid-0.5",
    formula: "GAMMADIST(0.1,0.5,1,TRUE)",
    expected: {
      type: "number",
      value: 0.34527915398142317,
    },
    tolerance: 3e-11,
  },
  {
    name: "gamma-grid-100",
    formula: "GAMMADIST(100,100,1,TRUE)",
    expected: {
      type: "number",
      value: 0.5132987982791487,
    },
    tolerance: 3e-11,
  },
  {
    name: "gamma-grid-1000",
    formula: "GAMMADIST(1000,1000,1,TRUE)",
    expected: {
      type: "number",
      value: 0.5042052441802155,
    },
    tolerance: 3e-11,
  },
  {
    name: "gamma-grid-10000",
    formula: "GAMMADIST(10000,10000,1,TRUE)",
    expected: {
      type: "number",
      value: 0.5013298083399552,
    },
    tolerance: 3e-11,
  },
  {
    name: "t-grid-1-1e-06",
    formula: "TDIST(1e-06,1,2)",
    expected: {
      type: "number",
      value: 0.9999993633802277,
    },
    tolerance: 2e-11,
  },
  {
    name: "t-grid-1-1",
    formula: "TDIST(1,1,2)",
    expected: {
      type: "number",
      value: 0.5000000000000001,
    },
    tolerance: 2e-11,
  },
  {
    name: "t-grid-1-20",
    formula: "TDIST(20,1,2)",
    expected: {
      type: "number",
      value: 0.03180450251235275,
    },
    tolerance: 2e-11,
  },
  {
    name: "t-grid-2-1e-06",
    formula: "TDIST(1e-06,2,2)",
    expected: {
      type: "number",
      value: 0.9999992928932188,
    },
    tolerance: 2e-11,
  },
  {
    name: "t-grid-2-1",
    formula: "TDIST(1,2,2)",
    expected: {
      type: "number",
      value: 0.4226497308103742,
    },
    tolerance: 2e-11,
  },
  {
    name: "t-grid-2-20",
    formula: "TDIST(20,2,2)",
    expected: {
      type: "number",
      value: 0.002490663892367097,
    },
    tolerance: 2e-11,
  },
  {
    name: "t-grid-10-1e-06",
    formula: "TDIST(1e-06,10,2)",
    expected: {
      type: "number",
      value: 0.9999992217832321,
    },
    tolerance: 2e-11,
  },
  {
    name: "t-grid-10-1",
    formula: "TDIST(1,10,2)",
    expected: {
      type: "number",
      value: 0.34089313230206,
    },
    tolerance: 2e-11,
  },
  {
    name: "t-grid-10-20",
    formula: "TDIST(20,10,2)",
    expected: {
      type: "number",
      value: 2.1460623172042523e-9,
    },
    tolerance: 2e-11,
  },
  {
    name: "t-grid-10000-1e-06",
    formula: "TDIST(1e-06,10000,2)",
    expected: {
      type: "number",
      value: 0.9999992021353861,
    },
    tolerance: 2e-11,
  },
  {
    name: "t-grid-10000-1",
    formula: "TDIST(1,10000,2)",
    expected: {
      type: "number",
      value: 0.31733470433042915,
    },
    tolerance: 2e-11,
  },
  {
    name: "t-grid-10000-20",
    formula: "TDIST(20,10000,2)",
    expected: {
      type: "number",
      value: 2.7646525865406702e-87,
    },
    tolerance: 2e-11,
  },
  {
    name: "excel-16.114.4-endpoint-1",
    formula: "BETAINV(0,2,5)",
    expected: {
      type: "error",
      value: "#NUM!",
    },
    oracle: "excel",
  },
  {
    name: "excel-16.114.4-endpoint-2",
    formula: "CRITBINOM(10,0,.5)",
    expected: {
      type: "error",
      value: "#NUM!",
    },
    oracle: "excel",
  },
  {
    name: "excel-16.114.4-endpoint-3",
    formula: "CRITBINOM(10,.5,0)",
    expected: {
      type: "error",
      value: "#NUM!",
    },
    oracle: "excel",
  },
  {
    name: "excel-16.114.4-endpoint-4",
    formula: "GAMMAINV(1,2,1)",
    expected: {
      type: "error",
      value: "#NUM!",
    },
    oracle: "excel",
  },
  {
    name: "excel-16.114.4-endpoint-5",
    formula: "CHIINV(0,2)",
    expected: {
      type: "error",
      value: "#NUM!",
    },
    oracle: "excel",
  },
  {
    name: "excel-16.114.4-endpoint-6",
    formula: "POISSON(0,0,FALSE)",
    expected: {
      type: "number",
      value: 1,
    },
    oracle: "excel",
  },
  {
    name: "excel-16.114.4-endpoint-7",
    formula: "GAMMADIST(0,.5,1,FALSE)",
    expected: {
      type: "error",
      value: "#NUM!",
    },
    oracle: "excel",
  },
  {
    name: "excel-16.114.4-endpoint-8",
    formula: "WEIBULL(0,.5,1,FALSE)",
    expected: {
      type: "number",
      value: 0,
    },
    oracle: "excel",
  },
  {
    name: "normal-array-reference",
    formula: "NORMSDIST(Inputs!A1:A3)",
    expected: [
      [
        {
          type: "number",
          value: 0.5,
        },
      ],
      [
        {
          type: "number",
          value: 0.8413447460685429,
        },
      ],
      [
        {
          type: "error",
          value: "#VALUE!",
        },
      ],
    ],
    cells: {
      A1: {
        type: "number",
        value: 0,
      },
      A2: {
        type: "number",
        value: 1,
      },
      A3: {
        type: "string",
        value: "bad",
      },
    },
    tolerance: 1e-12,
  },
  {
    name: "ceiling-array-reference",
    formula: "CEILING(Inputs!A1:A3,2)",
    expected: [
      [
        {
          type: "number",
          value: 2,
        },
      ],
      [
        {
          type: "number",
          value: 4,
        },
      ],
      [
        {
          type: "number",
          value: -2,
        },
      ],
    ],
    cells: {
      A1: {
        type: "number",
        value: 1,
      },
      A2: {
        type: "number",
        value: 3,
      },
      A3: {
        type: "number",
        value: -3,
      },
    },
  },
];
