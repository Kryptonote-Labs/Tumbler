import {
  beginLosslessXmlEdit,
  encodeXmlSource,
  parseLosslessXml,
  type LosslessXmlAttribute,
  type LosslessXmlDocument,
  type LosslessXmlElement,
  type LosslessXmlNode,
} from "@tumbler/ooxml";
import { saveOpcPackage, type PartName } from "@tumbler/opc";
import { formatCellRange, formatCellReference, parseCellReference, type CellAddress, type CellRange } from "./references.ts";
import { openWorksheet, type SpreadsheetCellValue } from "./worksheet.ts";
import { SpreadsheetError, type SpreadsheetSheet, type SpreadsheetWorkbook } from "./workbook.ts";

export type EditableCellValue = string | number | boolean | null;
export type SpreadsheetEditorStatus = "active" | "committed" | "rolled_back";

interface StagedCellEdit {
  readonly sheet: SpreadsheetSheet;
  readonly address: CellAddress;
  readonly value: EditableCellValue;
}

/** Stages literal cell edits and commits them as isolated worksheet-part replacements. */
export class SpreadsheetEditor {
  readonly workbook: SpreadsheetWorkbook;
  #status: SpreadsheetEditorStatus = "active";
  readonly #edits = new Map<string, StagedCellEdit>();

  constructor(workbook: SpreadsheetWorkbook) {
    this.workbook = workbook;
  }

  get status(): SpreadsheetEditorStatus {
    return this.#status;
  }

  get hasChanges(): boolean {
    return this.#edits.size > 0;
  }

  setCellValue(sheet: SpreadsheetSheet, reference: string | CellAddress, value: EditableCellValue): this {
    this.#assertActive();
    if (!this.workbook.sheets.includes(sheet)) throw new TypeError("The sheet does not belong to this workbook.");
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new TypeError("Spreadsheet numeric values must be finite.");
    }
    const address = typeof reference === "string" ? parseCellReference(reference) : parseCellReference(formatCellReference(reference));
    const normalized = formatCellReference(address);
    this.#edits.set(`${sheet.partName.equivalenceKey}\0${normalized}`, { sheet, address, value });
    return this;
  }

  commit(): Uint8Array {
    this.#assertActive();
    if (this.#edits.size === 0) {
      this.#status = "committed";
      return this.workbook.package.archive.originalBytes();
    }
    const editsByPart = new Map<string, StagedCellEdit[]>();
    for (const edit of this.#edits.values()) {
      const edits = editsByPart.get(edit.sheet.partName.equivalenceKey) ?? [];
      edits.push(edit);
      editsByPart.set(edit.sheet.partName.equivalenceKey, edits);
    }
    const replacements = new Map<PartName, Uint8Array>();
    for (const edits of editsByPart.values()) {
      edits.sort((left, right) => left.address.row - right.address.row || left.address.column - right.address.column);
      const sheet = edits[0]!.sheet;
      const original = openWorksheet(this.workbook, sheet);
      let bytes = original.document.originalBytes();
      for (const edit of edits) bytes = applyCellEdit(bytes, this.workbook.conformance, edit.address, edit.value);
      if (!equalBytes(bytes, original.document.originalBytes())) replacements.set(sheet.partName, bytes);
    }
    const output = saveOpcPackage(this.workbook.package, replacements);
    this.#status = "committed";
    return output;
  }

  rollback(): void {
    this.#assertActive();
    this.#edits.clear();
    this.#status = "rolled_back";
  }

  #assertActive(): void {
    if (this.#status !== "active") {
      throw new SpreadsheetError("invalid_worksheet", `The spreadsheet editor is already ${this.#status.replace("_", " ")}.`);
    }
  }
}

export function beginSpreadsheetEdit(workbook: SpreadsheetWorkbook): SpreadsheetEditor {
  return new SpreadsheetEditor(workbook);
}

function applyCellEdit(
  bytes: Uint8Array,
  conformance: "strict" | "transitional",
  address: CellAddress,
  value: EditableCellValue,
): Uint8Array {
  const document = parseLosslessXml(bytes);
  const namespace = conformance === "strict"
    ? "http://purl.oclc.org/ooxml/spreadsheetml/main"
    : "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const sheetData = children(document.root, namespace, "sheetData")[0];
  if (sheetData === undefined) throw new SpreadsheetError("invalid_worksheet", "A worksheet must contain sheetData before it can be edited.");
  const location = locateCell(document, sheetData, namespace, address);
  if (location.cell !== undefined && shouldSkipEdit(document, location.cell, namespace, value)) return bytes;
  if (location.cell === undefined && value === null) return bytes;

  const editor = beginLosslessXmlEdit(document);
  const reference = formatCellReference(address);
  if (location.cell !== undefined) {
    editor.replaceElementMarkup(location.cell, serializeExistingCell(document, location.cell, namespace, value));
  } else if (location.row !== undefined) {
    const markup = serializeNewCell(location.row.prefix, reference, newCellValue(value));
    const next = location.cells.find(({ address: candidate }) => candidate.column > address.column)?.element;
    if (next !== undefined) editor.insertMarkupBefore(next, markup);
    else if (location.row.selfClosing) editor.replaceElementMarkup(location.row, openSelfClosingElement(document, location.row, markup));
    else editor.appendMarkup(location.row, markup);
  } else {
    const rowMarkup = `<${qualified(sheetData.prefix, "row")} r="${address.row}">${serializeNewCell(sheetData.prefix, reference, newCellValue(value))}</${qualified(sheetData.prefix, "row")}>`;
    const nextRow = location.rows.find(({ index }) => index > address.row)?.element;
    if (nextRow !== undefined) editor.insertMarkupBefore(nextRow, rowMarkup);
    else if (sheetData.selfClosing) editor.replaceElementMarkup(sheetData, openSelfClosingElement(document, sheetData, rowMarkup));
    else editor.appendMarkup(sheetData, rowMarkup);
  }
  if (value !== null) updateDimension(editor, document, namespace, sheetData, address);
  return editor.commit().bytes;
}

function locateCell(document: LosslessXmlDocument, sheetData: LosslessXmlElement, namespace: string, target: CellAddress): {
  readonly row: LosslessXmlElement | undefined;
  readonly cell: LosslessXmlElement | undefined;
  readonly rows: readonly { readonly index: number; readonly element: LosslessXmlElement }[];
  readonly cells: readonly { readonly address: CellAddress; readonly element: LosslessXmlElement }[];
} {
  const rows: { index: number; element: LosslessXmlElement }[] = [];
  let previousRow = 0;
  for (const element of children(sheetData, namespace, "row")) {
    const raw = attribute(element, "r")?.value;
    const index = raw === undefined ? previousRow + 1 : Number(raw);
    rows.push({ index, element });
    previousRow = index;
  }
  const row = rows.find(({ index }) => index === target.row)?.element;
  const cells: { address: CellAddress; element: LosslessXmlElement }[] = [];
  if (row !== undefined) {
    let previousColumn = 0;
    for (const element of children(row, namespace, "c")) {
      const raw = attribute(element, "r")?.value;
      const address = raw === undefined ? { row: target.row, column: previousColumn + 1 } : parseCellReference(raw);
      cells.push({ address, element });
      previousColumn = address.column;
    }
  }
  return { row, cell: cells.find(({ address }) => address.column === target.column)?.element, rows, cells };
}

function serializeExistingCell(
  document: LosslessXmlDocument,
  cell: LosslessXmlElement,
  namespace: string,
  value: EditableCellValue,
): string {
  const type = cellType(value);
  let startTag = document.source.slice(cell.startTagSpan.start, cell.startTagSpan.end);
  const typeAttribute = attribute(cell, "t");
  if (typeAttribute !== undefined) {
    const relativeStart = typeAttribute.span.start - cell.startTagSpan.start;
    const relativeEnd = typeAttribute.span.end - cell.startTagSpan.start;
    startTag = startTag.slice(0, relativeStart) +
      (type === undefined ? "" : `${typeAttribute.qualified}=${typeAttribute.quote}${escapeAttribute(type)}${typeAttribute.quote}`) +
      startTag.slice(relativeEnd);
  } else if (type !== undefined) {
    const insertion = closingInsertion(startTag);
    startTag = `${startTag.slice(0, insertion)} t="${type}"${startTag.slice(insertion)}`;
  }
  startTag = startTag.replace(/\/\s*>$/, ">");
  const preserved = cell.children
    .filter((node) => node.kind !== "element" || node.namespaceUri !== namespace || !["f", "v", "is"].includes(node.localName))
    .map((node) => sourceForNode(document, node))
    .join("");
  return `${startTag}${serializeValue(cell.prefix, value)}${preserved}</${cell.qualified}>`;
}

function serializeNewCell(prefix: string, reference: string, value: Exclude<EditableCellValue, null>): string {
  const type = cellType(value);
  return `<${qualified(prefix, "c")} r="${reference}"${type === undefined ? "" : ` t="${type}"`}>${serializeValue(prefix, value)}</${qualified(prefix, "c")}>`;
}

function newCellValue(value: EditableCellValue): Exclude<EditableCellValue, null> {
  if (value === null) throw new TypeError("A cleared value cannot create a cell.");
  return value;
}

function serializeValue(prefix: string, value: EditableCellValue): string {
  if (value === null) return "";
  if (typeof value === "string") {
    return `<${qualified(prefix, "is")}><${qualified(prefix, "t")} xml:space="preserve">${escapeText(value)}</${qualified(prefix, "t")}></${qualified(prefix, "is")}>`;
  }
  const lexical = typeof value === "boolean" ? (value ? "1" : "0") : String(value);
  return `<${qualified(prefix, "v")}>${lexical}</${qualified(prefix, "v")}>`;
}

function cellType(value: EditableCellValue): "b" | "inlineStr" | "n" | undefined {
  if (value === null) return undefined;
  if (typeof value === "string") return "inlineStr";
  if (typeof value === "boolean") return "b";
  return "n";
}

function shouldSkipEdit(document: LosslessXmlDocument, cell: LosslessXmlElement, namespace: string, value: EditableCellValue): boolean {
  if (children(cell, namespace, "f").length > 0) return false;
  const current = primitiveCellValue(document, cell, namespace);
  return Object.is(current, value);
}

function primitiveCellValue(document: LosslessXmlDocument, cell: LosslessXmlElement, namespace: string): EditableCellValue | undefined {
  const type = attribute(cell, "t")?.value ?? "n";
  const raw = children(cell, namespace, "v")[0];
  if (type === "inlineStr") {
    const inline = children(cell, namespace, "is")[0];
    if (inline === undefined) return undefined;
    return children(inline, namespace, "t").map((element) => document.textContent(element)).join("");
  }
  if (raw === undefined) return null;
  const text = document.textContent(raw);
  if (type === "b") return text === "1" || text === "true";
  if (type === "n") return Number(text);
  return undefined;
}

function updateDimension(
  editor: ReturnType<typeof beginLosslessXmlEdit>,
  document: LosslessXmlDocument,
  namespace: string,
  sheetData: LosslessXmlElement,
  address: CellAddress,
): void {
  const dimension = children(document.root, namespace, "dimension")[0];
  if (dimension === undefined) {
    editor.insertMarkupBefore(sheetData, `<${qualified(document.root.prefix, "dimension")} ref="${formatCellReference(address)}"/>`);
    return;
  }
  const reference = attribute(dimension, "ref");
  if (reference === undefined) return;
  const existing = parseRange(reference.value);
  const expanded: CellRange = {
    start: { row: Math.min(existing.start.row, address.row), column: Math.min(existing.start.column, address.column) },
    end: { row: Math.max(existing.end.row, address.row), column: Math.max(existing.end.column, address.column) },
  };
  const formatted = formatCellRange(expanded);
  if (formatted !== reference.value) editor.setAttribute(reference, formatted);
}

function parseRange(value: string): CellRange {
  const [start, end = start] = value.split(":");
  if (start === undefined || end === undefined) throw new SpreadsheetError("invalid_worksheet", "Worksheet dimension is invalid.");
  return { start: parseCellReference(start), end: parseCellReference(end) };
}

function openSelfClosingElement(document: LosslessXmlDocument, element: LosslessXmlElement, content: string): string {
  const start = document.source.slice(element.startTagSpan.start, element.startTagSpan.end).replace(/\/\s*>$/, ">");
  return `${start}${content}</${element.qualified}>`;
}

function children(parent: LosslessXmlElement, namespace: string, name: string): LosslessXmlElement[] {
  return parent.children.filter((child): child is LosslessXmlElement =>
    child.kind === "element" && child.namespaceUri === namespace && child.localName === name
  );
}

function attribute(element: LosslessXmlElement, name: string): LosslessXmlAttribute | undefined {
  return element.attributes.find((candidate) => candidate.namespaceUri === "" && candidate.localName === name);
}

function sourceForNode(document: LosslessXmlDocument, node: LosslessXmlNode): string {
  return document.source.slice(node.span.start, node.span.end);
}

function qualified(prefix: string, localName: string): string {
  return prefix === "" ? localName : `${prefix}:${localName}`;
}

function closingInsertion(startTag: string): number {
  let offset = startTag.length - 1;
  while (offset > 0 && /\s/.test(startTag[offset - 1] ?? "")) offset -= 1;
  if (startTag[offset - 1] === "/") offset -= 1;
  return offset;
}

function escapeText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll("]]>", "]]&gt;");
}

function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}
