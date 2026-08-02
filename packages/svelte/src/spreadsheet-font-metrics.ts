import type { SpreadsheetFont } from "@tumbler/sheets";

/** ECMA-376 column geometry uses the widest decimal digit in the Normal style font. */
export function measureMaximumDigitWidth(
  measureText: (text: string) => number,
  fallback = 7,
): number {
  const widths = Array.from({ length: 10 }, (_, digit) => measureText(String(digit)));
  const maximum = Math.max(...widths);
  return Number.isFinite(maximum) && maximum > 0 ? Math.max(1, Math.round(maximum)) : fallback;
}

export function spreadsheetFontShorthand(font: SpreadsheetFont, name: string): string {
  const style = font.italic ? "italic " : "";
  const weight = font.bold ? "700 " : "400 ";
  const size = font.size ?? 11;
  return `${style}${weight}${size}pt ${quoteCssString(name)}`;
}

function quoteCssString(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}
