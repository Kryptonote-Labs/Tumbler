import type { LosslessXmlElement } from "@tumblerjs/ooxml";
import type { ChartColor, ChartColorTransform, ChartLineStyle, ChartTextStyle } from "./model.ts";

function child(parent: LosslessXmlElement | undefined, ns: string, name: string) {
  return parent?.children.find((item): item is LosslessXmlElement => item.kind === "element" && item.namespaceUri === ns && item.localName === name);
}
function attribute(element: LosslessXmlElement | undefined, name: string) {
  return element?.attributes.find(item => item.namespaceUri === "" && item.localName === name)?.value;
}

/** Retain ordered luminance transforms used by Office chart text and gridlines. */
export function parseChartFill(parent: LosslessXmlElement | undefined, ns: string): ChartColor | undefined {
  const fill = child(parent, ns, "solidFill");
  const rgb = child(fill, ns, "srgbClr");
  const source = rgb ?? child(fill, ns, "schemeClr");
  const value = attribute(source, "val");
  if (!source || !value || (rgb && !/^[0-9a-f]{6}$/i.test(value))) return undefined;
  const transforms = source.children.flatMap((node): ChartColorTransform[] => {
    if (node.kind !== "element" || node.namespaceUri !== ns || (node.localName !== "lumMod" && node.localName !== "lumOff")) return [];
    const raw = attribute(node, "val") ?? "";
    const value = raw.endsWith("%") ? Number(raw.slice(0, -1)) / 100 : Number(raw) / 100000;
    return Number.isFinite(value) ? [{ kind: node.localName, value }] : [];
  });
  return Object.freeze({ kind: rgb ? "rgb" : "scheme", value: rgb ? `#${value.toUpperCase()}` : value, ...(transforms.length ? { transforms: Object.freeze(transforms) } : {}) });
}

export function parseChartLine(parent: LosslessXmlElement | undefined, ns: string): ChartLineStyle | undefined {
  const line = child(parent, ns, "ln");
  if (!line) return undefined;
  const rawWidth = attribute(line, "w");
  const width = rawWidth === undefined ? undefined : Number(rawWidth) / 12700;
  const color = parseChartFill(line, ns);
  return Object.freeze({
    ...(child(line, ns, "noFill") ? { noFill: true } : {}),
    ...(color ? { color } : {}),
    ...(width !== undefined && Number.isFinite(width) && width >= 0 ? { width } : {}),
  });
}

/** Chart text uses paragraph defaults; explicit title runs may override those defaults. */
export function parseChartTextStyle(parent: LosslessXmlElement | undefined, chartNs: string, ns: string): ChartTextStyle | undefined {
  const properties = child(parent, chartNs, "txPr");
  const rich = child(child(parent, chartNs, "tx"), chartNs, "rich");
  const paragraph = child(properties ?? rich, ns, "p");
  const defaults = child(child(paragraph, ns, "pPr"), ns, "defRPr");
  const richParagraph = child(rich, ns, "p");
  const run = child(child(richParagraph, ns, "r"), ns, "rPr");
  const read = (name: string) => attribute(run, name) ?? attribute(defaults, name);
  const rawSize = read("sz");
  const fontSize = rawSize === undefined ? undefined : Number(rawSize) / 100;
  const fontFamily = attribute(child(run, ns, "latin"), "typeface") ?? attribute(child(defaults, ns, "latin"), "typeface");
  const color = parseChartFill(run, ns) ?? parseChartFill(defaults, ns);
  const boolean = (name: string) => read(name) === undefined ? undefined : read(name) === "1" || read(name) === "true";
  const bold = boolean("b"), italic = boolean("i");
  if (!properties && !rich) return undefined;
  return Object.freeze({
    ...(fontSize !== undefined && Number.isFinite(fontSize) && fontSize > 0 ? { fontSize } : {}),
    ...(fontFamily === undefined ? {} : { fontFamily }),
    ...(bold === undefined ? {} : { bold }),
    ...(italic === undefined ? {} : { italic }),
    ...(color === undefined ? {} : { color }),
  });
}
