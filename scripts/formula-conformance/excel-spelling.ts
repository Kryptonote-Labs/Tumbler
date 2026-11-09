import { parseFormula, tokenizeFormula, type FormulaExpression } from "../../packages/formulas/src/index.ts";

// MS-XLSX 2.2.3, plus subsequently documented Microsoft 365 functions.
// https://learn.microsoft.com/en-us/openspecs/office_standards/ms-xlsx/5d1b6d44-6fc1-4ecd-8fef-0b27406cc2bf
const futureNames = [
  "_xlfn.ACOT",
  "_xlfn.ACOTH",
  "_xlfn.AGGREGATE",
  "_xlfn.ARABIC",
  "_xlfn.BASE",
  "_xlfn.BETA.DIST",
  "_xlfn.BETA.INV",
  "_xlfn.BINOM.DIST",
  "_xlfn.BINOM.DIST.RANGE",
  "_xlfn.BINOM.INV",
  "_xlfn.BITAND",
  "_xlfn.BITLSHIFT",
  "_xlfn.BITOR",
  "_xlfn.BITRSHIFT",
  "_xlfn.BITXOR",
  "_xlfn.BYCOL",
  "_xlfn.BYROW",
  "_xlfn.CEILING.MATH",
  "_xlfn.CEILING.PRECISE",
  "_xlfn.CHISQ.DIST",
  "_xlfn.CHISQ.DIST.RT",
  "_xlfn.CHISQ.INV",
  "_xlfn.CHISQ.INV.RT",
  "_xlfn.CHISQ.TEST",
  "_xlfn.CHOOSECOLS",
  "_xlfn.CHOOSEROWS",
  "_xlfn.COMBINA",
  "_xlfn.CONCAT",
  "_xlfn.CONFIDENCE.NORM",
  "_xlfn.CONFIDENCE.T",
  "_xlfn.COT",
  "_xlfn.COTH",
  "_xlfn.COVARIANCE.P",
  "_xlfn.COVARIANCE.S",
  "_xlfn.CSC",
  "_xlfn.CSCH",
  "_xlfn.DAYS",
  "_xlfn.DECIMAL",
  "_xlfn.DETECTLANGUAGE",
  "_xlfn.DROP",
  "_xlfn.ERF.PRECISE",
  "_xlfn.ERFC.PRECISE",
  "_xlfn.EXPAND",
  "_xlfn.EXPON.DIST",
  "_xlfn.F.DIST",
  "_xlfn.F.DIST.RT",
  "_xlfn.F.INV",
  "_xlfn.F.INV.RT",
  "_xlfn.F.TEST",
  "_xlfn.FIELDVALUE",
  "_xlfn.FILTERXML",
  "_xlfn.FLOOR.MATH",
  "_xlfn.FLOOR.PRECISE",
  "_xlfn.FORECAST.ETS",
  "_xlfn.FORECAST.ETS.CONFINT",
  "_xlfn.FORECAST.ETS.SEASONALITY",
  "_xlfn.FORECAST.ETS.STAT",
  "_xlfn.FORECAST.LINEAR",
  "_xlfn.FORMULATEXT",
  "_xlfn.GAMMA",
  "_xlfn.GAMMA.DIST",
  "_xlfn.GAMMA.INV",
  "_xlfn.GAMMALN.PRECISE",
  "_xlfn.GAUSS",
  "_xlfn.GROUPBY",
  "_xlfn.HSTACK",
  "_xlfn.HYPGEOM.DIST",
  "_xlfn.IFNA",
  "_xlfn.IFS",
  "_xlfn.IMAGE",
  "_xlfn.IMCOSH",
  "_xlfn.IMCOT",
  "_xlfn.IMCSC",
  "_xlfn.IMCSCH",
  "_xlfn.IMSEC",
  "_xlfn.IMSECH",
  "_xlfn.IMSINH",
  "_xlfn.IMTAN",
  "_xlfn.ISFORMULA",
  "_xlfn.ISOMITTED",
  "_xlfn.ISOWEEKNUM",
  "_xlfn.LAMBDA",
  "_xlfn.LET",
  "_xlfn.LOGNORM.DIST",
  "_xlfn.LOGNORM.INV",
  "_xlfn.MAKEARRAY",
  "_xlfn.MAP",
  "_xlfn.MAXIFS",
  "_xlfn.MINIFS",
  "_xlfn.MODE.MULT",
  "_xlfn.MODE.SNGL",
  "_xlfn.MUNIT",
  "_xlfn.NEGBINOM.DIST",
  "_xlfn.NORM.DIST",
  "_xlfn.NORM.INV",
  "_xlfn.NORM.S.DIST",
  "_xlfn.NORM.S.INV",
  "_xlfn.NUMBERVALUE",
  "_xlfn.PDURATION",
  "_xlfn.PERCENTILE.EXC",
  "_xlfn.PERCENTILE.INC",
  "_xlfn.PERCENTOF",
  "_xlfn.PERCENTRANK.EXC",
  "_xlfn.PERCENTRANK.INC",
  "_xlfn.PERMUTATIONA",
  "_xlfn.PHI",
  "_xlfn.PIVOTBY",
  "_xlfn.POISSON.DIST",
  "_xlfn.PQSOURCE",
  "_xlfn.PYTHON_STR",
  "_xlfn.PYTHON_TYPE",
  "_xlfn.PYTHON_TYPENAME",
  "_xlfn.QUARTILE.EXC",
  "_xlfn.QUARTILE.INC",
  "_xlfn.QUERYSTRING",
  "_xlfn.RANDARRAY",
  "_xlfn.RANK.AVG",
  "_xlfn.RANK.EQ",
  "_xlfn.REDUCE",
  "_xlfn.REGEXEXTRACT",
  "_xlfn.REGEXREPLACE",
  "_xlfn.REGEXTEST",
  "_xlfn.RRI",
  "_xlfn.SCAN",
  "_xlfn.SEC",
  "_xlfn.SECH",
  "_xlfn.SEQUENCE",
  "_xlfn.SHEET",
  "_xlfn.SHEETS",
  "_xlfn.SKEW.P",
  "_xlfn.SORTBY",
  "_xlfn.STDEV.P",
  "_xlfn.STDEV.S",
  "_xlfn.SWITCH",
  "_xlfn.T.DIST",
  "_xlfn.T.DIST.2T",
  "_xlfn.T.DIST.RT",
  "_xlfn.T.INV",
  "_xlfn.T.INV.2T",
  "_xlfn.T.TEST",
  "_xlfn.TAKE",
  "_xlfn.TEXTAFTER",
  "_xlfn.TEXTBEFORE",
  "_xlfn.TEXTJOIN",
  "_xlfn.TEXTSPLIT",
  "_xlfn.TOCOL",
  "_xlfn.TOROW",
  "_xlfn.TRANSLATE",
  "_xlfn.TRIMRANGE",
  "_xlfn.UNICHAR",
  "_xlfn.UNICODE",
  "_xlfn.UNIQUE",
  "_xlfn.VAR.P",
  "_xlfn.VAR.S",
  "_xlfn.VSTACK",
  "_xlfn.WEBSERVICE",
  "_xlfn.WEIBULL.DIST",
  "_xlfn.WRAPCOLS",
  "_xlfn.WRAPROWS",
  "_xlfn.XLOOKUP",
  "_xlfn.XMATCH",
  "_xlfn.XOR",
  "_xlfn.Z.TEST",
  "_xlfn._xlws.FILTER",
  "_xlfn._xlws.PY",
  "_xlfn._xlws.SORT"
] as const;
const spellings = new Map(futureNames.map(name => [name.replace(/^_xlfn\.(?:_xlws\.)?/, ""), name]));

/** OOXML future-function spellings; never rewrite quoted formula text. */
export function nativeExcelFormula(formula: string): string {
  const tokens = tokenizeFormula(formula);
  const replacements = new Map<number, { start: number; end: number; value: string }>();
  for (const [index, token] of tokens.entries()) {
    const next = tokens[index + 1];
    if (token.kind !== "identifier" || next?.kind !== "symbol" || next.value !== "(") continue;
    const value = spellings.get(token.value.toUpperCase());
    if (value) replacements.set(token.start, { start: token.start, end: token.end, value });
  }
  const key = (name: string) => name.toUpperCase().replace(/^_XLPM\./, "");
  const mark = (node: FormulaExpression, name: string) => {
    const token = tokens.find(token => token.start >= node.start && token.end <= node.end && token.kind === "identifier" && token.value.toUpperCase() === name.toUpperCase());
    if (token && !/^_xlpm\./i.test(name)) replacements.set(token.start, { start: token.start, end: token.end, value: `_xlpm.${formula.slice(token.start, token.end)}` });
  };
  const walk = (node: FormulaExpression, scope: ReadonlySet<string>): void => {
    switch (node.kind) {
      case "name": if (scope.has(key(node.name))) mark(node, node.name); return;
      case "function": {
        if (scope.has(key(node.name))) mark(node, node.name);
        const name = node.name.toUpperCase().replace(/^_XLFN\./, "");
        if (name === "LAMBDA") {
          const child = new Set(scope);
          for (const arg of node.arguments.slice(0, -1)) if (arg.kind === "name") { mark(arg, arg.name); child.add(key(arg.name)); }
          const body = node.arguments.at(-1);
          if (body) walk(body, child);
        } else if (name === "LET") {
          const child = new Set(scope);
          for (let i = 0; i + 1 < node.arguments.length; i += 2) {
            const parameter = node.arguments[i]!;
            walk(node.arguments[i + 1]!, child);
            if (parameter.kind === "name") { mark(parameter, parameter.name); child.add(key(parameter.name)); }
          }
          const body = node.arguments.at(-1);
          if (body) walk(body, child);
        } else node.arguments.forEach(arg => walk(arg, scope));
        return;
      }
      case "invoke": walk(node.callee, scope); node.arguments.forEach(arg => walk(arg, scope)); return;
      case "array": node.rows.forEach(row => row.forEach(value => walk(value, scope))); return;
      case "unary": case "percent": case "intersection": case "spill": walk(node.operand, scope); return;
      case "binary": walk(node.left, scope); walk(node.right, scope); return;
      default: return;
    }
  };
  walk(parseFormula(formula).expression, new Set());
  for (const replacement of [...replacements.values()].sort((a, b) => b.start - a.start)) formula = formula.slice(0, replacement.start) + replacement.value + formula.slice(replacement.end);
  return formula;
}
