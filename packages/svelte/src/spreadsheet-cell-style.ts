import type { SpreadsheetCellValue, SpreadsheetWorksheet } from "@tumbler/sheets";

export function spreadsheetCellCss(worksheet: SpreadsheetWorksheet, reference: string): string {
  const style = worksheet.cellStyle(reference);
  const declarations: string[] = [];
  const fontName = worksheet.styles.resolveFontName(style.font);
  if (fontName !== undefined) declarations.push(`font-family:${cssValue(fontName)}`);
  if (style.font.size !== undefined) declarations.push(`font-size:${style.font.size}pt`);
  if (style.font.bold) declarations.push("font-weight:700");
  if (style.font.italic) declarations.push("font-style:italic");
  if (style.font.underline !== undefined || style.font.strike) {
    declarations.push(`text-decoration:${[
      style.font.underline === undefined ? "" : "underline",
      style.font.strike ? "line-through" : "",
    ].filter(Boolean).join(" ")}`);
  }
  const foreground = cssColor(worksheet, style.font.color);
  const background = style.fill.patternType === "solid"
    ? cssColor(worksheet, style.fill.foreground)
    : undefined;
  if (foreground !== undefined) declarations.push(`color:${foreground}`);
  if (background !== undefined) declarations.push(`background-color:${background}`);

  const horizontal = alignmentForValue(style.alignment.horizontal, worksheet.cell(reference)?.value);
  declarations.push(`text-align:${textAlignment(horizontal)}`);
  declarations.push(`justify-content:${horizontalPosition(horizontal)}`);
  declarations.push(`align-items:${verticalPosition(style.alignment.vertical)}`);
  if (style.alignment.wrapText) declarations.push("white-space:normal", "overflow-wrap:anywhere");
  if (style.alignment.indent > 0) {
    const side = horizontal === "right" ? "right" : "left";
    declarations.push(`padding-${side}:calc(8px + ${style.alignment.indent * 3}ch)`);
  }
  if (style.alignment.readingOrder === 1) declarations.push("direction:ltr");
  if (style.alignment.readingOrder === 2) declarations.push("direction:rtl");
  for (const side of ["left", "right", "top", "bottom"] as const) {
    const edge = style.border[side];
    if (edge.style !== undefined) {
      declarations.push(`border-${side}:${borderWidth(edge.style)} ${borderStyle(edge.style)} ${cssColor(worksheet, edge.color) ?? "currentColor"}`);
    }
  }
  return declarations.join(";");
}

export function spreadsheetCellContentCss(worksheet: SpreadsheetWorksheet, reference: string): string {
  const rotation = worksheet.cellStyle(reference).alignment.textRotation;
  if (rotation === 255) return "writing-mode:vertical-rl;text-orientation:upright";
  if (rotation === 0) return "";
  const degrees = rotation <= 90 ? -rotation : 180 - rotation;
  return `transform:rotate(${degrees}deg)`;
}

function alignmentForValue(
  horizontal: string | undefined,
  value: SpreadsheetCellValue | undefined,
): string {
  if (horizontal !== undefined && horizontal !== "general") return horizontal;
  if (value?.type === "number" || value?.type === "date") return "right";
  if (value?.type === "boolean" || value?.type === "error") return "center";
  return "left";
}

function horizontalPosition(value: string): string {
  if (value === "center" || value === "centerContinuous") return "center";
  if (value === "right") return "flex-end";
  return "flex-start";
}

function textAlignment(value: string): string {
  if (value === "center" || value === "centerContinuous") return "center";
  if (value === "right") return "right";
  if (value === "justify" || value === "distributed") return "justify";
  return "left";
}

function verticalPosition(value: string | undefined): string {
  if (value === "top") return "flex-start";
  if (value === "center") return "center";
  return "flex-end";
}

function cssColor(
  worksheet: SpreadsheetWorksheet,
  color: ReturnType<SpreadsheetWorksheet["cellStyle"]>["font"]["color"],
): string | undefined {
  const argb = worksheet.styles.resolveColor(color);
  return argb === undefined ? undefined : `#${argb.slice(2)}`;
}

function cssValue(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function borderWidth(value: string): string {
  return value === "medium" || value.startsWith("medium") ? "2px" : value === "thick" || value === "double" ? "3px" : "1px";
}

function borderStyle(value: string): string {
  return value === "double" ? "double" : value.toLowerCase().includes("dash") ? "dashed" : value.toLowerCase().includes("dot") ? "dotted" : "solid";
}
