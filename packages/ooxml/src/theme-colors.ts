import { OOXML_NAMESPACES } from "./namespaces.ts";
import { parseLosslessXml, type LosslessXmlElement } from "./xml/source-document.ts";

export const THEME_COLOR_SLOTS = [
  "lt1",
  "dk1",
  "lt2",
  "dk2",
  "accent1",
  "accent2",
  "accent3",
  "accent4",
  "accent5",
  "accent6",
  "hlink",
  "folHlink",
] as const;

export type ThemeColorSlot = typeof THEME_COLOR_SLOTS[number];

export class OoxmlThemeError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "OoxmlThemeError";
  }
}

/** Computed sRGB fallbacks from a DrawingML theme color scheme. */
export class ThemeColorScheme {
  readonly name: string | undefined;
  readonly #colors: ReadonlyMap<ThemeColorSlot, string | undefined>;

  constructor(name: string | undefined, colors: ReadonlyMap<ThemeColorSlot, string | undefined>) {
    this.name = name;
    this.#colors = new Map(colors);
  }

  color(slot: ThemeColorSlot): string | undefined {
    return this.#colors.get(slot);
  }
}

/** Reads the theme color scheme without replacing its source expressions. */
export function parseThemeColorScheme(bytes: Uint8Array): ThemeColorScheme {
  let root: LosslessXmlElement;
  try {
    root = parseLosslessXml(bytes).root;
  } catch (cause) {
    throw new OoxmlThemeError("The Theme part is not valid XML.", { cause });
  }
  const drawingNamespace =
    root.namespaceUri === OOXML_NAMESPACES.strict.drawing ||
    root.namespaceUri === OOXML_NAMESPACES.transitional.drawing;
  if (!drawingNamespace || root.localName !== "theme") {
    throw new OoxmlThemeError("The Theme part must have a DrawingML theme root.");
  }
  const namespace = root.namespaceUri;
  const elements = onlyChild(root, namespace, "themeElements");
  const scheme = onlyChild(elements, namespace, "clrScheme");
  const colors = new Map<ThemeColorSlot, string | undefined>();
  for (const slot of THEME_COLOR_SLOTS) {
    const entry = onlyChild(scheme, namespace, slot);
    colors.set(slot, parseBaseColor(entry, namespace));
  }
  return new ThemeColorScheme(attribute(scheme, "name"), colors);
}

function parseBaseColor(parent: LosslessXmlElement, namespace: string): string | undefined {
  const candidates = parent.children.filter(
    (node): node is LosslessXmlElement => node.kind === "element" && node.namespaceUri === namespace,
  );
  if (candidates.length !== 1) {
    throw new OoxmlThemeError(`Theme color ${parent.localName} must contain exactly one color choice.`);
  }
  const color = candidates[0]!;
  if (color.localName === "srgbClr") return hexadecimal(attribute(color, "val"), color.localName);
  if (color.localName === "sysClr") {
    const fallback = attribute(color, "lastClr");
    return fallback === undefined ? undefined : hexadecimal(fallback, "system color fallback");
  }
  return undefined;
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

function hexadecimal(value: string | undefined, context: string): string {
  if (value === undefined || !/^[0-9A-Fa-f]{6}$/.test(value)) {
    throw new OoxmlThemeError(`${context} must contain six hexadecimal digits.`);
  }
  return value.toUpperCase();
}
