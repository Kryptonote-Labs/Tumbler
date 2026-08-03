import type { LosslessXmlElement } from "@tumblerjs/ooxml";
import { OOXML_NAMESPACES, parseLosslessXml } from "@tumblerjs/ooxml";
import { SpreadsheetError, type SpreadsheetSheet, type SpreadsheetWorkbook } from "./workbook.ts";
import { parseSpreadsheetColor, type SpreadsheetColor } from "./styles.ts";

export interface SpreadsheetSheetProperties {
  readonly tabColor: SpreadsheetColor | undefined;
}

const cache = new WeakMap<SpreadsheetWorkbook, WeakMap<SpreadsheetSheet, SpreadsheetSheetProperties>>();

/** Reads lightweight worksheet presentation metadata without opening its cell model. */
export function readSpreadsheetSheetProperties(
  workbook: SpreadsheetWorkbook,
  sheet: SpreadsheetSheet,
): SpreadsheetSheetProperties {
  if (!workbook.sheets.includes(sheet)) throw new TypeError("The sheet does not belong to this workbook.");
  const cached = cache.get(workbook)?.get(sheet);
  if (cached !== undefined) return cached;
  const namespace = workbook.conformance === "strict"
    ? OOXML_NAMESPACES.strict.spreadsheet
    : OOXML_NAMESPACES.transitional.spreadsheet;
  let root: LosslessXmlElement;
  try {
    root = parseLosslessXml(workbook.readSheet(sheet)).root;
  } catch (cause) {
    throw new SpreadsheetError("invalid_worksheet", `Worksheet ${JSON.stringify(sheet.name)} is not valid XML.`, { cause });
  }
  if (root.namespaceUri !== namespace || root.localName !== "worksheet") {
    throw new SpreadsheetError("invalid_worksheet", "A Worksheet part must have a SpreadsheetML worksheet root element.");
  }
  const sheetProperties = children(root, namespace, "sheetPr");
  if (sheetProperties.length > 1) throw new SpreadsheetError("invalid_worksheet", "A worksheet must not repeat sheetPr.");
  const tabColors = sheetProperties[0] === undefined ? [] : children(sheetProperties[0], namespace, "tabColor");
  if (tabColors.length > 1) throw new SpreadsheetError("invalid_worksheet", "Worksheet properties must not repeat tabColor.");
  const properties = Object.freeze({ tabColor: parseSpreadsheetColor(tabColors[0]) });
  let workbookCache = cache.get(workbook);
  if (workbookCache === undefined) {
    workbookCache = new WeakMap();
    cache.set(workbook, workbookCache);
  }
  workbookCache.set(sheet, properties);
  return properties;
}

function children(element: LosslessXmlElement, namespace: string, localName: string): LosslessXmlElement[] {
  return element.children.filter((child): child is LosslessXmlElement =>
    child.kind === "element" && child.namespaceUri === namespace && child.localName === localName
  );
}
