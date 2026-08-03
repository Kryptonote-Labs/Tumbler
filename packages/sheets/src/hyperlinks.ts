import type { LosslessXmlElement } from "@tumblerjs/ooxml";
import type { OpcPart } from "@tumblerjs/opc";
import { parseCellRange, type CellAddress, type CellRange } from "./references.ts";
import { SpreadsheetError, type SpreadsheetWorkbook } from "./workbook.ts";

interface SpreadsheetHyperlinkBase {
  readonly range: CellRange;
  readonly display: string | undefined;
  readonly tooltip: string | undefined;
}

export interface SpreadsheetHyperlinkDestination {
  readonly sheet: string;
  readonly range: CellRange;
}

export interface SpreadsheetInternalHyperlink extends SpreadsheetHyperlinkBase {
  readonly kind: "internal";
  readonly location: string;
  readonly destination: SpreadsheetHyperlinkDestination | undefined;
}

export interface SpreadsheetExternalHyperlink extends SpreadsheetHyperlinkBase {
  readonly kind: "external";
  readonly relationshipId: string;
  readonly target: string;
  readonly location: string | undefined;
}

export type SpreadsheetHyperlink = SpreadsheetInternalHyperlink | SpreadsheetExternalHyperlink;

export function readSpreadsheetHyperlinks(input: {
  workbook: SpreadsheetWorkbook;
  worksheetPart: OpcPart;
  worksheetRoot: LosslessXmlElement;
  worksheetName: string;
  spreadsheetNamespace: string;
  relationshipsNamespace: string;
}): readonly SpreadsheetHyperlink[] {
  const containers = children(input.worksheetRoot, input.spreadsheetNamespace, "hyperlinks");
  if (containers.length > 1) invalid("A worksheet must not repeat hyperlinks.");
  const elements = containers[0] === undefined
    ? []
    : children(containers[0], input.spreadsheetNamespace, "hyperlink");
  if (elements.length === 0) return Object.freeze([]);

  let relationships: ReturnType<SpreadsheetWorkbook["package"]["relationships"]> | undefined;
  const relationshipType = `${input.relationshipsNamespace}/hyperlink`;
  const hyperlinks = elements.map((element) => {
    const rawRange = attr(element, "ref");
    if (rawRange === undefined) invalid("A hyperlink requires a ref.");
    const range = hyperlinkRange(rawRange);
    const display = attr(element, "display");
    const tooltip = attr(element, "tooltip");
    const location = attr(element, "location");
    const relationshipId = qualifiedAttr(element, input.relationshipsNamespace, "id");

    if (relationshipId === undefined) {
      if (location === undefined || location.length === 0) {
        invalid(`Hyperlink ${JSON.stringify(rawRange)} requires a location or relationship id.`);
      }
      return Object.freeze({
        kind: "internal" as const,
        range,
        display,
        tooltip,
        location,
        destination: parseSpreadsheetHyperlinkLocation(location, input.worksheetName),
      });
    }

    relationships ??= input.workbook.package.relationships(input.worksheetPart.name);
    const relationship = relationships.get(relationshipId);
    if (relationship === undefined || relationship.targetMode !== "External" || relationship.type !== relationshipType) {
      invalid(`Hyperlink relationship ${JSON.stringify(relationshipId)} must target an external hyperlink.`);
    }
    return Object.freeze({
      kind: "external" as const,
      range,
      display,
      tooltip,
      relationshipId,
      target: relationship.target,
      location,
    });
  });
  return Object.freeze(hyperlinks);
}

export function spreadsheetHyperlinkAt(
  hyperlinks: readonly SpreadsheetHyperlink[],
  address: CellAddress,
): SpreadsheetHyperlink | undefined {
  return hyperlinks.find(({ range }) =>
    address.row >= range.start.row && address.row <= range.end.row &&
    address.column >= range.start.column && address.column <= range.end.column
  );
}

/** Resolves the worksheet-and-cell subset of SpreadsheetML hyperlink locations. */
export function parseSpreadsheetHyperlinkLocation(
  location: string,
  currentSheet: string,
): SpreadsheetHyperlinkDestination | undefined {
  const source = location.startsWith("#") ? location.slice(1) : location;
  const split = splitSheetLocation(source);
  const sheet = split?.sheet ?? currentSheet;
  const reference = (split?.reference ?? source).replaceAll("$", "");
  try {
    return Object.freeze({ sheet, range: parseCellRange(reference) });
  } catch {
    // Defined names and other producer extensions remain available as raw locations.
    return undefined;
  }
}

function splitSheetLocation(location: string): { readonly sheet: string; readonly reference: string } | undefined {
  if (location.startsWith("'")) {
    let sheet = "";
    for (let index = 1; index < location.length; index += 1) {
      if (location[index] !== "'") {
        sheet += location[index];
        continue;
      }
      if (location[index + 1] === "'") {
        sheet += "'";
        index += 1;
        continue;
      }
      return location[index + 1] === "!" && index + 2 < location.length
        ? { sheet, reference: location.slice(index + 2) }
        : undefined;
    }
    return undefined;
  }
  const separator = location.lastIndexOf("!");
  return separator > 0 && separator + 1 < location.length
    ? { sheet: location.slice(0, separator), reference: location.slice(separator + 1) }
    : undefined;
}

function hyperlinkRange(raw: string): CellRange {
  try {
    return parseCellRange(raw);
  } catch (cause) {
    throw new SpreadsheetError("invalid_hyperlink", `Hyperlink ref ${JSON.stringify(raw)} is invalid.`, { cause });
  }
}

function children(parent: LosslessXmlElement, namespace: string, name: string): LosslessXmlElement[] {
  return parent.children.filter((child): child is LosslessXmlElement =>
    child.kind === "element" && child.namespaceUri === namespace && child.localName === name
  );
}

function attr(element: LosslessXmlElement, name: string): string | undefined {
  return element.attributes.find((candidate) => candidate.namespaceUri === "" && candidate.localName === name)?.value;
}

function qualifiedAttr(element: LosslessXmlElement, namespace: string, name: string): string | undefined {
  return element.attributes.find((candidate) => candidate.namespaceUri === namespace && candidate.localName === name)?.value;
}

function invalid(message: string): never {
  throw new SpreadsheetError("invalid_hyperlink", message);
}
