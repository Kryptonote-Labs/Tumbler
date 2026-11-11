import { formatOoxmlNumber } from '@tumblerjs/ooxml';
import type { SpreadsheetCellValue } from "./worksheet.ts";

export const BUILT_IN_NUMBER_FORMATS: ReadonlyMap<number, string> = new Map([
  [0, "General"], [1, "0"], [2, "0.00"], [3, "#,##0"], [4, "#,##0.00"],
  [5, '"$"#,##0_);("$"#,##0)'], [6, '"$"#,##0_);[Red]("$"#,##0)'],
  [7, '"$"#,##0.00_);("$"#,##0.00)'], [8, '"$"#,##0.00_);[Red]("$"#,##0.00)'],
  [9, "0%"], [10, "0.00%"], [11, "0.00E+00"], [12, "# ?/?"], [13, "# ??/??"],
  [14, "mm-dd-yy"], [15, "d-mmm-yy"], [16, "d-mmm"], [17, "mmm-yy"],
  [18, "h:mm AM/PM"], [19, "h:mm:ss AM/PM"], [20, "h:mm"], [21, "h:mm:ss"],
  [22, "m/d/yy h:mm"], [37, "#,##0 ;(#,##0)"], [38, "#,##0 ;[Red](#,##0)"],
  [39, "#,##0.00;(#,##0.00)"], [40, "#,##0.00;[Red](#,##0.00)"],
  [41, '_(* #,##0_);_(* \\(#,##0\\);_(* "-"_);_(@_)'], [42, '_("$"* #,##0_);_("$"* \\(#,##0\\);_("$"* "-"_);_(@_)'],
  [43, '_(* #,##0.00_);_(* \\(#,##0.00\\);_(* "-"??_);_(@_)'], [44, '_("$"* #,##0.00_);_("$"* \\(#,##0.00\\);_("$"* "-"??_);_(@_)'],
  [49, "@"],
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
  return formatOoxmlNumber(value.value, code, options.dateSystem ?? "1900", options.locale ?? "en-US");
}
