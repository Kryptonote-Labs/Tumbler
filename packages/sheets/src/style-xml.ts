import {
  beginLosslessXmlEdit,
  type LosslessXmlAttribute,
  type LosslessXmlDocument,
  type LosslessXmlElement,
  type LosslessXmlNode,
} from "@tumblerjs/ooxml";
import type {
  SpreadsheetAlignment,
  SpreadsheetBorder,
  SpreadsheetBorderEdge,
  SpreadsheetCellFormat,
  SpreadsheetColor,
  SpreadsheetFill,
  SpreadsheetFont,
} from "./styles.ts";

/** Serialized component ids for one `xf` record. */
export interface CellFormatIds {
  readonly numberFormatId: number;
  readonly fontId: number;
  readonly fillId: number;
  readonly borderId: number;
}

export type XmlEditor = ReturnType<typeof beginLosslessXmlEdit>;

export function serializeNumberFormat(prefix: string, id: number, code: string): string {
  return `<${qualified(prefix, "numFmt")} numFmtId="${id}" formatCode="${escapeAttribute(code)}"/>`;
}

export function serializeFont(prefix: string, font: SpreadsheetFont): string {
  const item = (name: string, value?: string) => value === undefined
    ? `<${qualified(prefix, name)}/>`
    : `<${qualified(prefix, name)} val="${escapeAttribute(value)}"/>`;
  return `<${qualified(prefix, "font")}>` +
    (font.bold ? item("b") : "") +
    (font.italic ? item("i") : "") +
    (font.strike ? item("strike") : "") +
    (font.underline === undefined ? "" : item("u", font.underline)) +
    (font.size === undefined ? "" : item("sz", String(font.size))) +
    (font.color === undefined ? "" : serializeColor(prefix, "color", font.color)) +
    (font.name === undefined ? "" : item("name", font.name)) +
    (font.scheme === undefined ? "" : item("scheme", font.scheme)) +
    `</${qualified(prefix, "font")}>`;
}

export function serializeFill(prefix: string, fill: SpreadsheetFill): string {
  const colors = (fill.foreground === undefined ? "" : serializeColor(prefix, "fgColor", fill.foreground)) +
    (fill.background === undefined ? "" : serializeColor(prefix, "bgColor", fill.background));
  const pattern = `<${qualified(prefix, "patternFill")} patternType="${escapeAttribute(fill.patternType ?? "none")}"` +
    (colors === "" ? "/>" : `>${colors}</${qualified(prefix, "patternFill")}>`);
  return `<${qualified(prefix, "fill")}>${pattern}</${qualified(prefix, "fill")}>`;
}

/** CT_Border child order: left, right, top, bottom, diagonal. */
export function serializeBorder(prefix: string, border: SpreadsheetBorder): string {
  const edge = (name: string, value: SpreadsheetBorderEdge) => {
    const style = value.style === undefined ? "" : ` style="${escapeAttribute(value.style)}"`;
    return value.color === undefined
      ? `<${qualified(prefix, name)}${style}/>`
      : `<${qualified(prefix, name)}${style}>${serializeColor(prefix, "color", value.color)}</${qualified(prefix, name)}>`;
  };
  const attributes = (border.diagonalUp === undefined ? "" : ` diagonalUp="${border.diagonalUp ? 1 : 0}"`) +
    (border.diagonalDown === undefined ? "" : ` diagonalDown="${border.diagonalDown ? 1 : 0}"`);
  return `<${qualified(prefix, "border")}${attributes}>${edge("left", border.left)}${edge("right", border.right)}` +
    `${edge("top", border.top)}${edge("bottom", border.bottom)}${border.diagonal === undefined ? "" : edge("diagonal", border.diagonal)}` +
    `</${qualified(prefix, "border")}>`;
}

export function serializeColor(prefix: string, name: string, color: SpreadsheetColor): string {
  const tint = color.tint === 0 ? "" : ` tint="${color.tint}"`;
  const property = color.type === "automatic" ? ' auto="1"' : color.type === "rgb"
    ? ` rgb="${color.argb}"` : color.type === "indexed" ? ` indexed="${color.index}"` : ` theme="${color.index}"`;
  return `<${qualified(prefix, name)}${property}${tint}/>`;
}

/** Resolved formats are written with every component applied directly. */
export function serializeCellFormat(prefix: string, format: SpreadsheetCellFormat, ids: CellFormatIds): string {
  const alignment = serializeAlignment(prefix, format.alignment);
  const protection = format.protection === undefined ? "" :
    `<${qualified(prefix, "protection")}${format.protection.locked ? "" : ' locked="0"'}${format.protection.hidden ? ' hidden="1"' : ""}/>`;
  const children = alignment + protection;
  const attributes = `numFmtId="${ids.numberFormatId}" fontId="${ids.fontId}" fillId="${ids.fillId}" borderId="${ids.borderId}"` +
    ' applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"' +
    (format.protection === undefined ? "" : ' applyProtection="1"') +
    (format.quotePrefix === undefined ? "" : ` quotePrefix="${format.quotePrefix ? 1 : 0}"`);
  return `<${qualified(prefix, "xf")} ${attributes}${children === "" ? "/>" : `>${children}</${qualified(prefix, "xf")}>`}`;
}

function serializeAlignment(prefix: string, alignment: SpreadsheetAlignment): string {
  const attributes = [
    alignment.horizontal === undefined ? "" : ` horizontal="${escapeAttribute(alignment.horizontal)}"`,
    alignment.vertical === undefined ? "" : ` vertical="${escapeAttribute(alignment.vertical)}"`,
    alignment.textRotation === 0 ? "" : ` textRotation="${alignment.textRotation}"`,
    alignment.wrapText ? ' wrapText="1"' : "",
    alignment.indent === 0 ? "" : ` indent="${alignment.indent}"`,
    alignment.shrinkToFit ? ' shrinkToFit="1"' : "",
    alignment.readingOrder === 0 ? "" : ` readingOrder="${alignment.readingOrder}"`,
  ].join("");
  return attributes === "" ? "" : `<${qualified(prefix, "alignment")}${attributes}/>`;
}

/** Appends serialized items to a style collection and keeps its count accurate. */
export function appendCollection(
  editor: XmlEditor,
  document: LosslessXmlDocument,
  collection: LosslessXmlElement,
  markup: string,
  count: number,
): void {
  if (markup === "") return;
  if (collection.selfClosing) {
    const start = setRawAttribute(
      document.source.slice(collection.startTagSpan.start, collection.startTagSpan.end),
      "count",
      String(count),
    ).replace(/\/\s*>$/, ">");
    editor.replaceElementMarkup(collection, `${start}${markup}</${collection.qualified}>`);
    return;
  }
  editor.appendMarkup(collection, markup);
  const countAttribute = attribute(collection, "count");
  if (countAttribute === undefined) editor.insertAttribute(collection, "count", String(count));
  else editor.setAttribute(countAttribute, String(count));
}

function setRawAttribute(startTag: string, name: string, value: string): string {
  const expression = new RegExp(`(\\s${name}\\s*=\\s*["'])[^"']*(["'])`);
  if (expression.test(startTag)) return startTag.replace(expression, `$1${value}$2`);
  const offset = startTag.search(/\/?>\s*$/);
  return `${startTag.slice(0, offset)} ${name}="${value}"${startTag.slice(offset)}`;
}

export function spreadsheetNamespace(conformance: "strict" | "transitional"): string {
  return conformance === "strict"
    ? "http://purl.oclc.org/ooxml/spreadsheetml/main"
    : "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
}

export function child(parent: LosslessXmlElement, namespace: string, name: string): LosslessXmlElement | undefined {
  return parent.children.find((node): node is LosslessXmlElement =>
    node.kind === "element" && node.namespaceUri === namespace && node.localName === name
  );
}

export function children(parent: LosslessXmlElement, namespace: string, name: string): LosslessXmlElement[] {
  return parent.children.filter((node): node is LosslessXmlElement =>
    node.kind === "element" && node.namespaceUri === namespace && node.localName === name
  );
}

export function attribute(element: LosslessXmlElement, name: string): LosslessXmlAttribute | undefined {
  return element.attributes.find((candidate) => candidate.namespaceUri === "" && candidate.localName === name);
}

export function qualified(prefix: string, local: string): string {
  return prefix === "" ? local : `${prefix}:${local}`;
}

export function sourceForNode(document: LosslessXmlDocument, node: LosslessXmlNode): string {
  return document.source.slice(node.span.start, node.span.end);
}

export function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
