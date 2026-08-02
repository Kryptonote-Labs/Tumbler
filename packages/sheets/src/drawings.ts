import { OOXML_NAMESPACES, parseLosslessXml, type LosslessXmlDocument, type LosslessXmlElement } from "@tumbler/ooxml";
import type { OpcPart, PartName } from "@tumbler/opc";
import { SpreadsheetError, type SpreadsheetWorkbook } from "./workbook.ts";

const DRAWING_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.drawing+xml";

export interface SpreadsheetDrawing {
  readonly relationshipId: string;
  readonly partName: PartName;
  readonly part: OpcPart;
  readonly document: LosslessXmlDocument;
}

/** Discovers the worksheet's single Drawing part through its OPC relationship. */
export function readSpreadsheetDrawing(input: {
  workbook: SpreadsheetWorkbook;
  worksheetPart: OpcPart;
  worksheetRoot: LosslessXmlElement;
  spreadsheetNamespace: string;
  relationshipsNamespace: string;
}): SpreadsheetDrawing | undefined {
  const elements = children(input.worksheetRoot, input.spreadsheetNamespace, "drawing");
  if (elements.length > 1) invalid("A worksheet must not repeat drawing.");
  const element = elements[0];
  if (element === undefined) return undefined;
  const relationshipId = qualifiedAttr(element, input.relationshipsNamespace, "id");
  if (relationshipId === undefined || relationshipId.length === 0) invalid("A worksheet drawing requires a relationship id.");

  const relationship = input.workbook.package.relationships(input.worksheetPart.name).get(relationshipId);
  const expectedType = `${input.relationshipsNamespace}/drawing`;
  if (relationship === undefined || relationship.targetMode !== "Internal" || relationship.type !== expectedType) {
    invalid(`Drawing relationship ${JSON.stringify(relationshipId)} must target an internal Drawing part.`);
  }
  const part = input.workbook.package.getPart(relationship.targetPartName);
  if (part?.contentType !== DRAWING_CONTENT_TYPE) invalid(`Drawing relationship ${JSON.stringify(relationshipId)} has an unsupported content type.`);

  let document: LosslessXmlDocument;
  try {
    document = parseLosslessXml(input.workbook.package.readPart(part));
  } catch (cause) {
    throw new SpreadsheetError("invalid_drawing", `Drawing part ${JSON.stringify(part.name.value)} is not valid XML.`, { cause });
  }
  const namespace = input.workbook.conformance === "strict"
    ? OOXML_NAMESPACES.strict.spreadsheetDrawing
    : OOXML_NAMESPACES.transitional.spreadsheetDrawing;
  if (document.root.namespaceUri !== namespace || document.root.localName !== "wsDr") {
    invalid("A spreadsheet Drawing part must have an xdr:wsDr root element.");
  }
  return Object.freeze({ relationshipId, partName: part.name, part, document });
}

function children(parent: LosslessXmlElement, namespace: string, name: string): LosslessXmlElement[] {
  return parent.children.filter((child): child is LosslessXmlElement =>
    child.kind === "element" && child.namespaceUri === namespace && child.localName === name
  );
}

function qualifiedAttr(element: LosslessXmlElement, namespace: string, name: string): string | undefined {
  return element.attributes.find((candidate) => candidate.namespaceUri === namespace && candidate.localName === name)?.value;
}

function invalid(message: string): never {
  throw new SpreadsheetError("invalid_drawing", message);
}
