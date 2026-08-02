import { OOXML_NAMESPACES, parseLosslessXml, type LosslessXmlDocument, type LosslessXmlElement } from "@tumbler/ooxml";
import type { OpcPart, PartName } from "@tumbler/opc";
import type { SparseAxisGeometry } from "@tumbler/core";
import { ChartParseError, parseOoxmlChart, type ChartModel } from "@tumbler/charts";
import { SpreadsheetError, type SpreadsheetWorkbook } from "./workbook.ts";

const DRAWING_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.drawing+xml";
const CHART_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.drawingml.chart+xml";
const MAX_DRAWING_ANCHORS = 10_000;

export interface SpreadsheetDrawing {
  readonly relationshipId: string;
  readonly partName: PartName;
  readonly part: OpcPart;
  readonly document: LosslessXmlDocument;
  readonly anchors: readonly SpreadsheetDrawingAnchor[];
  readonly charts: readonly SpreadsheetChartFrame[];
}

export interface SpreadsheetChartFrame {
  readonly anchor: SpreadsheetDrawingAnchor;
  readonly relationshipId: string | undefined;
  readonly partName: PartName | undefined;
  readonly model: ChartModel;
}

export interface SpreadsheetDrawingMarker {
  /** Zero-based SpreadsheetDrawingML column. */
  readonly column: number;
  /** Zero-based SpreadsheetDrawingML row. */
  readonly row: number;
  readonly columnOffsetEmu: number;
  readonly rowOffsetEmu: number;
}

export type SpreadsheetDrawingAnchor =
  | { readonly kind: "absolute"; readonly elementId: number; readonly xEmu: number; readonly yEmu: number; readonly widthEmu: number; readonly heightEmu: number }
  | { readonly kind: "one-cell"; readonly elementId: number; readonly from: SpreadsheetDrawingMarker; readonly widthEmu: number; readonly heightEmu: number }
  | { readonly kind: "two-cell"; readonly elementId: number; readonly from: SpreadsheetDrawingMarker; readonly to: SpreadsheetDrawingMarker; readonly editAs: "absolute" | "oneCell" | "twoCell" };

export interface SpreadsheetDrawingBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
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
  const anchors = parseDrawingAnchors(document.root, namespace);
  return Object.freeze({
    relationshipId,
    partName: part.name,
    part,
    document,
    anchors,
    charts: readChartFrames(input.workbook, part, document, anchors, namespace, input.relationshipsNamespace),
  });
}

function readChartFrames(
  workbook: SpreadsheetWorkbook,
  drawingPart: OpcPart,
  document: LosslessXmlDocument,
  anchors: readonly SpreadsheetDrawingAnchor[],
  spreadsheetDrawingNamespace: string,
  relationshipsNamespace: string,
): readonly SpreadsheetChartFrame[] {
  const chartNamespace = OOXML_NAMESPACES[workbook.conformance].chart;
  const drawingNamespace = OOXML_NAMESPACES[workbook.conformance].drawing;
  let relationships: ReturnType<SpreadsheetWorkbook["package"]["relationships"]> | undefined;
  return Object.freeze(anchors.flatMap((anchor): SpreadsheetChartFrame[] => {
    const anchorElement = document.element(anchor.elementId);
    if (anchorElement === undefined) return [];
    const frames = children(anchorElement, spreadsheetDrawingNamespace, "graphicFrame");
    if (frames.length === 0) return [];
    if (frames.length > 1) return [unsupportedFrame(anchor, undefined, undefined, "A drawing anchor repeats graphicFrame.")];
    const graphic = children(frames[0]!, drawingNamespace, "graphic")[0];
    const graphicData = graphic === undefined ? undefined : children(graphic, drawingNamespace, "graphicData")[0];
    const chart = graphicData === undefined ? undefined : children(graphicData, chartNamespace, "chart")[0];
    if (chart === undefined) return [];
    const relationshipId = qualifiedAttr(chart, relationshipsNamespace, "id");
    if (relationshipId === undefined || relationshipId.length === 0) return [unsupportedFrame(anchor, undefined, undefined, "Chart graphic requires a relationship id.")];
    try {
      relationships ??= workbook.package.relationships(drawingPart.name);
      const relationship = relationships.get(relationshipId);
      const expectedType = `${relationshipsNamespace}/chart`;
      if (relationship === undefined || relationship.targetMode !== "Internal" || relationship.type !== expectedType) {
        return [unsupportedFrame(anchor, relationshipId, undefined, "Chart relationship must target an internal Chart part.")];
      }
      const chartPart = workbook.package.getPart(relationship.targetPartName);
      if (chartPart?.contentType !== CHART_CONTENT_TYPE) return [unsupportedFrame(anchor, relationshipId, chartPart?.name, "Chart relationship has an unsupported content type.")];
      try {
        return [Object.freeze({ anchor, relationshipId, partName: chartPart.name, model: parseOoxmlChart(workbook.package.readPart(chartPart), workbook.conformance) })];
      } catch (cause) {
        if (!(cause instanceof ChartParseError)) throw cause;
        return [unsupportedFrame(anchor, relationshipId, chartPart.name, cause.message)];
      }
    } catch (cause) {
      return [unsupportedFrame(anchor, relationshipId, undefined, cause instanceof Error ? cause.message : "Chart relationship is invalid.")];
    }
  }));
}

function unsupportedFrame(anchor: SpreadsheetDrawingAnchor, relationshipId: string | undefined, partName: PartName | undefined, reason: string): SpreadsheetChartFrame {
  return Object.freeze({
    anchor,
    relationshipId,
    partName,
    model: Object.freeze({ status: "unsupported", chartType: undefined, title: undefined, legend: undefined, reason }),
  });
}

/** Resolves an anchor into CSS pixels using the worksheet's current sparse geometry. */
export function spreadsheetDrawingBounds(
  anchor: SpreadsheetDrawingAnchor,
  rows: SparseAxisGeometry,
  columns: SparseAxisGeometry,
): SpreadsheetDrawingBounds {
  if (anchor.kind === "absolute") {
    return Object.freeze({
      x: emuToCssPixels(anchor.xEmu),
      y: emuToCssPixels(anchor.yEmu),
      width: emuToCssPixels(anchor.widthEmu),
      height: emuToCssPixels(anchor.heightEmu),
    });
  }
  const from = markerPosition(anchor.from, rows, columns);
  if (anchor.kind === "one-cell") {
    return Object.freeze({ ...from, width: emuToCssPixels(anchor.widthEmu), height: emuToCssPixels(anchor.heightEmu) });
  }
  const to = markerPosition(anchor.to, rows, columns);
  return Object.freeze({ x: from.x, y: from.y, width: Math.max(0, to.x - from.x), height: Math.max(0, to.y - from.y) });
}

/** ECMA-376 DrawingML uses 914,400 EMUs per inch; CSS uses 96 px per inch. */
export function emuToCssPixels(emu: number): number {
  if (!Number.isFinite(emu)) throw new RangeError("EMU coordinate must be finite.");
  return emu / 9_525;
}

function parseDrawingAnchors(root: LosslessXmlElement, namespace: string): readonly SpreadsheetDrawingAnchor[] {
  const anchors = root.children.flatMap((child): SpreadsheetDrawingAnchor[] => {
    if (child.kind !== "element" || child.namespaceUri !== namespace) return [];
    if (child.localName === "absoluteAnchor") {
      const position = exactlyOne(child, namespace, "pos", "absoluteAnchor");
      const extent = exactlyOne(child, namespace, "ext", "absoluteAnchor");
      return [Object.freeze({
        kind: "absolute",
        elementId: child.id,
        xEmu: coordinate(requiredAttr(position, "x", "absolute anchor x"), true, "absolute anchor x"),
        yEmu: coordinate(requiredAttr(position, "y", "absolute anchor y"), true, "absolute anchor y"),
        widthEmu: positiveCoordinate(requiredAttr(extent, "cx", "absolute anchor width"), "absolute anchor width"),
        heightEmu: positiveCoordinate(requiredAttr(extent, "cy", "absolute anchor height"), "absolute anchor height"),
      })];
    }
    if (child.localName === "oneCellAnchor") {
      const extent = exactlyOne(child, namespace, "ext", "oneCellAnchor");
      return [Object.freeze({
        kind: "one-cell",
        elementId: child.id,
        from: parseMarker(exactlyOne(child, namespace, "from", "oneCellAnchor"), namespace),
        widthEmu: positiveCoordinate(requiredAttr(extent, "cx", "one-cell anchor width"), "one-cell anchor width"),
        heightEmu: positiveCoordinate(requiredAttr(extent, "cy", "one-cell anchor height"), "one-cell anchor height"),
      })];
    }
    if (child.localName === "twoCellAnchor") {
      const rawEditAs = attr(child, "editAs") ?? "twoCell";
      if (rawEditAs !== "absolute" && rawEditAs !== "oneCell" && rawEditAs !== "twoCell") invalid(`twoCellAnchor editAs ${JSON.stringify(rawEditAs)} is invalid.`);
      return [Object.freeze({
        kind: "two-cell",
        elementId: child.id,
        from: parseMarker(exactlyOne(child, namespace, "from", "twoCellAnchor"), namespace),
        to: parseMarker(exactlyOne(child, namespace, "to", "twoCellAnchor"), namespace),
        editAs: rawEditAs,
      })];
    }
    return [];
  });
  if (anchors.length > MAX_DRAWING_ANCHORS) invalid(`Drawing exceeds ${MAX_DRAWING_ANCHORS} anchors.`);
  return Object.freeze(anchors);
}

function parseMarker(element: LosslessXmlElement, namespace: string): SpreadsheetDrawingMarker {
  return Object.freeze({
    column: gridIndex(textOf(exactlyOne(element, namespace, "col", "drawing marker")), 16_383, "drawing column"),
    row: gridIndex(textOf(exactlyOne(element, namespace, "row", "drawing marker")), 1_048_575, "drawing row"),
    columnOffsetEmu: coordinate(textOf(exactlyOne(element, namespace, "colOff", "drawing marker")), false, "drawing column offset"),
    rowOffsetEmu: coordinate(textOf(exactlyOne(element, namespace, "rowOff", "drawing marker")), false, "drawing row offset"),
  });
}

function markerPosition(marker: SpreadsheetDrawingMarker, rows: SparseAxisGeometry, columns: SparseAxisGeometry) {
  if (marker.column >= columns.count || marker.row >= rows.count) throw new RangeError("Drawing marker is outside the supplied sheet geometry.");
  return Object.freeze({
    x: columns.start(marker.column + 1) + emuToCssPixels(marker.columnOffsetEmu),
    y: rows.start(marker.row + 1) + emuToCssPixels(marker.rowOffsetEmu),
  });
}

function exactlyOne(parent: LosslessXmlElement, namespace: string, name: string, context: string): LosslessXmlElement {
  const matches = children(parent, namespace, name);
  if (matches.length !== 1) invalid(`${context} must contain exactly one ${name}.`);
  return matches[0]!;
}

function textOf(element: LosslessXmlElement): string {
  let text = "";
  for (const child of element.children) {
    if (child.kind === "text" || child.kind === "cdata") text += child.value;
  }
  return text.trim();
}

function requiredAttr(element: LosslessXmlElement, name: string, context: string): string {
  const value = attr(element, name);
  if (value === undefined) invalid(`${context} is required.`);
  return value;
}

function attr(element: LosslessXmlElement, name: string): string | undefined {
  return element.attributes.find((candidate) => candidate.namespaceUri === "" && candidate.localName === name)?.value;
}

function gridIndex(raw: string, maximum: number, context: string): number {
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) invalid(`${context} must be a valid zero-based grid index.`);
  return value;
}

function coordinate(raw: string, signed: boolean, context: string): number {
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || (!signed && value < 0)) invalid(`${context} must be ${signed ? "a" : "a non-negative"} safe integer.`);
  return value;
}

function positiveCoordinate(raw: string, context: string): number {
  const value = coordinate(raw, false, context);
  if (value <= 0) invalid(`${context} must be positive.`);
  return value;
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
