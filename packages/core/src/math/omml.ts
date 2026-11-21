import { mathChars, type MathEquation, type MathNode, type MathRow } from "./model.ts";

export const OMML_NAMESPACE = "http://schemas.openxmlformats.org/officeDocument/2006/math";

/** The parts of a parsed XML element the reader needs; hosts pass their own parser's elements. */
export interface OmmlElement {
  readonly kind: "element";
  readonly localName: string;
  readonly namespaceUri: string;
  readonly attributes: readonly { readonly localName: string; readonly namespaceUri: string; readonly value: string }[];
  readonly children: readonly (OmmlElement | { readonly kind: "text" | "cdata" | "comment" | "processing_instruction"; readonly value: string })[];
}

const math = (element: OmmlElement) => element.children.filter((child): child is OmmlElement => child.kind === "element" && child.namespaceUri === OMML_NAMESPACE);
const child = (element: OmmlElement | undefined, name: string) => (element ? math(element).find((item) => item.localName === name) : undefined);
const value = (element: OmmlElement | undefined) => element?.attributes.find((item) => item.localName === "val" && item.namespaceUri === OMML_NAMESPACE)?.value;
const property = (element: OmmlElement, properties: string, name: string) => value(child(child(element, properties), name));
const on = (element: OmmlElement, properties: string, name: string) => {
  const flag = child(child(element, properties), name);
  return !!flag && !["0", "off", "false"].includes(value(flag) ?? "1");
};
const text = (element: OmmlElement): string =>
  element.children.map((item) => (item.kind === "element" ? text(item) : item.kind === "text" || item.kind === "cdata" ? item.value : "")).join("");

function row(element: OmmlElement | undefined): MathNode[] {
  return element ? math(element).flatMap(node) : [];
}
const slot = (element: OmmlElement, name: string) => row(child(element, name));
const optional = (element: OmmlElement, name: string, hidden: boolean): MathRow | undefined => (hidden ? undefined : slot(element, name));

/** One OMML element as model nodes. Unknown wrappers keep their contents. */
function node(element: OmmlElement): MathNode[] {
  switch (element.localName) {
    case "r": {
      const style = property(element, "rPr", "sty");
      return mathChars(math(element).filter((item) => item.localName === "t").map(text).join(""), style === "p" || on(element, "rPr", "nor"));
    }
    case "f": {
      const type = property(element, "fPr", "type");
      const style = type === "skw" ? "skewed" : type === "lin" ? "linear" : type === "noBar" ? "stacked" : undefined;
      return [{ kind: "fraction", ...(style ? { style } : {}), num: slot(element, "num"), den: slot(element, "den") }];
    }
    case "sSup":
      return [{ kind: "script", base: slot(element, "e"), sup: slot(element, "sup") }];
    case "sSub":
      return [{ kind: "script", base: slot(element, "e"), sub: slot(element, "sub") }];
    case "sSubSup":
      return [{ kind: "script", base: slot(element, "e"), sub: slot(element, "sub"), sup: slot(element, "sup") }];
    case "sPre":
      return [{ kind: "script", pre: true, base: slot(element, "e"), sub: slot(element, "sub"), sup: slot(element, "sup") }];
    case "rad": {
      const degree = optional(element, "deg", on(element, "radPr", "degHide"));
      return [{ kind: "radical", ...(degree?.length ? { degree } : {}), body: slot(element, "e") }];
    }
    case "d": {
      const open = property(element, "dPr", "begChr") ?? "(";
      const close = property(element, "dPr", "endChr") ?? ")";
      const separator = mathChars(property(element, "dPr", "sepChr") ?? "|");
      const body = math(element)
        .filter((item) => item.localName === "e")
        .flatMap((item, index) => [...(index ? separator : []), ...row(item)]);
      return [{ kind: "delimiter", open, close, body }];
    }
    case "nary": {
      const sub = optional(element, "sub", on(element, "naryPr", "subHide"));
      const sup = optional(element, "sup", on(element, "naryPr", "supHide"));
      return [{
        kind: "nary",
        operator: property(element, "naryPr", "chr") ?? "∫",
        ...(sub ? { sub } : {}),
        ...(sup ? { sup } : {}),
        body: slot(element, "e"),
        ...(property(element, "naryPr", "limLoc") === "subSup" ? { side: true } : {}),
      }];
    }
    case "func":
      return [{ kind: "function", name: slot(element, "fName"), body: slot(element, "e") }];
    case "acc":
      return [{ kind: "accent", accent: property(element, "accPr", "chr") ?? "̂", body: slot(element, "e") }];
    case "limLow":
    case "limUpp":
      return [{ kind: "limit", position: element.localName === "limLow" ? "lower" : "upper", base: slot(element, "e"), limit: slot(element, "lim") }];
    case "m":
      return [{ kind: "matrix", rows: math(element).filter((item) => item.localName === "mr").map((cells) => math(cells).filter((item) => item.localName === "e").map(row)) }];
    case "eqArr":
      return [{ kind: "matrix", rows: math(element).filter((item) => item.localName === "e").map((item) => [row(item)]) }];
    case "groupChr": {
      const character = property(element, "groupChrPr", "chr") ?? "⏟";
      const position = property(element, "groupChrPr", "pos") === "top" ? "upper" : "lower";
      return [{ kind: "limit", position, base: slot(element, "e"), limit: mathChars(character) }];
    }
    case "bar":
      return [{ kind: "accent", accent: "̅", body: slot(element, "e") }];
    // Property elements describe their parent; control properties have no content.
    case "ctrlPr":
    case "argPr":
      return [];
    default:
      return element.localName.endsWith("Pr") ? [] : row(element);
  }
}

const modeledElements = new Set([
  "oMath", "r", "rPr", "t", "sty", "nor", "f", "fPr", "type", "num", "den",
  "sSup", "sSub", "sSubSup", "sPre", "e", "sup", "sub", "rad", "radPr", "deg", "degHide",
  "d", "dPr", "begChr", "endChr", "nary", "naryPr", "chr", "limLoc", "subHide", "supHide",
  "func", "fName", "acc", "accPr", "limLow", "limUpp", "lim", "m", "mr",
]);

function propertySignature(element: OmmlElement): unknown[] {
  return [element.namespaceUri, element.localName,
    element.attributes.map(({ namespaceUri, localName, value }) => JSON.stringify([namespaceUri, localName, value])).sort(),
    element.children.flatMap((item) => item.kind === "element" ? [propertySignature(item)] : []),
  ];
}

function canEdit(element: OmmlElement, runProperties: Set<string>): boolean {
  if (!modeledElements.has(element.localName)) return false;
  if (element.localName === "sty" && !["p", "i"].includes(value(element) ?? "")) return false;
  if (element.localName === "d" && math(element).filter((item) => item.localName === "e").length !== 1) return false;
  const hasHiddenContent = (properties: string, slotName: string) => {
    const argument = child(element, slotName);
    return !!argument && on(element, properties, `${slotName}Hide`) && math(argument).length > 0;
  };
  if (element.localName === "rad" && hasHiddenContent("radPr", "deg")) return false;
  if (element.localName === "nary" && (hasHiddenContent("naryPr", "sub") || hasHiddenContent("naryPr", "sup"))) return false;
  if (element.localName === "r") {
    // Hosts can use the first run's typography, but the editor cannot retain per-run typography.
    const properties = element.children.find((item): item is OmmlElement => item.kind === "element" &&
      item.localName === "rPr" && item.namespaceUri !== OMML_NAMESPACE);
    runProperties.add(properties ? JSON.stringify(propertySignature(properties)) : "");
  }
  return math(element).every((item) => canEdit(item, runProperties));
}

/** Read Office Math. Unmodeled markup is previewed but requires preserving the original XML. */
export function mathFromOmml(element: OmmlElement): MathEquation {
  const zones = element.localName === "oMathPara" ? math(element).filter((item) => item.localName === "oMath") : [element];
  const runProperties = new Set<string>();
  const editable = zones.length === 1 && canEdit(zones[0]!, runProperties) && runProperties.size <= 1;
  return {
    body: zones.flatMap((zone) => row(zone)),
    ...(editable ? {} : { readOnly: true }),
  };
}
