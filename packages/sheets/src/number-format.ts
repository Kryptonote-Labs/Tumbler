import type { SpreadsheetCellValue } from "./worksheet.ts";

export const BUILT_IN_NUMBER_FORMATS: ReadonlyMap<number, string> = new Map([
  [0, "General"], [1, "0"], [2, "0.00"], [3, "#,##0"], [4, "#,##0.00"],
  [9, "0%"], [10, "0.00%"], [11, "0.00E+00"], [12, "# ?/?"], [13, "# ??/??"],
  [14, "mm-dd-yy"], [15, "d-mmm-yy"], [16, "d-mmm"], [17, "mmm-yy"],
  [18, "h:mm AM/PM"], [19, "h:mm:ss AM/PM"], [20, "h:mm"], [21, "h:mm:ss"],
  [22, "m/d/yy h:mm"], [37, "#,##0 ;(#,##0)"], [38, "#,##0 ;[Red](#,##0)"],
  [39, "#,##0.00;(#,##0.00)"], [40, "#,##0.00;[Red](#,##0.00)"], [49, "@"],
]);

export interface SpreadsheetFormatOptions {
  readonly numberFormatId?: number;
  readonly numberFormatCode?: string;
  readonly dateSystem?: "1900" | "1904";
  readonly locale?: string;
}

/** Produces display text while retaining raw cell values in the worksheet model. */
export function formatSpreadsheetCellValue(
  value: SpreadsheetCellValue | undefined,
  options: SpreadsheetFormatOptions = {},
): string {
  if (value === undefined || value.type === "blank") return "";
  if (value.type === "boolean") return value.value ? "TRUE" : "FALSE";
  if (value.type !== "number") return value.value;
  const code = options.numberFormatCode ?? BUILT_IN_NUMBER_FORMATS.get(options.numberFormatId ?? 0) ?? "General";
  return formatNumber(value.value, code, options.dateSystem ?? "1900", options.locale ?? "en-US");
}

function formatNumber(value: number, code: string, dateSystem: "1900" | "1904", locale: string): string {
  if (code.toLowerCase() === "general") return generalNumber(value);
  const sections = splitSections(code);
  const index = value > 0 ? 0 : value < 0 ? Math.min(1, sections.length - 1) : Math.min(2, sections.length - 1);
  const section = sections[index] ?? sections[0] ?? "General";
  if (section === "") return "";
  const normalized = removeDecorators(section);
  if (looksLikeDate(normalized)) return formatSerialDate(value, normalized, dateSystem, locale);
  if (/[eE][+-][0#?]+/.test(normalized)) return formatScientific(value, normalized);
  if (/[0#?]+\s+[0#?]+\/[0#?]+/.test(normalized)) return formatFraction(value, normalized);
  return formatDecimal(value, normalized, locale, index > 0 && sections.length > 1);
}

function formatDecimal(value: number, section: string, locale: string, explicitNegativeSection: boolean): string {
  const percentCount = [...section].filter((character) => character === "%").length;
  const placeholderIndexes = [...section].flatMap((character, index) => /[0#?]/.test(character) ? [index] : []);
  if (placeholderIndexes.length === 0) return literalText(section).replaceAll("@", generalNumber(value));
  const first = placeholderIndexes[0]!;
  const last = placeholderIndexes.at(-1)!;
  const pattern = section.slice(first, last + 1);
  const decimal = pattern.indexOf(".");
  const decimals = decimal < 0 ? "" : pattern.slice(decimal + 1).replace(/[^0#?]/g, "");
  const minimumFractionDigits = [...decimals].filter((digit) => digit === "0").length;
  const maximumFractionDigits = decimals.length;
  const grouping = pattern.slice(0, decimal < 0 ? pattern.length : decimal).includes(",");
  const rawSuffix = section.slice(last + 1);
  const trailingCommas = /^,+/.exec(rawSuffix)?.[0].length ?? 0;
  const magnitude = Math.abs(value) * 100 ** percentCount / 1000 ** trailingCommas;
  const number = new Intl.NumberFormat(locale, {
    useGrouping: grouping,
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(magnitude);
  const prefix = literalText(section.slice(0, first));
  const suffix = literalText(rawSuffix.slice(trailingCommas));
  const sign = value < 0 && !explicitNegativeSection ? "-" : "";
  return `${prefix}${sign}${number}${suffix}`;
}

function formatScientific(value: number, section: string): string {
  const match = /([0#?]+)(?:\.([0#?]+))?[eE]([+-])([0#?]+)/.exec(section);
  if (match === null) return generalNumber(value);
  const decimals = match[2]?.length ?? 0;
  const exponentDigits = match[4]?.length ?? 1;
  const [mantissa = "0", rawExponent = "0"] = Math.abs(value).toExponential(decimals).split("e");
  const exponent = Number(rawExponent);
  const sign = exponent < 0 ? "-" : match[3] === "+" ? "+" : "";
  return `${value < 0 ? "-" : ""}${mantissa}E${sign}${Math.abs(exponent).toString().padStart(exponentDigits, "0")}`;
}

function formatFraction(value: number, section: string): string {
  const match = /([0#?]+)\s+([0#?]+)\/([0#?]+)/.exec(section);
  if (match === null) return generalNumber(value);
  const maximumDenominator = 10 ** (match[3]?.length ?? 1) - 1;
  const absolute = Math.abs(value);
  const whole = Math.floor(absolute);
  const fraction = approximateFraction(absolute - whole, maximumDenominator);
  if (fraction.numerator === 0) return `${value < 0 ? "-" : ""}${whole}`;
  return `${value < 0 ? "-" : ""}${whole === 0 && match[1]?.includes("#") ? "" : `${whole} `}${fraction.numerator}/${fraction.denominator}`;
}

function approximateFraction(value: number, maximumDenominator: number): { numerator: number; denominator: number } {
  let best = { numerator: 0, denominator: 1, error: value };
  for (let denominator = 1; denominator <= maximumDenominator; denominator += 1) {
    const numerator = Math.round(value * denominator);
    const error = Math.abs(value - numerator / denominator);
    if (error < best.error) best = { numerator, denominator, error };
  }
  const divisor = gcd(best.numerator, best.denominator);
  return { numerator: best.numerator / divisor, denominator: best.denominator / divisor };
}

function formatSerialDate(serial: number, section: string, dateSystem: "1900" | "1904", locale: string): string {
  if (serial < 0) return "#".repeat(8);
  const wholeDays = Math.floor(serial);
  const fraction = serial - wholeDays;
  const fakeLeapDay = dateSystem === "1900" && wholeDays === 60;
  const base = dateSystem === "1904" ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 31);
  const adjustedDays = dateSystem === "1900" && wholeDays > 60 ? wholeDays - 1 : wholeDays;
  const date = new Date(base + adjustedDays * 86_400_000 + Math.round(fraction * 86_400_000));
  const parts = {
    year: fakeLeapDay ? 1900 : date.getUTCFullYear(),
    month: fakeLeapDay ? 2 : date.getUTCMonth() + 1,
    day: fakeLeapDay ? 29 : date.getUTCDate(),
    hour: date.getUTCHours(), minute: date.getUTCMinutes(), second: date.getUTCSeconds(), millisecond: date.getUTCMilliseconds(),
  };
  const hasAmPm = /AM\/PM/i.test(section);
  let output = "";
  for (let index = 0; index < section.length;) {
    if (section[index] === '"') {
      const end = section.indexOf('"', index + 1);
      output += section.slice(index + 1, end < 0 ? section.length : end);
      index = end < 0 ? section.length : end + 1;
      continue;
    }
    if (section[index] === "\\" && section[index + 1] !== undefined) {
      output += section[index + 1];
      index += 2;
      continue;
    }
    const remaining = section.slice(index);
    const ampm = /^AM\/PM/i.exec(remaining);
    if (ampm !== null) {
      output += parts.hour < 12 ? "AM" : "PM";
      index += ampm[0].length;
      continue;
    }
    const token = /^(y+|m+|d+|h+|s+)/i.exec(remaining)?.[0];
    if (token !== undefined) {
      const lower = token.toLowerCase();
      const symbol = lower[0]!;
      const minuteToken = symbol === "m" && isMinuteToken(section, index, token.length);
      output += symbol === "y" ? formatYear(parts.year, token.length)
        : symbol === "d" ? formatDay(parts.day, token.length, date, locale, fakeLeapDay)
        : symbol === "m" && !minuteToken ? formatMonth(parts.month, token.length, date, locale)
        : symbol === "m" ? pad(parts.minute, token.length)
        : symbol === "h" ? pad(hasAmPm ? (parts.hour % 12 || 12) : parts.hour, token.length)
        : pad(parts.second, token.length);
      index += token.length;
      continue;
    }
    if (section[index] === "." && /^\.0+/.test(remaining)) {
      const length = /^\.0+/.exec(remaining)![0].length - 1;
      output += `.${parts.millisecond.toString().padStart(3, "0").slice(0, length)}`;
      index += length + 1;
      continue;
    }
    output += section[index];
    index += 1;
  }
  return output;
}

function formatYear(year: number, length: number): string {
  return length <= 2 ? String(year % 100).padStart(2, "0") : String(year).padStart(length, "0");
}

function formatMonth(month: number, length: number, _date: Date, locale: string): string {
  if (length === 1) return String(month);
  if (length === 2) return pad(month, 2);
  const formatted = new Intl.DateTimeFormat(locale, { month: length === 3 ? "short" : "long", timeZone: "UTC" }).format(new Date(Date.UTC(2000, month - 1, 1)));
  return length === 5 ? formatted[0] ?? "" : formatted;
}

function formatDay(day: number, length: number, date: Date, locale: string, fake: boolean): string {
  if (length === 1) return String(day);
  if (length === 2) return pad(day, 2);
  if (fake) return length === 3 ? "Wed" : "Wednesday";
  return new Intl.DateTimeFormat(locale, { weekday: length === 3 ? "short" : "long", timeZone: "UTC" }).format(date);
}

function isMinuteToken(section: string, start: number, length: number): boolean {
  const before = section.slice(0, start).toLowerCase();
  const after = section.slice(start + length).toLowerCase();
  return /h[^a-z]*$/.test(before) || /^[^a-z]*s/.test(after);
}

function splitSections(code: string): string[] {
  const sections: string[] = [];
  let current = "";
  let quoted = false;
  let bracketDepth = 0;
  for (let index = 0; index < code.length; index += 1) {
    const character = code[index]!;
    if (character === '"') quoted = !quoted;
    if (!quoted && character === "[") bracketDepth += 1;
    if (!quoted && character === "]") bracketDepth = Math.max(0, bracketDepth - 1);
    if (!quoted && bracketDepth === 0 && character === ";") {
      sections.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  sections.push(current);
  return sections.slice(0, 4);
}

function removeDecorators(section: string): string {
  return section.replace(/\[(?:Black|Blue|Cyan|Green|Magenta|Red|White|Yellow|Color\d+|[<>=].*?)\]/gi, "").replace(/_.|\*./g, "");
}

function looksLikeDate(section: string): boolean {
  const unquoted = section.replace(/"[^"]*"/g, "").replace(/\\./g, "");
  return /(?:y+|d+|h+|s+|AM\/PM|\[h+\]|\[m+\]|\[s+\])/i.test(unquoted);
}

function literalText(source: string): string {
  return source.replace(/"([^"]*)"/g, "$1").replace(/\\(.)/g, "$1").replace(/_.|\*./g, "").replace(/\[[^\]]+\]/g, "");
}

function generalNumber(value: number): string {
  return Object.is(value, -0) ? "0" : String(value);
}

function pad(value: number, length: number): string {
  return length <= 1 ? String(value) : String(value).padStart(length, "0");
}

function gcd(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) [a, b] = [b, a % b];
  return a || 1;
}
