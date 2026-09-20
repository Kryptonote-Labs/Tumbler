import { ChartParseError, parseOoxmlChart, type ChartModel } from "@tumblerjs/charts";
import { beginLosslessXmlEdit, OOXML_NAMESPACES, type LosslessXmlDocument, type LosslessXmlElement } from "@tumblerjs/ooxml";
import { beginPackageTransaction, RelationshipsError, type OpcPackage, type OpcPart, type PartName, type Relationships } from "@tumblerjs/opc";
import { WordError, type WordDocument, type WordConformance } from "./document.ts";

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


export interface WordDrawingResize {
  readonly elementId: number;
  readonly widthPoints: number;
  readonly heightPoints: number;
}

/** Update drawing geometry without replacing its image, chart, or surrounding document XML. */
export function resizeWordDrawing(document: WordDocument, size: WordDrawingResize): Uint8Array {
  const cx = Math.round(size.widthPoints * EMUS_PER_POINT);
  const cy = Math.round(size.heightPoints * EMUS_PER_POINT);
  if (![cx, cy].every(value => Number.isSafeInteger(value) && value > 0)) throw new RangeError("Drawing dimensions must be positive finite sizes.");
  const drawing = document.drawings.get(size.elementId);
  const element = document.source.element(size.elementId);
  if (drawing === undefined || element === undefined || drawing.kind === "unsupported") throw new WordError("invalid_document", "Drawing cannot be resized.");
  if (cx === Math.round(drawing.widthPoints * EMUS_PER_POINT) && cy === Math.round(drawing.heightPoints * EMUS_PER_POINT)) return document.bytes();
  const wp = wordDrawingNamespace(document.conformance);
  const extent = descendants(element).find(item => item.namespaceUri === wp && item.localName === "extent");
  if (extent === undefined) throw new WordError("invalid_document", "Drawing extent is missing.");
  const editor = beginLosslessXmlEdit(document.source);
  function updateExtent(target: LosslessXmlElement) {
    for (const [name, value] of [["cx", cx], ["cy", cy]] as const) {
      const attribute = target.attributes.find(item => item.localName === name && !item.namespaceUri);
      if (attribute === undefined) throw new WordError("invalid_document", `Drawing ${name} is missing.`);
      editor.setAttribute(attribute, String(value));
    }
  }
  updateExtent(extent);
  for (const transform of descendants(element).filter(item => item.namespaceUri === OOXML_NAMESPACES[document.conformance].drawing && item.localName === "xfrm")) {
    const innerExtent = child(transform, transform.namespaceUri, "ext");
    if (innerExtent !== undefined) updateExtent(innerExtent);
  }
  const transaction = beginPackageTransaction(document.package);
  transaction.replacePart(document.part.name, editor.commit().bytes);
  return transaction.commit();
}

export interface WordDrawingChange extends WordDrawingResize {
  readonly layout?: 'inline' | 'front' | 'behind';
  /** Destination in the text flow; does not convert the drawing to a floating object. */
  readonly inlinePosition?: import('./text.ts').WordTextPosition;
  /** Page-relative coordinates for floating drawings. */
  readonly xPoints?: number;
  readonly yPoints?: number;
}

/** Change wrapping and page-relative placement, preserving the embedded graphic. */
export function positionWordDrawing(document: WordDocument, change: WordDrawingChange): Uint8Array {
  if (change.layout === undefined) return document.bytes();
  if (!['inline', 'front', 'behind'].includes(change.layout)) throw new RangeError('Unknown drawing layout.');
  const drawing = document.drawings.get(change.elementId);
  const element = document.source.element(change.elementId);
  if (drawing === undefined || element === undefined || drawing.kind === 'unsupported') throw new WordError('invalid_document', 'Drawing cannot be positioned.');
  const wp = wordDrawingNamespace(document.conformance);
  const placement = element.children.find((item): item is LosslessXmlElement => item.kind === 'element' && item.namespaceUri === wp && (item.localName === 'inline' || item.localName === 'anchor'));
  if (placement === undefined) throw new WordError('invalid_document', 'Drawing placement is missing.');
  const prefix = placement.qualified.includes(':') ? placement.qualified.slice(0, placement.qualified.indexOf(':') + 1) : '';
  const raw = (item: { span: { start: number; end: number } }) => document.source.source.slice(item.span.start, item.span.end);
  const namespaces = placement.attributes.filter(attribute => attribute.namespaceUri !== '').map(raw).join(' ');
  const children = placement.children.filter((item): item is LosslessXmlElement => item.kind === 'element');
  const extent = children.find(item => item.namespaceUri === wp && item.localName === 'extent');
  if (extent === undefined) throw new WordError('invalid_document', 'Drawing extent is missing.');
  const effect = children.find(item => item.namespaceUri === wp && item.localName === 'effectExtent');
  const retained = children.filter(item => item.namespaceUri !== wp || !['simplePos', 'positionH', 'positionV', 'extent', 'effectExtent', 'wrapNone', 'wrapSquare', 'wrapTight', 'wrapThrough', 'wrapTopAndBottom'].includes(item.localName)).map(raw).join('');
  let markup: string;
  if (change.layout === 'inline') {
    markup = `<${prefix}inline ${namespaces}>${raw(extent)}${effect === undefined ? '' : raw(effect)}${retained}</${prefix}inline>`;
  } else {
    const x = Math.round((change.xPoints ?? 0) * EMUS_PER_POINT);
    const y = Math.round((change.yPoints ?? 0) * EMUS_PER_POINT);
    if (![x, y].every(value => Number.isSafeInteger(value) && value >= 0 && value <= 2147483647)) throw new RangeError('Drawing position must be a non-negative page coordinate.');
    const positionH = `<${prefix}positionH relativeFrom="page"><${prefix}posOffset>${x}</${prefix}posOffset></${prefix}positionH>`;
    const positionV = `<${prefix}positionV relativeFrom="page"><${prefix}posOffset>${y}</${prefix}posOffset></${prefix}positionV>`;
    if (drawing.placement === 'anchor' && change.layout === (drawing.anchor?.behindDocument ? 'behind' : 'front')) {
      // Movement preserves authored wrapping, overlap, distances, and stacking order.
      const editor = beginLosslessXmlEdit(document.source);
      for (const [name, replacement] of [['positionH', positionH], ['positionV', positionV]] as const) {
        const existing = children.find(item => item.namespaceUri === wp && item.localName === name);
        if (existing !== undefined) editor.replaceElementMarkup(existing, replacement);
        else editor.insertMarkupBefore(extent, replacement);
      }
      const simple = placement.attributes.find(attribute => attribute.localName === 'simplePos');
      if (simple !== undefined) editor.setAttribute(simple, '0');
      const transaction = beginPackageTransaction(document.package);
      transaction.replacePart(document.part.name, editor.commit().bytes);
      return transaction.commit();
    }
    markup = `<${prefix}anchor ${namespaces} distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="0" behindDoc="${change.layout === 'behind' ? 1 : 0}" locked="0" layoutInCell="1" allowOverlap="1"><${prefix}simplePos x="0" y="0"/><${prefix}positionH relativeFrom="page"><${prefix}posOffset>${x}</${prefix}posOffset></${prefix}positionH><${prefix}positionV relativeFrom="page"><${prefix}posOffset>${y}</${prefix}posOffset></${prefix}positionV>${raw(extent)}${effect === undefined ? '' : raw(effect)}<${prefix}wrapNone/>${retained}</${prefix}anchor>`;
  }
  const editor = beginLosslessXmlEdit(document.source);
  editor.replaceElementMarkup(placement, markup);
  const transaction = beginPackageTransaction(document.package);
  transaction.replacePart(document.part.name, editor.commit().bytes);
  return transaction.commit();
}
