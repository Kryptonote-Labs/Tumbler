import type { ChartColor } from "@tumblerjs/charts";
import type { ThemeColorSlot } from "@tumblerjs/ooxml";
import type { SpreadsheetStyles } from "./styles.ts";

/** Resolves the chart color subset through the workbook's DrawingML theme. */
export function resolveSpreadsheetChartColor(styles: SpreadsheetStyles, color: ChartColor): string | undefined {
  if (color.kind === "rgb") return color.value;
  const slot = themeSlot(color.value);
  const rgb = slot === undefined ? undefined : styles.theme?.color(slot);
  return rgb === undefined ? undefined : `#${rgb}`;
}

function themeSlot(value: string): ThemeColorSlot | undefined {
  switch (value) {
    case "lt1": case "dk1": case "lt2": case "dk2":
    case "accent1": case "accent2": case "accent3": case "accent4": case "accent5": case "accent6":
    case "hlink": case "folHlink": return value;
    case "bg1": return "lt1";
    case "tx1": return "dk1";
    case "bg2": return "lt2";
    case "tx2": return "dk2";
    default: return undefined;
  }
}
