import { ChartParseError, parseOoxmlChart, type ChartModel } from "@tumblerjs/charts";
import { OOXML_NAMESPACES, type LosslessXmlDocument, type LosslessXmlElement } from "@tumblerjs/ooxml";
import { RelationshipsError, type OpcPackage, type OpcPart, type PartName, type Relationships } from "@tumblerjs/opc";
import { WordError, type WordConformance } from "./document.ts";

const MAX_DRAWINGS = 10_000;
const EMUS_PER_POINT = 12_700;
const CHART_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.drawingml.chart+xml";

export interface WordDrawingAnchor {
  readonly horizontalRelativeTo: string | undefined;
  readonly verticalRelativeTo: string | undefined;
  readonly horizontalOffsetPoints: number | undefined;
  readonly verticalOffsetPoints: number | undefined;
  readonly wrap: "none" | "square" | "tight" | "through" | "top-bottom";
  readonly behindDocument: boolean;
  readonly allowOverlap: boolean;
  readonly distanceTopPoints: number;
  readonly distanceEndPoints: number;
  readonly distanceBottomPoints: number;
  readonly distanceStartPoints: number;
}

export type WordDrawing = WordImageDrawing | WordChartDrawing | WordUnsupportedDrawing;

interface WordDrawingBase {
  readonly elementId: number;
  readonly placement: "inline" | "anchor";
  readonly widthPoints: number;
  readonly heightPoints: number;
  readonly name: string | undefined;
  readonly altText: string | undefined;
  readonly anchor: WordDrawingAnchor | undefined;
}

export interface WordImageDrawing extends WordDrawingBase {
  readonly kind: "image";
  readonly relationshipId: string;
  readonly partName: PartName;
  readonly contentType: string;
  readonly bytes: Uint8Array;
}

export interface WordChartDrawing extends WordDrawingBase {
  readonly kind: "chart";
  readonly relationshipId: string;
  readonly partName: PartName;
  readonly model: ChartModel;
}

export interface WordUnsupportedDrawing extends WordDrawingBase {
  readonly kind: "unsupported";
  readonly reason: string;
}

/** Discovers Word drawing placement and resolves only internal image/chart relationships. */
export function readWordDrawings(input: {
  readonly package: OpcPackage;
  readonly part: OpcPart;
  readonly source: LosslessXmlDocument;
  readonly conformance: WordConformance;
}): ReadonlyMap<number, WordDrawing> {
  const word = OOXML_NAMESPACES[input.conformance].wordprocessing;
  const elements = input.source.elements(word, "drawing");
  if (elements.length > MAX_DRAWINGS) throw new WordError("limit_exceeded", `Document exceeds ${MAX_DRAWINGS} drawings.`);
  let relationships: Relationships | undefined;
  try { relationships = input.package.relationships(input.part.name); }
  catch (cause) { if (!(cause instanceof RelationshipsError) || cause.code !== "missing_item") throw cause; }
  return new Map(elements.map((element) => [element.id, parseDrawing(input, element, relationships)]));
}

function parseDrawing(
  input: { readonly package: OpcPackage; readonly source: LosslessXmlDocument; readonly conformance: WordConformance },
  drawing: LosslessXmlElement,
  relationships: Relationships | undefined,
): WordDrawing {
  const wp = wordDrawingNamespace(input.conformance);
  const placements = drawing.children.filter((child): child is LosslessXmlElement => child.kind === "element" && child.namespaceUri === wp && (child.localName === "inline" || child.localName === "anchor"));
  if (placements.length !== 1) return unsupported(drawing.id, "inline", 12, 12, undefined, undefined, undefined, "A drawing must contain exactly one inline or anchor placement.");
  const placementElement = placements[0]!;
  const placement = placementElement.localName === "anchor" ? "anchor" : "inline";
  const extent = child(placementElement, wp, "extent");
  const widthPoints = emu(attribute(extent, "cx") ?? "0", "drawing width");
  const heightPoints = emu(attribute(extent, "cy") ?? "0", "drawing height");
  const docProperties = child(placementElement, wp, "docPr");
  const name = attribute(docProperties, "name");
  const altText = attribute(docProperties, "descr") ?? attribute(docProperties, "title");
  const anchor = placement === "anchor" ? parseAnchor(placementElement, wp) : undefined;
  const drawingNs = OOXML_NAMESPACES[input.conformance].drawing;
  const chartNs = OOXML_NAMESPACES[input.conformance].chart;
  const graphicData = descendants(placementElement).find((element) => element.namespaceUri === drawingNs && element.localName === "graphicData");
  if (graphicData === undefined) return unsupported(drawing.id, placement, widthPoints, heightPoints, name, altText, anchor, "Drawing graphicData is missing.");
  const relationshipNs = input.conformance === "strict" ? "http://purl.oclc.org/ooxml/officeDocument/relationships" : "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const chart = descendants(graphicData).find((element) => element.namespaceUri === chartNs && element.localName === "chart");
  if (chart !== undefined) {
    const id = namespacedAttribute(chart, relationshipNs, "id");
    if (id === undefined) return unsupported(drawing.id, placement, widthPoints, heightPoints, name, altText, anchor, "Chart drawing has no relationship id.");
    const relationship = relationships?.get(id);
    if (relationship?.targetMode !== "Internal" || relationship.type !== `${relationshipNs}/chart`) return unsupported(drawing.id, placement, widthPoints, heightPoints, name, altText, anchor, "Chart drawing must target an internal Chart part.");
    const part = input.package.getPart(relationship.targetPartName);
    if (part?.contentType !== CHART_CONTENT_TYPE) return unsupported(drawing.id, placement, widthPoints, heightPoints, name, altText, anchor, "Chart relationship target has the wrong content type.");
    try {
      return Object.freeze({ kind: "chart", elementId: drawing.id, placement, widthPoints, heightPoints, name, altText, anchor, relationshipId: id, partName: part.name, model: parseOoxmlChart(input.package.readPart(part), input.conformance) });
    } catch (cause) {
      if (!(cause instanceof ChartParseError)) throw cause;
      return unsupported(drawing.id, placement, widthPoints, heightPoints, name, altText, anchor, cause.message);
    }
  }
  const blip = descendants(graphicData).find((element) => element.namespaceUri === drawingNs && element.localName === "blip");
  const id = blip === undefined ? undefined : namespacedAttribute(blip, relationshipNs, "embed");
  if (id === undefined) return unsupported(drawing.id, placement, widthPoints, heightPoints, name, altText, anchor, "Drawing is not a supported embedded image or chart.");
  const relationship = relationships?.get(id);
  if (relationship?.targetMode !== "Internal" || relationship.type !== `${relationshipNs}/image`) return unsupported(drawing.id, placement, widthPoints, heightPoints, name, altText, anchor, "Images must target internal Image parts.");
  const part = input.package.getPart(relationship.targetPartName);
  if (part === undefined || !part.contentType.startsWith("image/")) return unsupported(drawing.id, placement, widthPoints, heightPoints, name, altText, anchor, "Image relationship target has the wrong content type.");
  return Object.freeze({ kind: "image", elementId: drawing.id, placement, widthPoints, heightPoints, name, altText, anchor, relationshipId: id, partName: part.name, contentType: part.contentType, bytes: input.package.readPart(part) });
}

function parseAnchor(element: LosslessXmlElement, wp: string): WordDrawingAnchor {
  const horizontal = child(element, wp, "positionH");
  const vertical = child(element, wp, "positionV");
  const wrapElement = element.children.find((candidate): candidate is LosslessXmlElement => candidate.kind === "element" && candidate.namespaceUri === wp && candidate.localName.startsWith("wrap"));
  const wrap = wrapElement?.localName === "wrapSquare" ? "square" : wrapElement?.localName === "wrapTight" ? "tight" : wrapElement?.localName === "wrapThrough" ? "through" : wrapElement?.localName === "wrapTopAndBottom" ? "top-bottom" : "none";
  return Object.freeze({
    horizontalRelativeTo: attribute(horizontal, "relativeFrom"),
    verticalRelativeTo: attribute(vertical, "relativeFrom"),
    horizontalOffsetPoints: offsetChild(horizontal, wp),
    verticalOffsetPoints: offsetChild(vertical, wp),
    wrap,
    behindDocument: onOff(attribute(element, "behindDoc"), false),
    allowOverlap: onOff(attribute(element, "allowOverlap"), true),
    distanceTopPoints: emu(attribute(element, "distT") ?? "0", "anchor top distance"),
    distanceEndPoints: emu(attribute(element, "distR") ?? "0", "anchor end distance"),
    distanceBottomPoints: emu(attribute(element, "distB") ?? "0", "anchor bottom distance"),
    distanceStartPoints: emu(attribute(element, "distL") ?? "0", "anchor start distance"),
  });
}

function offsetChild(element: LosslessXmlElement | undefined, wp: string): number | undefined {
  const offset = element === undefined ? undefined : child(element, wp, "posOffset");
  if (offset === undefined) return undefined;
  const text = offset.children.map((item) => item.kind === "text" ? item.value : "").join("");
  return signedEmu(text, "drawing position");
}

function unsupported(elementId: number, placement: "inline" | "anchor", widthPoints: number, heightPoints: number, name: string | undefined, altText: string | undefined, anchor: WordDrawingAnchor | undefined, reason: string): WordUnsupportedDrawing {
  return Object.freeze({ kind: "unsupported", elementId, placement, widthPoints, heightPoints, name, altText, anchor, reason });
}

function wordDrawingNamespace(conformance: WordConformance): string { return conformance === "strict" ? "http://purl.oclc.org/ooxml/drawingml/wordprocessingDrawing" : "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"; }
function child(element: LosslessXmlElement | undefined, ns: string, name: string): LosslessXmlElement | undefined { return element?.children.find((item): item is LosslessXmlElement => item.kind === "element" && item.namespaceUri === ns && item.localName === name); }
function descendants(element: LosslessXmlElement): LosslessXmlElement[] { const result: LosslessXmlElement[] = []; for (const child of element.children) if (child.kind === "element") { result.push(child, ...descendants(child)); } return result; }
function attribute(element: LosslessXmlElement | undefined, name: string): string | undefined { return element?.attributes.find((item) => item.namespaceUri === "" && item.localName === name)?.value; }
function namespacedAttribute(element: LosslessXmlElement, ns: string, name: string): string | undefined { return element.attributes.find((item) => item.namespaceUri === ns && item.localName === name)?.value; }
function emu(raw: string, label: string): number { if (!/^[0-9]+$/.test(raw)) throw new WordError("invalid_document", `${label} must be a non-negative EMU measurement.`); const value = Number(raw); if (!Number.isSafeInteger(value)) throw new WordError("invalid_document", `${label} is outside the supported range.`); return value / EMUS_PER_POINT; }
function signedEmu(raw: string, label: string): number { if (!/^-?[0-9]+$/.test(raw)) throw new WordError("invalid_document", `${label} must be an EMU measurement.`); const value = Number(raw); if (!Number.isSafeInteger(value)) throw new WordError("invalid_document", `${label} is outside the supported range.`); return value / EMUS_PER_POINT; }
function onOff(raw: string | undefined, fallback: boolean): boolean { return raw === undefined ? fallback : raw !== "0" && raw !== "false" && raw !== "off"; }
