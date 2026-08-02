import type { LosslessXmlAttribute, LosslessXmlDocument, LosslessXmlElement } from "@tumbler/ooxml";
import { OOXML_NAMESPACES, parseLosslessXml } from "@tumbler/ooxml";
import type { OpcPackage, OpcPart, PartName } from "@tumbler/opc";

const WORKSHEET_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml";
const PROFILES = [
  {
    conformance: "strict",
    spreadsheet: OOXML_NAMESPACES.strict.spreadsheet,
    officeRelationships: "http://purl.oclc.org/ooxml/officeDocument/relationships",
    worksheetRelationship: "http://purl.oclc.org/ooxml/officeDocument/relationships/worksheet",
    calculationChainRelationship: "http://purl.oclc.org/ooxml/officeDocument/relationships/calcChain",
  },
  {
    conformance: "transitional",
    spreadsheet: OOXML_NAMESPACES.transitional.spreadsheet,
    officeRelationships: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    worksheetRelationship: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet",
    calculationChainRelationship: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/calcChain",
  },
] as const;

export type SpreadsheetSheetState = "visible" | "hidden" | "veryHidden";

export interface SpreadsheetSheet {
  readonly name: string;
  readonly sheetId: number;
  readonly relationshipId: string;
  readonly state: SpreadsheetSheetState;
  readonly partName: PartName;
}

export type SpreadsheetCalculationMode = "auto" | "autoNoTable" | "manual";

export interface SpreadsheetCalculationProperties {
  readonly calculationId: number | undefined;
  readonly mode: SpreadsheetCalculationMode | undefined;
  readonly fullCalculationOnLoad: boolean | undefined;
  readonly forceFullCalculation: boolean | undefined;
  readonly calculationChain: {
    readonly relationshipId: string;
    readonly partName: PartName;
  } | undefined;
}

export type SpreadsheetErrorCode =
  | "duplicate_sheet_id"
  | "duplicate_sheet_name"
  | "invalid_calculation"
  | "invalid_cell"
  | "invalid_hyperlink"
  | "invalid_sheet"
  | "invalid_styles"
  | "invalid_table"
  | "invalid_worksheet"
  | "invalid_workbook"
  | "missing_sheet_relationship"
  | "missing_shared_string"
  | "unsupported_document"
  | "unsupported_sheet";

export class SpreadsheetError extends Error {
  readonly code: SpreadsheetErrorCode;

  constructor(code: SpreadsheetErrorCode, message: string, options: { cause?: unknown } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "SpreadsheetError";
    this.code = code;
  }
}

export class SpreadsheetWorkbook {
  readonly package: OpcPackage;
  readonly part: OpcPart;
  readonly document: LosslessXmlDocument;
  readonly conformance: "strict" | "transitional";
  readonly dateSystem: "1900" | "1904";
  readonly calculation: SpreadsheetCalculationProperties;
  readonly sheets: readonly SpreadsheetSheet[];
  readonly #byId: ReadonlyMap<number, SpreadsheetSheet>;
  readonly #byName: ReadonlyMap<string, SpreadsheetSheet>;

  constructor(
    pkg: OpcPackage,
    part: OpcPart,
    document: LosslessXmlDocument,
    conformance: "strict" | "transitional",
    dateSystem: "1900" | "1904",
    calculation: SpreadsheetCalculationProperties,
    sheets: readonly SpreadsheetSheet[],
  ) {
    this.package = pkg;
    this.part = part;
    this.document = document;
    this.conformance = conformance;
    this.dateSystem = dateSystem;
    this.calculation = Object.freeze(calculation);
    this.sheets = Object.freeze([...sheets]);
    this.#byId = new Map(sheets.map((sheet) => [sheet.sheetId, sheet]));
    this.#byName = new Map(sheets.map((sheet) => [sheet.name.toLocaleLowerCase("en-US"), sheet]));
  }

  sheet(identifier: number | string): SpreadsheetSheet | undefined {
    return typeof identifier === "number"
      ? this.#byId.get(identifier)
      : this.#byName.get(identifier.toLocaleLowerCase("en-US"));
  }

  readSheet(sheet: SpreadsheetSheet): Uint8Array {
    if (this.#byId.get(sheet.sheetId) !== sheet) {
      throw new TypeError("The sheet does not belong to this workbook.");
    }
    const part = this.package.getPart(sheet.partName);
    if (part === undefined) {
      throw new SpreadsheetError("missing_sheet_relationship", `Worksheet part ${JSON.stringify(sheet.partName.value)} is missing.`);
    }
    return this.package.readPart(part);
  }
}

export function openSpreadsheet(pkg: OpcPackage): SpreadsheetWorkbook {
  const main = pkg.mainOfficeDocumentPart();
  if (main.family !== "spreadsheet") {
    throw new SpreadsheetError("unsupported_document", "The package is not a SpreadsheetML document.");
  }
  let document: LosslessXmlDocument;
  try {
    document = parseLosslessXml(pkg.readPart(main));
  } catch (cause) {
    throw new SpreadsheetError("invalid_workbook", "The Workbook part is not valid XML.", { cause });
  }
  const profile = PROFILES.find(({ spreadsheet }) =>
    document.root.namespaceUri === spreadsheet && document.root.localName === "workbook"
  );
  if (profile === undefined) {
    throw new SpreadsheetError("invalid_workbook", "The Workbook part must have a SpreadsheetML workbook root element.");
  }

  const sheetsContainers = childElements(document.root, profile.spreadsheet, "sheets");
  if (sheetsContainers.length !== 1) {
    throw new SpreadsheetError("invalid_workbook", "A workbook must contain exactly one sheets collection.");
  }
  const relationships = pkg.relationships(main.name);
  const names = new Set<string>();
  const ids = new Set<number>();
  const sheets = childElements(sheetsContainers[0]!, profile.spreadsheet, "sheet").map((element) => {
    const name = requiredUnqualifiedAttribute(element, "name");
    const rawSheetId = requiredUnqualifiedAttribute(element, "sheetId");
    const relationshipId = requiredQualifiedAttribute(element, profile.officeRelationships, "id");
    const state = optionalUnqualifiedAttribute(element, "state") ?? "visible";
    if (name.length === 0 || !/^(?:0|[1-9][0-9]*)$/.test(rawSheetId)) {
      throw new SpreadsheetError("invalid_sheet", "A sheet must have a non-empty name and an unsigned integer sheetId.");
    }
    const sheetId = Number(rawSheetId);
    if (!Number.isSafeInteger(sheetId) || sheetId > 0xffffffff) {
      throw new SpreadsheetError("invalid_sheet", `Sheet ${JSON.stringify(name)} has an invalid sheetId.`);
    }
    if (state !== "visible" && state !== "hidden" && state !== "veryHidden") {
      throw new SpreadsheetError("invalid_sheet", `Sheet ${JSON.stringify(name)} has an invalid visibility state.`);
    }
    const normalizedName = name.toLocaleLowerCase("en-US");
    if (names.has(normalizedName)) {
      throw new SpreadsheetError("duplicate_sheet_name", `Sheet name ${JSON.stringify(name)} is not unique.`);
    }
    if (ids.has(sheetId)) {
      throw new SpreadsheetError("duplicate_sheet_id", `Sheet id ${sheetId} is not unique.`);
    }
    names.add(normalizedName);
    ids.add(sheetId);

    const relationship = relationships.get(relationshipId);
    if (relationship === undefined || relationship.targetMode !== "Internal") {
      throw new SpreadsheetError("missing_sheet_relationship", `Sheet ${JSON.stringify(name)} does not target an internal worksheet part.`);
    }
    if (relationship.type !== profile.worksheetRelationship) {
      throw new SpreadsheetError("unsupported_sheet", `Sheet ${JSON.stringify(name)} does not target a worksheet relationship.`);
    }
    const part = pkg.getPart(relationship.targetPartName);
    if (part?.contentType !== WORKSHEET_CONTENT_TYPE) {
      throw new SpreadsheetError("unsupported_sheet", `Sheet ${JSON.stringify(name)} targets a part with an unsupported content type.`);
    }
    return Object.freeze({ name, sheetId, relationshipId, state, partName: part.name });
  });

  const workbookProperties = childElements(document.root, profile.spreadsheet, "workbookPr");
  if (workbookProperties.length > 1) {
    throw new SpreadsheetError("invalid_workbook", "A workbook must not repeat workbookPr.");
  }
  const rawDate1904 = workbookProperties[0] === undefined
    ? undefined
    : optionalUnqualifiedAttribute(workbookProperties[0], "date1904");
  const dateSystem = rawDate1904 === undefined || rawDate1904 === "0" || rawDate1904 === "false"
    ? "1900"
    : rawDate1904 === "1" || rawDate1904 === "true"
      ? "1904"
      : undefined;
  if (dateSystem === undefined) {
    throw new SpreadsheetError("invalid_workbook", "workbookPr date1904 must be an XML boolean.");
  }

  const calculationProperties = childElements(document.root, profile.spreadsheet, "calcPr");
  if (calculationProperties.length > 1) {
    throw new SpreadsheetError("invalid_calculation", "A workbook must not repeat calcPr.");
  }
  const calculationElement = calculationProperties[0];
  const calculationId = parseOptionalUnsignedInteger(calculationElement, "calcId");
  const mode = calculationElement === undefined
    ? undefined
    : optionalUnqualifiedAttribute(calculationElement, "calcMode");
  if (mode !== undefined && mode !== "auto" && mode !== "autoNoTable" && mode !== "manual") {
    throw new SpreadsheetError("invalid_calculation", `calcPr calcMode ${JSON.stringify(mode)} is invalid.`);
  }
  const calculationChains = relationships.items.filter(
    (relationship) => relationship.type === profile.calculationChainRelationship,
  );
  if (calculationChains.length > 1 || calculationChains[0]?.targetMode === "External") {
    throw new SpreadsheetError("invalid_calculation", "A workbook may have at most one internal calculation chain.");
  }
  const calculationChainRelationship = calculationChains[0];
  const calculationChain = calculationChainRelationship?.targetMode === "Internal"
    ? Object.freeze({
        relationshipId: calculationChainRelationship.id,
        partName: calculationChainRelationship.targetPartName,
      })
    : undefined;
  const calculation = Object.freeze({
    calculationId,
    mode,
    fullCalculationOnLoad: parseOptionalBoolean(calculationElement, "fullCalcOnLoad"),
    forceFullCalculation: parseOptionalBoolean(calculationElement, "forceFullCalc"),
    calculationChain,
  });
  return new SpreadsheetWorkbook(pkg, main, document, profile.conformance, dateSystem, calculation, sheets);
}

function parseOptionalUnsignedInteger(element: LosslessXmlElement | undefined, name: string): number | undefined {
  if (element === undefined) return undefined;
  const raw = optionalUnqualifiedAttribute(element, name);
  if (raw === undefined) return undefined;
  if (!/^(?:0|[1-9][0-9]*)$/.test(raw)) {
    throw new SpreadsheetError("invalid_calculation", `calcPr ${name} must be an unsigned integer.`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value > 0xffffffff) {
    throw new SpreadsheetError("invalid_calculation", `calcPr ${name} is outside the unsigned integer range.`);
  }
  return value;
}

function parseOptionalBoolean(element: LosslessXmlElement | undefined, name: string): boolean | undefined {
  if (element === undefined) return undefined;
  const raw = optionalUnqualifiedAttribute(element, name);
  if (raw === undefined) return undefined;
  if (raw === "1" || raw === "true") return true;
  if (raw === "0" || raw === "false") return false;
  throw new SpreadsheetError("invalid_calculation", `calcPr ${name} must be an XML boolean.`);
}

function childElements(parent: LosslessXmlElement, namespaceUri: string, localName: string): LosslessXmlElement[] {
  return parent.children.filter((child): child is LosslessXmlElement =>
    child.kind === "element" && child.namespaceUri === namespaceUri && child.localName === localName
  );
}

function optionalUnqualifiedAttribute(element: LosslessXmlElement, localName: string): string | undefined {
  return element.attributes.find((attribute) => attribute.namespaceUri === "" && attribute.localName === localName)?.value;
}

function requiredUnqualifiedAttribute(element: LosslessXmlElement, localName: string): string {
  const value = optionalUnqualifiedAttribute(element, localName);
  if (value === undefined) {
    throw new SpreadsheetError("invalid_sheet", `A sheet is missing its ${localName} attribute.`);
  }
  return value;
}

function requiredQualifiedAttribute(element: LosslessXmlElement, namespaceUri: string, localName: string): string {
  const attribute: LosslessXmlAttribute | undefined = element.attributes.find(
    (candidate) => candidate.namespaceUri === namespaceUri && candidate.localName === localName,
  );
  if (attribute === undefined || attribute.value.length === 0) {
    throw new SpreadsheetError("invalid_sheet", `A sheet is missing its relationship ${localName} attribute.`);
  }
  return attribute.value;
}
