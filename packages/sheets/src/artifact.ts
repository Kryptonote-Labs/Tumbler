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
    return this.editCellOnSheet(this.activeSheet, reference, value);
  }

  /** Edits a worksheet without changing the sheet currently presented by the host. */
  editCellOnSheet(sheet: SpreadsheetSheet | number | string, reference: string, value: EditableCellValue): SpreadsheetArtifact {
    const target = this.#resolveSheet(sheet);
    const saved = beginSpreadsheetEdit(this.workbook).setCellValue(target, reference, value).commit();
    if (saved === this.bytes()) return this;
    return openSpreadsheetArtifact(saved, { sheet: this.activeSheet.name });
  }

  editFormula(reference: string, formula: string): SpreadsheetArtifact {
    return this.editFormulaOnSheet(this.activeSheet, reference, formula);
  }

  /** Writes a formula to its original target sheet while reference picking may display another sheet. */
  editFormulaOnSheet(sheet: SpreadsheetSheet | number | string, reference: string, formula: string): SpreadsheetArtifact {
    const target = this.#resolveSheet(sheet);
    const saved = beginSpreadsheetEdit(this.workbook).setCellFormula(target, reference, formula).commit();
    if (saved === this.bytes()) return this;
    return openSpreadsheetArtifact(saved, { sheet: this.activeSheet.name });
  }

  replace(bytes: Uint8Array): SpreadsheetArtifact {
    return openSpreadsheetArtifact(bytes, { sheet: this.activeSheet.name });
  }

  #resolveSheet(identifier: SpreadsheetSheet | number | string): SpreadsheetSheet {
    const sheet = typeof identifier === "object" ? identifier : this.workbook.sheet(identifier);
    if (sheet === undefined || !this.workbook.sheets.includes(sheet)) {
      throw new SpreadsheetError("unsupported_sheet", `Workbook sheet ${JSON.stringify(identifier)} does not exist.`);
    }
    return sheet;
  }
}

export function openSpreadsheetArtifact(bytes: Uint8Array, options: OpenSpreadsheetArtifactOptions = {}): SpreadsheetArtifact {
  const workbook = openSpreadsheet(openOpcPackage(bytes));
  const requested = options.sheet === undefined ? undefined : workbook.sheet(options.sheet);
  const activeSheet = requested ?? workbook.sheets.find((sheet) => sheet.state === "visible") ?? workbook.sheets[0];
  if (activeSheet === undefined) throw new SpreadsheetError("unsupported_sheet", "The workbook contains no ordinary worksheets.");
  return new SpreadsheetArtifact(workbook, activeSheet);
}
