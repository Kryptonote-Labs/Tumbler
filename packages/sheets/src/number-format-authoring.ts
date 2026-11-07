import type { FormattingValue } from "@tumblerjs/core";
import type { OpcPackage } from "@tumblerjs/opc";
import { combine, restyleSpreadsheetTarget, spreadsheetLogicalFormats, type SpreadsheetFormattingTarget } from "./formatting.ts";
import { BUILT_IN_NUMBER_FORMATS } from "./number-format.ts";
import type { SpreadsheetStyleTransform } from "./style-planner.ts";
import type { SpreadsheetCellFormat } from "./styles.ts";
import type { SpreadsheetWorksheet } from "./worksheet.ts";
import { SpreadsheetError, type SpreadsheetSheet, type SpreadsheetWorkbook } from "./workbook.ts";

/** Excel number-format codes behind the ribbon presets. Built-in ids are written without a numFmt record. */
export const SPREADSHEET_NUMBER_FORMAT_PRESETS = Object.freeze({
  general: "General",
  number: "0.00",
  integer: "0",
  currency: '"$"#,##0.00_);("$"#,##0.00)',
  accounting: '_("$"* #,##0.00_);_("$"* \\(#,##0.00\\);_("$"* "-"??_);_(@_)',
  percent: "0.00%",
  "short-date": "mm-dd-yy",
  "long-date": "dddd, mmmm d, yyyy",
  time: "h:mm:ss AM/PM",
  fraction: "# ?/?",
  scientific: "0.00E+00",
  text: "@",
} as const);

export type SpreadsheetNumberFormatPreset = keyof typeof SPREADSHEET_NUMBER_FORMAT_PRESETS;

/** A preset name, the legacy `date` alias for `short-date`, or an explicit format code. */
export type SpreadsheetNumberFormatInput = SpreadsheetNumberFormatPreset | "date" | { readonly code: string };

export type SpreadsheetNumberFormatCategory =
  | "general" | "number" | "currency" | "accounting" | "percent" | "date" | "time"
  | "fraction" | "scientific" | "text" | "custom";

export interface SpreadsheetNumberFormat {
  /** The complete Excel format code. */
  readonly code: string;
  /** The preset whose code matches exactly, if any. */
  readonly preset: SpreadsheetNumberFormatPreset | undefined;
  readonly category: SpreadsheetNumberFormatCategory;
  /** Decimal places of the first section; undefined when decimals do not apply. */
  readonly decimals: number | undefined;
}

const DECIMAL_CATEGORIES = new Set<SpreadsheetNumberFormatCategory>(["number", "currency", "accounting", "percent", "scientific", "custom"]);

export type SpreadsheetDecimalDirection = "increase" | "decrease";

/** Excel limits a number-format code to 255 characters. */
const MAX_FORMAT_CODE_LENGTH = 255;

/** Effective number format across logical cells, reporting `mixed` when codes differ. */
export function spreadsheetNumberFormatState(
  worksheet: SpreadsheetWorksheet,
  target: SpreadsheetFormattingTarget,
): FormattingValue<SpreadsheetNumberFormat> {
  return combine(spreadsheetLogicalFormats(worksheet, target).map((format) => describeSpreadsheetNumberFormat(numberFormatCode(format))));
}

/** Classifies a format code so a UI can map selection state to its presets. */
export function describeSpreadsheetNumberFormat(code: string): SpreadsheetNumberFormat {
  const preset = (Object.keys(SPREADSHEET_NUMBER_FORMAT_PRESETS) as SpreadsheetNumberFormatPreset[])
    .find((name) => SPREADSHEET_NUMBER_FORMAT_PRESETS[name] === code);
  const section = sectionsOf(code)[0] ?? [];
  const category = categorize(code, section);
  const placeholders = numericPart(section);
  return Object.freeze({
    code,
    preset,
    category,
    decimals: placeholders === undefined || !DECIMAL_CATEGORIES.has(category) ? undefined : placeholders.decimals,
  });
}

/** Assigns a preset or explicit format code while preserving every other style property. */
export function formatSpreadsheetNumbersPackage(
  workbook: SpreadsheetWorkbook,
  sheet: SpreadsheetSheet,
  target: SpreadsheetFormattingTarget,
  format: SpreadsheetNumberFormatInput,
): OpcPackage {
  const code = typeof format === "string" ? SPREADSHEET_NUMBER_FORMAT_PRESETS[format === "date" ? "short-date" : format] : validateCode(format.code);
  return restyleSpreadsheetTarget(workbook, sheet, target, (base) => withCode(base, code));
}

/**
 * Adds or removes one decimal place from each cell's current format, keeping
 * currency, percent, negative sections and quoted literals. Text, date, time
 * and fraction formats are left unchanged, as in Excel.
 */
export function adjustSpreadsheetNumberDecimalsPackage(
  workbook: SpreadsheetWorkbook,
  sheet: SpreadsheetSheet,
  target: SpreadsheetFormattingTarget,
  direction: SpreadsheetDecimalDirection,
): OpcPackage {
  const transform: SpreadsheetStyleTransform = (base) => withCode(base, adjustSpreadsheetNumberFormatDecimals(numberFormatCode(base), direction));
  return restyleSpreadsheetTarget(workbook, sheet, target, transform);
}

/** Returns the code with one more or one fewer decimal place, or throws when the code has no numeric section to adjust. */
export function adjustSpreadsheetNumberFormatDecimals(code: string, direction: SpreadsheetDecimalDirection): string {
  if (code.toLowerCase() === "general") return direction === "increase" ? "0.0" : "0";
  const sections = sectionsOf(code);
  const category = categorize(code, sections[0] ?? []);
  if (category === "text" || category === "date" || category === "time" || category === "fraction") return code;
  if (sections.some((section) => section.some((token) => token.kind === "general"))) {
    throw new SpreadsheetError("unsupported_number_format", `Cannot change decimal places of ${JSON.stringify(code)}.`);
  }
  let adjusted = false;
  const result = sections.map((section) => {
    const next = adjustSection(section, direction);
    if (next !== undefined) adjusted = true;
    return (next ?? section).map((token) => token.text).join("");
  }).join(";");
  if (!adjusted) throw new SpreadsheetError("unsupported_number_format", `Cannot change decimal places of ${JSON.stringify(code)}.`);
  return validateCode(result);
}

function withCode(format: SpreadsheetCellFormat, code: string): SpreadsheetCellFormat {
  return Object.freeze({ ...format, numberFormatCode: code });
}

function numberFormatCode(format: SpreadsheetCellFormat): string {
  return format.numberFormatCode ?? BUILT_IN_NUMBER_FORMATS.get(format.numberFormatId) ?? "General";
}

function validateCode(code: string): string {
  if (code.length === 0 || code.length > MAX_FORMAT_CODE_LENGTH) {
    throw new RangeError(`Number format codes must contain between 1 and ${MAX_FORMAT_CODE_LENGTH} characters.`);
  }
  return code;
}

type Token = {
  /** `digit` is 0, # or ?; `literal` covers quoted, escaped, bracketed and spacing text. */
  readonly kind: "digit" | "point" | "exponent" | "fraction" | "percent" | "text" | "date" | "general" | "literal" | "other";
  readonly text: string;
};

function sectionsOf(code: string): Token[][] {
  const sections: Token[][] = [[]];
  for (let index = 0; index < code.length;) {
    const character = code[index]!;
    const rest = code.slice(index);
    const push = (kind: Token["kind"], text: string) => {
      sections.at(-1)!.push({ kind, text });
      index += text.length;
    };
    if (character === ";") { sections.push([]); index += 1; continue; }
    if (character === '"') { const end = code.indexOf('"', index + 1); push("literal", code.slice(index, end < 0 ? code.length : end + 1)); continue; }
    if (character === "\\" || character === "_" || character === "*") { push("literal", code.slice(index, index + 2)); continue; }
    if (character === "[") {
      const end = code.indexOf("]", index);
      const text = code.slice(index, end < 0 ? code.length : end + 1);
      push(/^\[(h+|m+|s+)\]$/i.test(text) ? "date" : "literal", text);
      continue;
    }
    if (/^general/i.test(rest)) { push("general", rest.slice(0, 7)); continue; }
    if (/^(AM\/PM|A\/P)/i.test(rest)) { push("date", /^(AM\/PM|A\/P)/i.exec(rest)![0]); continue; }
    if (/^[eE][+-]/.test(rest)) { push("exponent", rest.slice(0, 2)); continue; }
    if ("0#?".includes(character)) { push("digit", character); continue; }
    if (character === ".") { push("point", character); continue; }
    if (character === "/") { push("fraction", character); continue; }
    if (character === "%") { push("percent", character); continue; }
    if (character === "@") { push("text", character); continue; }
    if ("yYmMdDhHsSbBgGe".includes(character)) { push("date", character); continue; }
    push("other", character);
  }
  return sections;
}

function categorize(code: string, section: readonly Token[]): SpreadsheetNumberFormatCategory {
  if (code.toLowerCase() === "general") return "general";
  const kinds = new Set(section.map((token) => token.kind));
  if (kinds.has("date")) {
    const dateParts = section.filter((token) => token.kind === "date").map((token) => token.text.toLowerCase());
    return dateParts.some((part) => /^[yd]/.test(part)) || !dateParts.some((part) => /^[hs\[]|am\/pm|a\/p/.test(part)) ? "date" : "time";
  }
  if (!kinds.has("digit")) return kinds.has("text") ? "text" : kinds.has("general") ? "general" : "custom";
  if (kinds.has("exponent")) return "scientific";
  if (kinds.has("fraction")) return "fraction";
  if (kinds.has("percent")) return "percent";
  const literal = section.filter((token) => token.kind === "literal" || token.kind === "other").map((token) => token.text).join("");
  const currency = /[$€£¥₩₹]|\[\$[^\]]+\]/.test(literal);
  if (currency && section.some((token) => token.text.startsWith("*"))) return "accounting";
  return currency ? "currency" : "number";
}

/** Locates the mantissa: integer digits, an optional point and its decimals. */
function numericPart(section: readonly Token[]): { readonly lastInteger: number; readonly point: number | undefined; readonly decimals: number; readonly lastDecimal: number | undefined } | undefined {
  const exponent = section.findIndex((token) => token.kind === "exponent");
  const end = exponent < 0 ? section.length : exponent;
  let lastInteger = -1;
  let point: number | undefined;
  let decimals = 0;
  let lastDecimal: number | undefined;
  for (let index = 0; index < end; index += 1) {
    const token = section[index]!;
    if (token.kind === "point" && point === undefined && lastInteger >= 0) point = index;
    else if (token.kind === "digit" && point === undefined) lastInteger = index;
    else if (token.kind === "digit") { decimals += 1; lastDecimal = index; }
  }
  return lastInteger < 0 && lastDecimal === undefined ? undefined : { lastInteger, point, decimals, lastDecimal };
}

function adjustSection(section: readonly Token[], direction: SpreadsheetDecimalDirection): Token[] | undefined {
  const numeric = numericPart(section);
  if (numeric === undefined) return undefined;
  const tokens = [...section];
  const digit = (text: string): Token => ({ kind: "digit", text });
  if (direction === "increase") {
    if (numeric.point === undefined) {
      // Accounting zero sections use ?? as decimal alignment rather than a point.
      if (section.every((token) => token.kind !== "digit" || token.text === "?")) tokens.splice(numeric.lastInteger + 1, 0, digit("?"));
      else tokens.splice(numeric.lastInteger + 1, 0, { kind: "point", text: "." }, digit("0"));
    } else tokens.splice((numeric.lastDecimal ?? numeric.point) + 1, 0, digit("0"));
    return tokens;
  }
  if (numeric.point === undefined) {
    const questionMarks = section.every((token) => token.kind !== "digit" || token.text === "?");
    if (!questionMarks || numeric.lastInteger < 0 || section.filter((token) => token.kind === "digit").length <= 0) return tokens;
    tokens.splice(numeric.lastInteger, 1);
    return tokens;
  }
  if (numeric.lastDecimal === undefined) {
    tokens.splice(numeric.point, 1);
    return tokens;
  }
  tokens.splice(numeric.lastDecimal, 1);
  return numeric.decimals === 1 ? tokens.filter((_, index) => index !== numeric.point) : tokens;
}
