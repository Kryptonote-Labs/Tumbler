import { OOXML_NAMESPACES } from "./namespaces.ts";
import { OoxmlThemeError } from "./theme-colors.ts";
import { parseLosslessXml, type LosslessXmlElement } from "./xml/source-document.ts";

export type ThemeFontRole = "major" | "minor";
export type ThemeFontScript = "latin" | "eastAsian" | "complexScript";

export interface ThemeTypefaceSet {
  readonly latin: string;
  readonly eastAsian: string;
  readonly complexScript: string;
}

/** DrawingML theme typefaces used by scheme-based Office fonts. */
export class ThemeFontScheme {
  readonly name: string | undefined;
  readonly major: ThemeTypefaceSet;
  readonly minor: ThemeTypefaceSet;

  constructor(name: string | undefined, major: ThemeTypefaceSet, minor: ThemeTypefaceSet) {
    this.name = name;
    this.major = Object.freeze({ ...major });
    this.minor = Object.freeze({ ...minor });
  }

  typeface(role: ThemeFontRole, script: ThemeFontScript = "latin"): string | undefined {
    const value = this[role][script];
    return value === "" ? undefined : value;
  }
}

export function parseThemeFontScheme(bytes: Uint8Array): ThemeFontScheme {
  let root: LosslessXmlElement;
  try {
    root = parseLosslessXml(bytes).root;
  } catch (cause) {
    throw new OoxmlThemeError("The Theme part is not valid XML.", { cause });
  }
  if (
    root.localName !== "theme" ||
    (root.namespaceUri !== OOXML_NAMESPACES.strict.drawing &&
      root.namespaceUri !== OOXML_NAMESPACES.transitional.drawing)
  ) {
    throw new OoxmlThemeError("The Theme part must have a DrawingML theme root.");
  }
  const namespace = root.namespaceUri;
  const elements = onlyChild(root, namespace, "themeElements");
  const scheme = onlyChild(elements, namespace, "fontScheme");
  return new ThemeFontScheme(
    attribute(scheme, "name"),
    parseTypefaceSet(onlyChild(scheme, namespace, "majorFont"), namespace),
    parseTypefaceSet(onlyChild(scheme, namespace, "minorFont"), namespace),
  );
}

function parseTypefaceSet(parent: LosslessXmlElement, namespace: string): ThemeTypefaceSet {
  return Object.freeze({
    latin: requiredAttribute(onlyChild(parent, namespace, "latin"), "typeface"),
    eastAsian: requiredAttribute(onlyChild(parent, namespace, "ea"), "typeface"),
    complexScript: requiredAttribute(onlyChild(parent, namespace, "cs"), "typeface"),
  });
}

function onlyChild(parent: LosslessXmlElement, namespace: string, name: string): LosslessXmlElement {
  const matches = parent.children.filter(
    (node): node is LosslessXmlElement =>
      node.kind === "element" && node.namespaceUri === namespace && node.localName === name,
  );
  if (matches.length !== 1) throw new OoxmlThemeError(`Theme element ${name} must occur exactly once.`);
  return matches[0]!;
}

function attribute(element: LosslessXmlElement, name: string): string | undefined {
  return element.attributes.find(
    (candidate) => candidate.namespaceUri === "" && candidate.localName === name,
  )?.value;
}

function requiredAttribute(element: LosslessXmlElement, name: string): string {
  const value = attribute(element, name);
  if (value === undefined) throw new OoxmlThemeError(`Theme element ${element.localName} requires ${name}.`);
  return value;
}
