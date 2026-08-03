import type { LosslessXmlElement } from "@tumblerjs/ooxml";
import { OOXML_NAMESPACES, parseLosslessXml } from "@tumblerjs/ooxml";
import type { OpcPart, PartName } from "@tumblerjs/opc";
import { SpreadsheetError, type SpreadsheetWorkbook } from "./workbook.ts";

const SHARED_STRINGS_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml";

export class SharedStringTable {
  readonly partName: PartName;
  readonly values: readonly string[];

  constructor(partName: PartName, values: readonly string[]) {
    this.partName = partName;
    this.values = Object.freeze([...values]);
  }

  get(index: number): string | undefined {
    return Number.isSafeInteger(index) && index >= 0 ? this.values[index] : undefined;
  }
}

export function readSharedStrings(workbook: SpreadsheetWorkbook): SharedStringTable | undefined {
  const profile = workbook.conformance === "strict"
    ? {
        spreadsheet: OOXML_NAMESPACES.strict.spreadsheet,
        relationship: "http://purl.oclc.org/ooxml/officeDocument/relationships/sharedStrings",
      }
    : {
        spreadsheet: OOXML_NAMESPACES.transitional.spreadsheet,
        relationship: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings",
      };
  const matches = workbook.package.relationships(workbook.part.name).byType(profile.relationship);
  if (matches.length === 0) return undefined;
  if (matches.length !== 1 || matches[0]?.targetMode !== "Internal") {
    throw new SpreadsheetError("invalid_workbook", "A workbook must not reference more than one internal Shared String Table.");
  }
  const part: OpcPart | undefined = workbook.package.getPart(matches[0].targetPartName);
  if (part?.contentType !== SHARED_STRINGS_CONTENT_TYPE) {
    throw new SpreadsheetError("invalid_workbook", "The Shared String Table has an unsupported content type.");
  }
  const document = parseLosslessXml(workbook.package.readPart(part));
  if (document.root.namespaceUri !== profile.spreadsheet || document.root.localName !== "sst") {
    throw new SpreadsheetError("invalid_workbook", "The Shared String Table must have an sst root element.");
  }
  const items = childElements(document.root, profile.spreadsheet, "si");
  const values = items.map((item) => richText(item, profile.spreadsheet, document.textContent.bind(document)));
  validateOptionalCount(document.root, "count");
  const uniqueCount = validateOptionalCount(document.root, "uniqueCount");
  if (uniqueCount !== undefined && uniqueCount !== values.length) {
    throw new SpreadsheetError("invalid_workbook", "The Shared String Table uniqueCount does not match its string items.");
  }
  return new SharedStringTable(part.name, values);
}

export function richText(
  container: LosslessXmlElement,
  namespaceUri: string,
  textContent: (element: LosslessXmlElement) => string,
): string {
  let value = "";
  for (const child of container.children) {
    if (child.kind !== "element" || child.namespaceUri !== namespaceUri) continue;
    if (child.localName === "t") value += textContent(child);
    if (child.localName === "r") {
      for (const runChild of child.children) {
        if (runChild.kind === "element" && runChild.namespaceUri === namespaceUri && runChild.localName === "t") {
          value += textContent(runChild);
        }
      }
    }
  }
  return value;
}

function childElements(parent: LosslessXmlElement, namespaceUri: string, localName: string): LosslessXmlElement[] {
  return parent.children.filter((child): child is LosslessXmlElement =>
    child.kind === "element" && child.namespaceUri === namespaceUri && child.localName === localName
  );
}

function validateOptionalCount(root: LosslessXmlElement, name: string): number | undefined {
  const raw = root.attributes.find((attribute) => attribute.namespaceUri === "" && attribute.localName === name)?.value;
  if (raw === undefined) return undefined;
  if (!/^(?:0|[1-9][0-9]*)$/.test(raw)) {
    throw new SpreadsheetError("invalid_workbook", `Shared String Table ${name} must be an unsigned integer.`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value > 0xffffffff) {
    throw new SpreadsheetError("invalid_workbook", `Shared String Table ${name} is outside the unsigned integer range.`);
  }
  return value;
}
