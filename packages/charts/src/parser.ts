import { OOXML_NAMESPACES, parseLosslessXml, type LosslessXmlDocument, type LosslessXmlElement } from "@tumbler/ooxml";
import type {
  ChartAxis,
  ChartColor,
  ChartDataPoint,
  ChartDataSequence,
  ChartKind,
  ChartLegend,
  ChartLegendPosition,
  ChartModel,
  ChartSeries,
} from "./model.ts";

const MAX_CACHE_POINTS = 100_000;

export class ChartParseError extends Error {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "ChartParseError";
  }
}

/** Parses the native chart subset without interpreting host-document references. */
export function parseOoxmlChart(bytes: Uint8Array, conformance: "strict" | "transitional"): ChartModel {
  let document: LosslessXmlDocument;
  try {
    document = parseLosslessXml(bytes);
  } catch (cause) {
    throw new ChartParseError("Chart part is not valid XML.", { cause });
  }
  const chartNamespace = OOXML_NAMESPACES[conformance].chart;
  const drawingNamespace = OOXML_NAMESPACES[conformance].drawing;
  if (document.root.namespaceUri !== chartNamespace || document.root.localName !== "chartSpace") {
    throw new ChartParseError("A Chart part must have a c:chartSpace root element.");
  }
  const chart = exactlyOne(document.root, chartNamespace, "chart", "chartSpace");
  const title = parseText(children(chart, chartNamespace, "title")[0], chartNamespace, drawingNamespace);
  const legend = parseLegend(children(chart, chartNamespace, "legend")[0], chartNamespace);
  const plotAreas = children(chart, chartNamespace, "plotArea");
  if (plotAreas.length !== 1) throw new ChartParseError("A chart must contain exactly one plotArea.");
  const plotArea = plotAreas[0]!;
  const candidates = plotArea.children.filter((child): child is LosslessXmlElement =>
    child.kind === "element" && child.namespaceUri === chartNamespace && child.localName.endsWith("Chart")
  );
  if (candidates.length !== 1) {
    return Object.freeze({ status: "unsupported", chartType: candidates[0]?.localName, reason: candidates.length === 0 ? "The plot area has no chart type." : "Combination charts are not supported in this milestone.", title, legend });
  }
  const chartType = candidates[0]!;
  const kind = chartKind(chartType, chartNamespace);
  if (kind === undefined) {
    return Object.freeze({ status: "unsupported", chartType: chartType.localName, reason: `${chartType.localName} is not supported in this milestone.`, title, legend });
  }
  const series = children(chartType, chartNamespace, "ser").map((element) => parseSeries(element, chartNamespace, drawingNamespace));
  const axes = plotArea.children.filter((child): child is LosslessXmlElement =>
    child.kind === "element" && child.namespaceUri === chartNamespace && (child.localName === "catAx" || child.localName === "valAx")
  ).map((element) => parseAxis(element, chartNamespace, drawingNamespace));
  const rawGrouping = val(children(chartType, chartNamespace, "grouping")[0]) ?? "standard";
  const grouping = rawGrouping === "stacked" ? "stacked" as const
    : rawGrouping === "percentStacked" ? "percent-stacked" as const
    : rawGrouping === "clustered" ? "clustered" as const
    : "standard" as const;
  const rawHole = val(children(chartType, chartNamespace, "holeSize")[0]);
  const holeSize = kind === "doughnut" ? boundedPercent(rawHole ?? "50", "doughnut hole size") : undefined;
  return Object.freeze({ status: "supported", kind, grouping, holeSize, title, legend, series: Object.freeze(series), axes: Object.freeze(axes) });
}

function chartKind(element: LosslessXmlElement, namespace: string): ChartKind | undefined {
  if (element.localName === "barChart") return val(children(element, namespace, "barDir")[0]) === "bar" ? "bar" : "column";
  if (element.localName === "lineChart") return "line";
  if (element.localName === "pieChart") return "pie";
  if (element.localName === "doughnutChart") return "doughnut";
  return undefined;
}

function parseSeries(element: LosslessXmlElement, chartNamespace: string, drawingNamespace: string): ChartSeries {
  const tx = children(element, chartNamespace, "tx")[0];
  const titleRef = tx === undefined ? undefined : children(tx, chartNamespace, "strRef")[0];
  const literalTitle = tx === undefined ? undefined : children(tx, chartNamespace, "v")[0];
  const titleCache = titleRef === undefined ? undefined : parseSequenceContainer(titleRef, chartNamespace, "string");
  return Object.freeze({
    index: requiredUnsignedVal(element, chartNamespace, "idx", "series index"),
    order: requiredUnsignedVal(element, chartNamespace, "order", "series order"),
    title: literalTitle === undefined ? titleCache?.points[0]?.value.toString() : text(literalTitle),
    titleFormula: titleRef === undefined ? undefined : formula(titleRef, chartNamespace),
    categories: parseData(children(element, chartNamespace, "cat")[0], chartNamespace),
    values: parseData(children(element, chartNamespace, "val")[0] ?? children(element, chartNamespace, "yVal")[0], chartNamespace),
    fill: parseSolidFill(children(element, chartNamespace, "spPr")[0], drawingNamespace),
    line: parseLine(children(element, chartNamespace, "spPr")[0], drawingNamespace),
  });
}

function parseData(container: LosslessXmlElement | undefined, namespace: string): ChartDataSequence | undefined {
  if (container === undefined) return undefined;
  const reference = children(container, namespace, "numRef")[0] ?? children(container, namespace, "strRef")[0];
  if (reference !== undefined) return parseSequenceContainer(reference, namespace, reference.localName === "strRef" ? "string" : "number");
  const literal = children(container, namespace, "numLit")[0] ?? children(container, namespace, "strLit")[0];
  return literal === undefined ? undefined : parseSequenceContainer(literal, namespace, literal.localName === "strLit" ? "string" : "number");
}

function parseSequenceContainer(element: LosslessXmlElement, namespace: string, kind: "number" | "string"): ChartDataSequence {
  const cache = children(element, namespace, kind === "number" ? "numCache" : "strCache")[0] ?? element;
  const points = children(cache, namespace, "pt");
  if (points.length > MAX_CACHE_POINTS) throw new ChartParseError(`Chart cache exceeds ${MAX_CACHE_POINTS} points.`);
  const seen = new Set<number>();
  const parsed = points.map((point): ChartDataPoint => {
    const index = unsigned(requiredAttr(point, "idx", "cache point index"), "cache point index");
    if (seen.has(index)) throw new ChartParseError(`Chart cache repeats point ${index}.`);
    seen.add(index);
    const valueElement = exactlyOne(point, namespace, "v", "cache point");
    const raw = text(valueElement);
    if (kind === "string") return Object.freeze({ index, value: raw });
    const value = Number(raw);
    if (!Number.isFinite(value)) throw new ChartParseError(`Numeric chart cache point ${index} is not finite.`);
    return Object.freeze({ index, value });
  }).sort((left, right) => left.index - right.index);
  return Object.freeze({
    kind,
    formula: formula(element, namespace),
    formatCode: kind === "number" ? optionalText(children(cache, namespace, "formatCode")[0]) : undefined,
    points: Object.freeze(parsed),
  });
}

function parseAxis(element: LosslessXmlElement, namespace: string, drawingNamespace: string): ChartAxis {
  const scaling = children(element, namespace, "scaling")[0];
  return Object.freeze({
    id: requiredUnsignedVal(element, namespace, "axId", "axis id"),
    kind: element.localName === "catAx" ? "category" : "value",
    position: axisPosition(val(children(element, namespace, "axPos")[0]) ?? "l"),
    title: parseText(children(element, namespace, "title")[0], namespace, drawingNamespace),
    majorGridlines: children(element, namespace, "majorGridlines").length > 0,
    minimum: optionalFiniteVal(scaling === undefined ? undefined : children(scaling, namespace, "min")[0], "axis minimum"),
    maximum: optionalFiniteVal(scaling === undefined ? undefined : children(scaling, namespace, "max")[0], "axis maximum"),
    deleted: booleanVal(children(element, namespace, "delete")[0], false),
  });
}

function parseLegend(element: LosslessXmlElement | undefined, namespace: string): ChartLegend | undefined {
  if (element === undefined) return undefined;
  const positions: Record<string, ChartLegendPosition> = { b: "bottom", l: "left", r: "right", t: "top", tr: "top-right" };
  const raw = val(children(element, namespace, "legendPos")[0]) ?? "r";
  return Object.freeze({ position: positions[raw] ?? "right", overlay: booleanVal(children(element, namespace, "overlay")[0], false) });
}

function parseText(element: LosslessXmlElement | undefined, chartNamespace: string, drawingNamespace: string): string | undefined {
  if (element === undefined) return undefined;
  const texts = descendants(element, drawingNamespace, "t").map(text);
  if (texts.length > 0) return texts.join("");
  const values = descendants(element, chartNamespace, "v").map(text);
  return values[0];
}

function parseSolidFill(parent: LosslessXmlElement | undefined, drawingNamespace: string): ChartColor | undefined {
  const fill = parent === undefined ? undefined : children(parent, drawingNamespace, "solidFill")[0];
  if (fill === undefined) return undefined;
  const rgb = children(fill, drawingNamespace, "srgbClr")[0];
  const scheme = children(fill, drawingNamespace, "schemeClr")[0];
  if (rgb !== undefined) {
    const raw = requiredAttr(rgb, "val", "sRGB chart color");
    if (!/^[0-9A-Fa-f]{6}$/.test(raw)) throw new ChartParseError("sRGB chart color must contain six hexadecimal digits.");
    return Object.freeze({ kind: "rgb", value: `#${raw.toUpperCase()}` });
  }
  return scheme === undefined ? undefined : Object.freeze({ kind: "scheme", value: requiredAttr(scheme, "val", "scheme chart color") });
}

function parseLine(parent: LosslessXmlElement | undefined, drawingNamespace: string): ChartColor | undefined {
  const line = parent === undefined ? undefined : children(parent, drawingNamespace, "ln")[0];
  return parseSolidFill(line, drawingNamespace);
}

function descendants(parent: LosslessXmlElement, namespace: string, name: string): LosslessXmlElement[] {
  const matches: LosslessXmlElement[] = [];
  const visit = (element: LosslessXmlElement) => {
    for (const child of element.children) {
      if (child.kind !== "element") continue;
      if (child.namespaceUri === namespace && child.localName === name) matches.push(child);
      visit(child);
    }
  };
  visit(parent);
  return matches;
}

function children(parent: LosslessXmlElement, namespace: string, name: string): LosslessXmlElement[] {
  return parent.children.filter((child): child is LosslessXmlElement => child.kind === "element" && child.namespaceUri === namespace && child.localName === name);
}

function exactlyOne(parent: LosslessXmlElement, namespace: string, name: string, context: string): LosslessXmlElement {
  const matches = children(parent, namespace, name);
  if (matches.length !== 1) throw new ChartParseError(`${context} must contain exactly one ${name}.`);
  return matches[0]!;
}

function text(element: LosslessXmlElement): string {
  let output = "";
  for (const child of element.children) if (child.kind === "text" || child.kind === "cdata") output += child.value;
  return output;
}

function optionalText(element: LosslessXmlElement | undefined): string | undefined {
  return element === undefined ? undefined : text(element);
}

function requiredAttr(element: LosslessXmlElement, name: string, context: string): string {
  const value = element.attributes.find((attribute) => attribute.namespaceUri === "" && attribute.localName === name)?.value;
  if (value === undefined) throw new ChartParseError(`${context} is required.`);
  return value;
}

function val(element: LosslessXmlElement | undefined): string | undefined {
  return element?.attributes.find((attribute) => attribute.namespaceUri === "" && attribute.localName === "val")?.value;
}

function formula(parent: LosslessXmlElement, namespace: string): string | undefined {
  return optionalText(children(parent, namespace, "f")[0]);
}

function requiredUnsignedVal(parent: LosslessXmlElement, namespace: string, name: string, context: string): number {
  const raw = val(exactlyOne(parent, namespace, name, context));
  if (raw === undefined) throw new ChartParseError(`${context} requires val.`);
  return unsigned(raw, context);
}

function unsigned(raw: string, context: string): number {
  const number = Number(raw);
  if (!Number.isSafeInteger(number) || number < 0) throw new ChartParseError(`${context} must be a non-negative safe integer.`);
  return number;
}

function boundedPercent(raw: string, context: string): number {
  const number = Number(raw);
  if (!Number.isFinite(number) || number < 0 || number > 100) throw new ChartParseError(`${context} must be between zero and 100.`);
  return number;
}

function optionalFiniteVal(element: LosslessXmlElement | undefined, context: string): number | undefined {
  const raw = val(element);
  if (raw === undefined) return undefined;
  const number = Number(raw);
  if (!Number.isFinite(number)) throw new ChartParseError(`${context} must be finite.`);
  return number;
}

function booleanVal(element: LosslessXmlElement | undefined, fallback: boolean): boolean {
  const raw = val(element);
  if (raw === undefined) return fallback;
  if (raw === "1" || raw === "true") return true;
  if (raw === "0" || raw === "false") return false;
  throw new ChartParseError(`Boolean chart value ${JSON.stringify(raw)} is invalid.`);
}

function axisPosition(raw: string): ChartAxis["position"] {
  return raw === "b" ? "bottom" : raw === "r" ? "right" : raw === "t" ? "top" : "left";
}
