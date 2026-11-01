import { readWordPictureGeometry, type WordPictureGeometry } from './picture-geometry.ts';
import { inkFrame, resizeWordInk, positionWordInk } from './ink-geometry.ts';
import { wordInkChoice } from './ink-fallback.ts';
import { readWordInkDrawing } from './ink.ts';
import { isWordDrawingPosition, type WordDrawingPosition } from './drawing-placement.ts';
import { readShapeText, type ShapeTextFormats } from './shape-text-import.ts';
import { wordThemeSlot } from './theme-colour-xml.ts';
import { DEFAULT_WORD_THEME, resolveWordColour, type WordColour, type WordThemeColour } from './theme-colours.ts';
import { THEME_COLOR_SLOTS, parseThemeColorScheme, type ThemeColorScheme } from '@tumblerjs/ooxml';
import { readWordShapeTextInsets } from './shape-text-insets.ts';
import { isWordAuthoredShape } from './shapes.ts';
import { ChartParseError, parseOoxmlChart, type ChartModel } from "@tumblerjs/charts";
import { beginLosslessXmlEdit, OOXML_NAMESPACES, type LosslessXmlDocument, type LosslessXmlElement } from "@tumblerjs/ooxml";
import { beginPackageTransaction, RelationshipsError, type OpcPackage, type OpcPart, type PartName, type Relationships } from "@tumblerjs/opc";
import { WordError, type WordDocument, type WordConformance } from "./document.ts";

const EMUS_PER_POINT = 12_700;
const CHART_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.drawingml.chart+xml";

export interface WordDrawingAnchor {
  readonly horizontalAlignment?: "left" | "center" | "right" | "inside" | "outside";
  readonly horizontalRelativeTo: string | undefined;
  readonly verticalRelativeTo: string | undefined;
  readonly horizontalOffsetPoints: number | undefined;
  readonly verticalOffsetPoints: number | undefined;
  readonly wrap: "none" | "square" | "tight" | "through" | "top-bottom";
  readonly behindDocument: boolean;
  readonly zOrder?: number;
  readonly allowOverlap: boolean;
  readonly layoutInCell?: boolean;
  readonly distanceTopPoints: number;
  readonly distanceEndPoints: number;
  readonly distanceBottomPoints: number;
  readonly distanceStartPoints: number;
}

export type WordDrawing = WordImageDrawing | WordChartDrawing | WordShapeDrawing | WordUnsupportedDrawing;

interface WordDrawingBase {
  /** Decoded Office ink, including diagnostics; the original package part remains authoritative. */
  readonly ink?: import('@tumblerjs/ink').OfficeInkDocument;
  readonly inkSource?: { readonly partName: PartName; readonly relationshipId: string };
  /** Native ink-to-drawing transform and painted bounds, shared by vector and raster hosts. */
  readonly inkProjection?: { readonly matrix: import('./ink-transform.ts').InkMatrix; readonly bounds: import('@tumblerjs/ink').InkBounds; readonly options?: import('@tumblerjs/ink').InkSvgOptions };
  readonly inkRenderingDiagnostics?: readonly import('@tumblerjs/ink').InkDiagnostic[];
  readonly elementId: number;
  readonly placement: "inline" | "anchor";
  readonly widthPoints: number;
  readonly heightPoints: number;
  readonly name: string | undefined;
  readonly altText: string | undefined;
  readonly anchor: WordDrawingAnchor | undefined;
}

export interface WordShapeDrawing extends WordDrawingBase { readonly kind: 'shape'; readonly shape: import('./shapes.ts').WordAuthoredShape; }

export interface WordImageDrawing extends WordDrawingBase {
  readonly kind: "image";
  readonly picture?: WordPictureGeometry;
  /** An ink display projection. Preserve the original part rather than editing only its preview. */
  readonly fallback?: "ink";
  readonly inkRendering?: 'bitmap' | 'vector' | 'raster';
  readonly relationshipId: string | undefined;
  /** Stored image bytes, absent for generated previews. See inkSource for the native ink part. */
  readonly partName: PartName | undefined;
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
  readonly styles?: import('./styles.ts').WordStyles;
  readonly numbering?: import('./numbering.ts').WordNumbering;
  readonly inkRendering?: import('@tumblerjs/ink').InkSvgOptions | undefined;
  readonly themeFonts?: import("@tumblerjs/ooxml").ThemeFontScheme | undefined;
  readonly themeColours?: ThemeColorScheme | undefined;
  readonly package: OpcPackage;
  readonly part: OpcPart;
  readonly source: LosslessXmlDocument;
  readonly conformance: WordConformance;
}): ReadonlyMap<number, WordDrawing> {
  const word = OOXML_NAMESPACES[input.conformance].wordprocessing;
  const elements = input.source.elements(word, "drawing");
  let relationships: Relationships | undefined;
  try { relationships = input.package.relationships(input.part.name); }
  catch (cause) { if (!(cause instanceof RelationshipsError) || cause.code !== "missing_item") throw cause; }
  // Parsed models are immutable; repeated chart frames can share them for this import.
  const themeRel = relationships?.items.find(rel => /\/theme$/.test(rel.type) && rel.targetMode === 'Internal');
  const theme = input.themeColours ?? (themeRel?.targetMode === 'Internal' ? parseThemeColorScheme(input.package.readPart(input.package.getPart(themeRel.targetPartName)!)) : DEFAULT_WORD_THEME);
  const charts = new Map<string, ChartModel>();
  // Reuse document formats, or resolve them lazily once for this story.
  const shapeFormats: ShapeTextFormats = { styles: input.styles, numbering: input.numbering };
  const result = new Map(elements.map((element) => [element.id, parseDrawing(input, element, relationships, charts, theme, shapeFormats, input.themeFonts)]));
  for (const element of input.source.elements('http://schemas.openxmlformats.org/markup-compatibility/2006', 'AlternateContent')) {
    const choice = wordInkChoice(element);
    const original = choice && result.get(choice.id);
    if (!original || !choice) continue;
    result.delete(choice.id);
    result.set(element.id, readWordInkDrawing(element, original, input.package, relationships, input.inkRendering));
  }
  for (const element of elements) {
    const original = result.get(element.id);
    if (original?.kind === 'unsupported') result.set(element.id, readWordInkDrawing(element, original, input.package, relationships, input.inkRendering));
  }
  return result;
}

function parseDrawing(
  input: { readonly package: OpcPackage; readonly part: OpcPart; readonly source: LosslessXmlDocument; readonly conformance: WordConformance },
  drawing: LosslessXmlElement,
  relationships: Relationships | undefined,
  charts: Map<string, ChartModel>,
  theme: ThemeColorScheme,
  shapeFormats: ShapeTextFormats,
  fonts?: import("@tumblerjs/ooxml").ThemeFontScheme,
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
  const shapeNode = graphicData.children.find((element): element is LosslessXmlElement => element.kind === 'element' && element.localName === 'wsp' && element.namespaceUri === 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape');
  if (shapeNode) {
    const nodes = descendants(shapeNode);
    const props = nodes.find(element => element.localName === 'spPr');
    const geometry = props && descendants(props).find(element => element.localName === 'prstGeom');
    const preset = attribute(geometry, 'prst');
    const adjustments = geometry ? descendants(geometry).filter(node => node.localName === 'gd') : [];
    const radiusFormula = adjustments.length === 1 && attribute(adjustments[0], 'name') === 'adj'
      ? attribute(adjustments[0], 'fmla')?.trim().match(/^val\s+([+-]?\d+)$/) : undefined;
    const radiusAdjustment = radiusFormula ? Number(radiusFormula[1]) : undefined;
    const supportedRadius = preset === 'roundRect' && radiusAdjustment !== undefined && Number.isSafeInteger(radiusAdjustment);
    // Keep complex imported drawings opaque until their complete appearance is modeled.
    const transform = props && descendants(props).find(element => element.localName === 'xfrm');
    const unsupportedLuminance = nodes.some(node => {
      if (node.localName !== 'schemeClr') return false;
      const transforms = node.children.filter((n): n is LosslessXmlElement => n.kind === 'element');
      const mod = Number(attribute(transforms.find(n => n.localName === 'lumMod'), 'val') ?? 100000);
      const off = Number(attribute(transforms.find(n => n.localName === 'lumOff'), 'val') ?? 0);
      return !Number.isFinite(mod) || !Number.isFinite(off) || mod < 0 || off < 0 || mod > 100000 || off > 100000 || off !== 0 && Math.abs(mod + off - 100000) > 1 || transforms.length > new Set(transforms.map(n => n.localName)).size;
    });
    if (unsupportedLuminance || nodes.some(node => node.localName === 'schemeClr' && (!wordThemeSlot(attribute(node, 'val') ?? '') || node.children.some(c => c.kind === 'element' && !['lumMod', 'lumOff'].includes(c.localName)))) || nodes.some(node => ['gradFill', 'pattFill', 'blipFill', 'alpha', 'style', 'effectLst', 'effectDag'].includes(node.localName)) ||
      ['rot', 'flipH', 'flipV'].some(name => attribute(transform, name) !== undefined) ||
      adjustments.length > 0 && !supportedRadius ||
      anchor && anchor.wrap !== 'none')
      return unsupported(drawing.id, placement, widthPoints, heightPoints, name, altText, anchor, 'This shape uses appearance or wrapping properties that are retained in the source document.');
    const color = (parent: LosslessXmlElement | undefined): WordColour => {
      if (!parent) return 'none';
      const fill = parent.children.find((n): n is LosslessXmlElement => n.kind === 'element' && n.localName === 'solidFill');
      const rgb = fill && descendants(fill).find(n => n.localName === 'srgbClr');
      const scheme = fill && descendants(fill).find(n => n.localName === 'schemeClr');
      if (scheme) {
        const slot = wordThemeSlot(attribute(scheme, 'val') ?? '');
        if (!slot) throw new WordError('invalid_document', 'Unsupported shape theme colour.');
        const transforms = scheme.children.filter((n): n is LosslessXmlElement => n.kind === 'element');
        const mod = Number(attribute(transforms.find(n => n.localName === 'lumMod'), 'val') ?? 100000) / 100000;
        const off = Number(attribute(transforms.find(n => n.localName === 'lumOff'), 'val') ?? 0) / 100000;
        const tint = Math.round((1 - off) * 255);
        const shade = Math.round((1 - off === 0 ? 1 : mod / (1 - off)) * 255);
        const reference: WordThemeColour = { theme: slot, fallback: '#' + (theme.color(slot) ?? '000000'), ...(off === 0 ? {} : { tint }), ...(shade === 255 ? {} : { shade }) };
        return { ...reference, fallback: resolveWordColour(reference, theme) };
      }
      return rgb ? `#${attribute(rgb, 'val')}` : 'none';
    };
    const line = props && child(props, drawingNs, 'ln');
    const text = nodes.filter(n => n.namespaceUri === OOXML_NAMESPACES[input.conformance].wordprocessing && n.localName === 'p').map(p => descendants(p).filter(n => n.localName === 't').map(n => n.children.filter(c => c.kind === 'text').map(c => c.kind === 'text' ? c.value : '').join('')).join('')).join('\n');
    const box = nodes.find(n => n.localName === 'txbxContent');
    const textBody = box ? readShapeText(input, box, OOXML_NAMESPACES[input.conformance].wordprocessing, shapeFormats) : undefined;
    if (box && !textBody) return unsupported(drawing.id, placement, widthPoints, heightPoints, name, altText, anchor, 'This text box contains structures retained in the source document.');
    const body = nodes.find(n => n.localName === 'bodyPr');
    const textInsets = readWordShapeTextInsets(name => attribute(body, name));
    const textAnchor = attribute(body, 'anchor') === 'ctr' ? 'center' : attribute(body, 'anchor') === 'b' ? 'bottom' : 'top';
    const shape = { preset, ...(supportedRadius ? { cornerRadius: Math.min(widthPoints, heightPoints) * Math.min(50000, Math.max(0, radiusAdjustment!)) / 100000 } : {}), textAnchor, ...(textInsets ? { textInsets } : {}), ...(textBody ? { textBody } : {}), width: widthPoints, height: heightPoints, fill: color(props), outline: color(line), outlineWidth: Number(attribute(line, 'w') ?? 0) / EMUS_PER_POINT, ...(text ? { text } : {}), ...(altText ? { alt: altText } : {}), layout: placement === 'inline' ? 'inline' : anchor?.behindDocument ? 'behind' : 'front', ...(anchor ? { x: anchor.horizontalOffsetPoints ?? 0, y: anchor.verticalOffsetPoints ?? 0, moveWithText: anchor.verticalRelativeTo !== 'page', ...(anchor.horizontalRelativeTo === 'page' || anchor.horizontalRelativeTo === 'column' ? { horizontalRelativeTo: anchor.horizontalRelativeTo } : {}), ...(['page', 'line', 'paragraph'].includes(anchor.verticalRelativeTo ?? '') ? { verticalRelativeTo: anchor.verticalRelativeTo } : {}) } : {}) };
    if (isWordAuthoredShape(shape)) return { kind: 'shape', elementId: drawing.id, placement, widthPoints, heightPoints, name, altText, anchor, shape };
  }
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
      let model = charts.get(part.name.equivalenceKey);
      if (model === undefined) {
        const parsed = parseOoxmlChart(input.package.readPart(part), input.conformance);
        const themeColors = Object.fromEntries(THEME_COLOR_SLOTS.flatMap(slot => {
          const value = theme.color(slot);
          return value === undefined ? [] : [[slot, `#${value}`]];
        }));
        for (const [alias, slot] of Object.entries({ bg1: "lt1", tx1: "dk1", bg2: "lt2", tx2: "dk2" })) {
          if (themeColors[slot] !== undefined) themeColors[alias] = themeColors[slot]!;
        }
        const themeFonts = Object.fromEntries((["major", "minor"] as const).flatMap(role => {
          const typeface = fonts?.typeface(role, "latin");
          return typeface ? [[role === "major" ? "+mj-lt" : "+mn-lt", typeface]] : [];
        }));
        model = Object.freeze({ ...parsed, themeColors: Object.freeze(themeColors), themeFonts: Object.freeze(themeFonts) });
        charts.set(part.name.equivalenceKey, model);
      }
      return Object.freeze({ kind: "chart", elementId: drawing.id, placement, widthPoints, heightPoints, name, altText, anchor, relationshipId: id, partName: part.name, model });
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
  const picture = readWordPictureGeometry(graphicData, drawingNs, widthPoints, heightPoints);
  if (typeof picture === 'string') return unsupported(drawing.id, placement, widthPoints, heightPoints, name, altText, anchor, picture);
  return Object.freeze({ kind: "image", ...(picture ? { picture } : {}), elementId: drawing.id, placement, widthPoints, heightPoints, name, altText, anchor, relationshipId: id, partName: part.name, contentType: part.contentType, bytes: input.package.readPart(part) });
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
    ...horizontalAlignment(horizontal, wp),
    verticalOffsetPoints: offsetChild(vertical, wp),
    wrap,
    behindDocument: onOff(attribute(element, "behindDoc"), false),
    ...(Number(attribute(element, "relativeHeight") ?? 0) ? { zOrder: Number(attribute(element, "relativeHeight")) } : {}),
    layoutInCell: onOff(attribute(element, "layoutInCell"), true),
    allowOverlap: onOff(attribute(element, "allowOverlap"), true),
    distanceTopPoints: emu(attribute(element, "distT") ?? "0", "anchor top distance"),
    distanceEndPoints: emu(attribute(element, "distR") ?? "0", "anchor end distance"),
    distanceBottomPoints: emu(attribute(element, "distB") ?? "0", "anchor bottom distance"),
    distanceStartPoints: emu(attribute(element, "distL") ?? "0", "anchor start distance"),
  });
}

function horizontalAlignment(element: LosslessXmlElement | undefined, wp: string): Pick<WordDrawingAnchor, 'horizontalAlignment'> {
  const align = child(element, wp, 'align');
  const value = align?.children.map(n => n.kind === 'text' ? n.value : '').join('').trim();
  return value === 'left' || value === 'center' || value === 'right' || value === 'inside' || value === 'outside' ? { horizontalAlignment: value } : {};
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
  if (drawing.kind === 'image' && drawing.fallback === 'ink') return resizeWordInk(document, element, drawing, size);
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

export interface WordDrawingChange extends WordDrawingResize, Pick<WordDrawingPosition, 'layout' | 'wrap' | 'horizontalRelativeTo' | 'verticalRelativeTo'> {
  /** Destination in the text flow; does not convert the drawing to a floating object. */
  readonly inlinePosition?: import('./text.ts').WordTextPosition;
  /** Coordinates in the specified bases, defaulting to the page. */
  readonly xPoints?: number;
  readonly yPoints?: number;
}

/** New text for a shape edited in place. `escape` means the user left text editing but kept the shape selected. */
export interface WordShapeTextChange {
  readonly elementId: number;
  readonly text: string;
  readonly reason: 'blur' | 'escape' | 'input';
  readonly textBody?: readonly import('./create.ts').WordTextParagraph[];
}

/** Change wrapping and coordinate bases, preserving the embedded graphic. */
export function positionWordDrawing(document: WordDocument, change: WordDrawingChange): Uint8Array {
  if (change.layout === undefined) return document.bytes();
  if (!isWordDrawingPosition(change)) throw new TypeError('Invalid drawing coordinate base.');
  if (!['inline', 'front', 'behind'].includes(change.layout)) throw new RangeError('Unknown drawing layout.');
  const drawing = document.drawings.get(change.elementId);
  const element = document.source.element(change.elementId);
  if (drawing === undefined || element === undefined || drawing.kind === 'unsupported') throw new WordError('invalid_document', 'Drawing cannot be positioned.');
  const editor = beginLosslessXmlEdit(document.source);
  if (drawing.kind === 'image' && drawing.fallback === 'ink') change = positionWordInk(editor, element, drawing, change);
  const wp = wordDrawingNamespace(document.conformance);
  const placement = inkFrame(element).children.find((item): item is LosslessXmlElement => item.kind === 'element' && item.namespaceUri === wp && (item.localName === 'inline' || item.localName === 'anchor'));
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
    // OOXML ST_PositionOffset is a signed 32-bit EMU value, independent of page bounds.
    if (![x, y].every(value => Number.isSafeInteger(value) && value >= -2147483648 && value <= 2147483647)) throw new RangeError('Drawing position must fit a signed 32-bit EMU offset.');
    const positionH = `<${prefix}positionH relativeFrom="${change.horizontalRelativeTo ?? 'page'}"><${prefix}posOffset>${x}</${prefix}posOffset></${prefix}positionH>`;
    const positionV = `<${prefix}positionV relativeFrom="${change.verticalRelativeTo ?? 'page'}"><${prefix}posOffset>${y}</${prefix}posOffset></${prefix}positionV>`;
    if (drawing.placement === 'anchor' && change.layout === (drawing.anchor?.behindDocument ? 'behind' : 'front')) {
      // Movement preserves authored wrapping, overlap, distances, and stacking order.
      for (const [name, replacement] of [['positionH', positionH], ['positionV', positionV]] as const) {
        const existing = children.find(item => item.namespaceUri === wp && item.localName === name);
        if (existing !== undefined) editor.replaceElementMarkup(existing, replacement);
        else editor.insertMarkupBefore(extent, replacement);
      }
      if (change.wrap === 'none') {
        const wrapping = children.find(item => item.namespaceUri === wp && item.localName.startsWith('wrap'));
        if (wrapping) editor.replaceElementMarkup(wrapping, `<${prefix}wrapNone/>`);
      }
      const simple = placement.attributes.find(attribute => attribute.localName === 'simplePos');
      if (simple !== undefined) editor.setAttribute(simple, '0');
      const transaction = beginPackageTransaction(document.package);
      transaction.replacePart(document.part.name, editor.commit().bytes);
      return transaction.commit();
    }
    markup = `<${prefix}anchor ${namespaces} distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="0" behindDoc="${change.layout === 'behind' ? 1 : 0}" locked="0" layoutInCell="1" allowOverlap="1"><${prefix}simplePos x="0" y="0"/><${prefix}positionH relativeFrom="${change.horizontalRelativeTo ?? 'page'}"><${prefix}posOffset>${x}</${prefix}posOffset></${prefix}positionH><${prefix}positionV relativeFrom="${change.verticalRelativeTo ?? 'page'}"><${prefix}posOffset>${y}</${prefix}posOffset></${prefix}positionV>${raw(extent)}${effect === undefined ? '' : raw(effect)}<${prefix}wrapNone/>${retained}</${prefix}anchor>`;
  }
  editor.replaceElementMarkup(placement, markup);
  const transaction = beginPackageTransaction(document.package);
  transaction.replacePart(document.part.name, editor.commit().bytes);
  return transaction.commit();
}
