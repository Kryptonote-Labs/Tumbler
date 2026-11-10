import type { FormulaFunctionCategory } from "./function-catalog.ts";

/**
 * Functions the evaluator implements directly, with their spreadsheet category.
 * The evaluator's handler map is keyed by these names, so it cannot register a
 * core function without cataloguing it.
 */
export const coreFunctionCategories = {
  IF: "logical", IFERROR: "logical", IFNA: "logical", IFS: "logical", SWITCH: "logical",
  AND: "logical", OR: "logical", XOR: "logical", NOT: "logical",
  COUNTIF: "statistical", COUNTIFS: "statistical", AVERAGEIF: "statistical", AVERAGEIFS: "statistical",
  COUNT: "statistical", COUNTA: "statistical", COUNTBLANK: "statistical", AVERAGE: "statistical",
  MIN: "statistical", MAX: "statistical", MEDIAN: "statistical",
  "STDEV.S": "statistical", "STDEV.P": "statistical", "VAR.S": "statistical", "VAR.P": "statistical",
  SUM: "math", SUMIF: "math", SUMIFS: "math", SUMPRODUCT: "math", PRODUCT: "math",
  ABS: "math", INT: "math", MOD: "math", ROUND: "math", ROUNDUP: "math", ROUNDDOWN: "math",
  "CEILING.MATH": "math", "FLOOR.MATH": "math", SUBTOTAL: "math", AGGREGATE: "math",
  ISBLANK: "information", ISNUMBER: "information", ISTEXT: "information", ISLOGICAL: "information",
  ISERROR: "information", ISERR: "information", ISNA: "information",
  LEN: "text", LEFT: "text", RIGHT: "text", MID: "text", TRIM: "text", UPPER: "text", LOWER: "text",
  PROPER: "text", SUBSTITUTE: "text", FIND: "text", SEARCH: "text", EXACT: "text",
  CONCAT: "text", CONCATENATE: "text", TEXTJOIN: "text",
  DATE: "date-time", DATEVALUE: "date-time", YEAR: "date-time", MONTH: "date-time", DAY: "date-time",
  DAYS: "date-time", EDATE: "date-time", EOMONTH: "date-time", WEEKDAY: "date-time",
  NETWORKDAYS: "date-time", WORKDAY: "date-time",
  CHOOSE: "lookup", INDEX: "lookup", MATCH: "lookup", XMATCH: "lookup", XLOOKUP: "lookup",
  VLOOKUP: "lookup", HLOOKUP: "lookup",
} as const satisfies Readonly<Record<string, FormulaFunctionCategory>>;

export type CoreFunctionName = keyof typeof coreFunctionCategories;
