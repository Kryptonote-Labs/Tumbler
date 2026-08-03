import { openOpcPackage } from "@tumblerjs/opc";
import { beginSpreadsheetEdit, type EditableCellValue } from "./editor.ts";
import { openWorksheet, type SpreadsheetWorksheet } from "./worksheet.ts";
import { openSpreadsheet, SpreadsheetError, type SpreadsheetSheet, type SpreadsheetWorkbook } from "./workbook.ts";
import { calculateSpreadsheetWorksheet, type SpreadsheetCalculationSnapshot } from "./calculation.ts";

export interface OpenSpreadsheetArtifactOptions {
  readonly sheet?: number | string;
}

/** Immutable host boundary for an artefact viewer: bytes, active sheet, edits, and external revisions. */
export class SpreadsheetArtifact {
  readonly workbook: SpreadsheetWorkbook;
  readonly activeSheet: SpreadsheetSheet;
  readonly worksheet: SpreadsheetWorksheet;
  readonly calculation: SpreadsheetCalculationSnapshot;

  constructor(workbook: SpreadsheetWorkbook, activeSheet: SpreadsheetSheet) {
    if (!workbook.sheets.includes(activeSheet)) throw new TypeError("The active sheet does not belong to this workbook.");
    this.workbook = workbook;
    this.activeSheet = activeSheet;
    this.worksheet = openWorksheet(workbook, activeSheet);
    this.calculation = calculateSpreadsheetWorksheet(this.worksheet);
  }

  bytes(): Uint8Array {
    return this.workbook.package.archive.originalBytes();
  }

  selectSheet(identifier: number | string): SpreadsheetArtifact {
    const sheet = this.workbook.sheet(identifier);
    if (sheet === undefined) throw new SpreadsheetError("unsupported_sheet", `Workbook sheet ${JSON.stringify(identifier)} does not exist.`);
    return sheet === this.activeSheet ? this : new SpreadsheetArtifact(this.workbook, sheet);
  }

  editCell(reference: string, value: EditableCellValue): SpreadsheetArtifact {
    const saved = beginSpreadsheetEdit(this.workbook).setCellValue(this.activeSheet, reference, value).commit();
    if (saved === this.bytes()) return this;
    return openSpreadsheetArtifact(saved, { sheet: this.activeSheet.name });
  }

  replace(bytes: Uint8Array): SpreadsheetArtifact {
    return openSpreadsheetArtifact(bytes, { sheet: this.activeSheet.name });
  }
}

export function openSpreadsheetArtifact(bytes: Uint8Array, options: OpenSpreadsheetArtifactOptions = {}): SpreadsheetArtifact {
  const workbook = openSpreadsheet(openOpcPackage(bytes));
  const requested = options.sheet === undefined ? undefined : workbook.sheet(options.sheet);
  const activeSheet = requested ?? workbook.sheets.find((sheet) => sheet.state === "visible") ?? workbook.sheets[0];
  if (activeSheet === undefined) throw new SpreadsheetError("unsupported_sheet", "The workbook contains no ordinary worksheets.");
  return new SpreadsheetArtifact(workbook, activeSheet);
}
