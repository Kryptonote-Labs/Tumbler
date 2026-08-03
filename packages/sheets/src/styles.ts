import type { LosslessXmlDocument, LosslessXmlElement } from "@tumblerjs/ooxml";
import {
  OOXML_NAMESPACES,
  parseLosslessXml,
  parseThemeColorScheme,
  parseThemeFontScheme,
  THEME_COLOR_SLOTS,
  type ThemeColorScheme,
  type ThemeFontScheme,
  type ThemeFontScript,
} from "@tumblerjs/ooxml";
import type { PartName } from "@tumblerjs/opc";
import { SpreadsheetError, type SpreadsheetWorkbook } from "./workbook.ts";

const STYLES_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml";
const THEME_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.theme+xml";

const DEFAULT_INDEXED_COLORS = [
  "FF000000", "FFFFFFFF", "FFFF0000", "FF00FF00", "FF0000FF", "FFFFFF00", "FFFF00FF", "FF00FFFF",
  "FF000000", "FFFFFFFF", "FFFF0000", "FF00FF00", "FF0000FF", "FFFFFF00", "FFFF00FF", "FF00FFFF",
  "FF800000", "FF008000", "FF000080", "FF808000", "FF800080", "FF008080", "FFC0C0C0", "FF808080",
  "FF9999FF", "FF993366", "FFFFFFCC", "FFCCFFFF", "FF660066", "FFFF8080", "FF0066CC", "FFCCCCFF",
  "FF000080", "FFFF00FF", "FFFFFF00", "FF00FFFF", "FF800080", "FF800000", "FF008080", "FF0000FF",
  "FF00CCFF", "FFCCFFFF", "FFCCFFCC", "FFFFFF99", "FF99CCFF", "FFFF99CC", "FFCC99FF", "FFFFCC99",
  "FF3366FF", "FF33CCCC", "FF99CC00", "FFFFCC00", "FFFF9900", "FFFF6600", "FF666699", "FF969696",
  "FF003366", "FF339966", "FF003300", "FF333300", "FF993300", "FF993366", "FF333399", "FF333333",
] as const;

export type SpreadsheetColor =
  | { readonly type: "automatic"; readonly tint: number }
  | { readonly type: "indexed"; readonly index: number; readonly tint: number }
  | { readonly type: "rgb"; readonly argb: string; readonly tint: number }
  | { readonly type: "theme"; readonly index: number; readonly tint: number };

export interface SpreadsheetFont {
  readonly name: string | undefined;
  readonly scheme: "major" | "minor" | "none" | undefined;
  readonly size: number | undefined;
  readonly bold: boolean;
  readonly italic: boolean;
  readonly underline: string | undefined;
  readonly strike: boolean;
  readonly color: SpreadsheetColor | undefined;
}

export interface SpreadsheetFill {
  readonly patternType: string | undefined;
  readonly foreground: SpreadsheetColor | undefined;
  readonly background: SpreadsheetColor | undefined;
}

export interface SpreadsheetBorderEdge {
  readonly style: string | undefined;
  readonly color: SpreadsheetColor | undefined;
}

export interface SpreadsheetBorder {
  readonly left: SpreadsheetBorderEdge;
  readonly right: SpreadsheetBorderEdge;
  readonly top: SpreadsheetBorderEdge;
  readonly bottom: SpreadsheetBorderEdge;
}

export interface SpreadsheetAlignment {
  readonly horizontal: string | undefined;
  readonly vertical: string | undefined;
  readonly wrapText: boolean;
  readonly shrinkToFit: boolean;
  readonly textRotation: number;
  readonly indent: number;
  readonly readingOrder: 0 | 1 | 2;
}

export interface SpreadsheetCellFormat {
  readonly font: SpreadsheetFont;
  readonly fill: SpreadsheetFill;
  readonly border: SpreadsheetBorder;
  readonly numberFormatId: number;
  readonly numberFormatCode: string | undefined;
  readonly alignment: SpreadsheetAlignment;
}

interface FormatRecord {
  readonly fontId: number | undefined;
  readonly fillId: number | undefined;
  readonly borderId: number | undefined;
  readonly numberFormatId: number | undefined;
  readonly baseFormatId: number | undefined;
  readonly alignment: Partial<SpreadsheetAlignment> | undefined;
  readonly applyFont: boolean | undefined;
  readonly applyFill: boolean | undefined;
  readonly applyBorder: boolean | undefined;
  readonly applyNumberFormat: boolean | undefined;
  readonly applyAlignment: boolean | undefined;
}

const DEFAULT_FONT: SpreadsheetFont = Object.freeze({
  name: undefined, scheme: undefined, size: undefined, bold: false, italic: false, underline: undefined, strike: false, color: undefined,
});
const DEFAULT_FILL: SpreadsheetFill = Object.freeze({ patternType: undefined, foreground: undefined, background: undefined });
const EMPTY_EDGE: SpreadsheetBorderEdge = Object.freeze({ style: undefined, color: undefined });
const DEFAULT_BORDER: SpreadsheetBorder = Object.freeze({ left: EMPTY_EDGE, right: EMPTY_EDGE, top: EMPTY_EDGE, bottom: EMPTY_EDGE });
const DEFAULT_ALIGNMENT: SpreadsheetAlignment = Object.freeze({
  horizontal: undefined, vertical: undefined, wrapText: false, shrinkToFit: false, textRotation: 0, indent: 0,
  readingOrder: 0,
});

export class SpreadsheetStyles {
  readonly partName: PartName | undefined;
  readonly fonts: readonly SpreadsheetFont[];
  readonly fills: readonly SpreadsheetFill[];
  readonly borders: readonly SpreadsheetBorder[];
  readonly cellFormats: readonly SpreadsheetCellFormat[];
  readonly theme: ThemeColorScheme | undefined;
  readonly themeFonts: ThemeFontScheme | undefined;
  readonly indexedColors: readonly string[];

  constructor(input: {
    partName?: PartName;
    fonts: readonly SpreadsheetFont[];
    fills: readonly SpreadsheetFill[];
    borders: readonly SpreadsheetBorder[];
    cellFormats: readonly SpreadsheetCellFormat[];
    theme?: ThemeColorScheme;
    themeFonts?: ThemeFontScheme;
    indexedColors?: readonly string[];
  }) {
    this.partName = input.partName;
    this.fonts = Object.freeze([...input.fonts]);
    this.fills = Object.freeze([...input.fills]);
    this.borders = Object.freeze([...input.borders]);
    this.cellFormats = Object.freeze([...input.cellFormats]);
    this.theme = input.theme;
    this.themeFonts = input.themeFonts;
    this.indexedColors = Object.freeze([...(input.indexedColors ?? DEFAULT_INDEXED_COLORS)]);
  }

  resolve(index: number | undefined): SpreadsheetCellFormat {
    const resolved = this.cellFormats[index ?? 0];
    if (resolved === undefined) {
      throw new SpreadsheetError("invalid_styles", `Cell format index ${index ?? 0} does not exist.`);
    }
    return resolved;
  }

  /** Resolves a source color without replacing its theme or indexed identity. */
  resolveColor(color: SpreadsheetColor | undefined): string | undefined {
    if (color === undefined || color.type === "automatic") return undefined;
    let argb: string | undefined;
    if (color.type === "rgb") {
      // SpreadsheetML cell styles do not render alpha. Producers commonly prefix
      // ordinary six-digit colors with 00, which must not become CSS transparency.
      argb = `FF${color.argb.slice(2)}`;
    } else if (color.type === "theme") {
      const slot = THEME_COLOR_SLOTS[color.index];
      const rgb = slot === undefined ? undefined : this.theme?.color(slot);
      argb = rgb === undefined ? undefined : `FF${rgb}`;
    } else {
      argb = this.indexedColors[color.index];
    }
    return argb === undefined ? undefined : tintArgb(argb, color.tint);
  }

  resolveFontName(font: SpreadsheetFont, script: ThemeFontScript = "latin"): string | undefined {
    const themed = font.scheme === "major" || font.scheme === "minor"
      ? this.themeFonts?.typeface(font.scheme, script)
      : undefined;
    return themed ?? font.name;
  }
}

export function readSpreadsheetStyles(workbook: SpreadsheetWorkbook): SpreadsheetStyles {
  const strict = workbook.conformance === "strict";
  const namespace = strict ? OOXML_NAMESPACES.strict.spreadsheet : OOXML_NAMESPACES.transitional.spreadsheet;
  const relationshipType = strict
    ? "http://purl.oclc.org/ooxml/officeDocument/relationships/styles"
    : "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles";
  const relationships = workbook.package.relationships(workbook.part.name).byType(relationshipType);
  if (relationships.length === 0) return defaultStyles();
  if (relationships.length !== 1 || relationships[0]?.targetMode !== "Internal") {
    throw new SpreadsheetError("invalid_styles", "A workbook must not reference more than one internal Styles part.");
  }
  const part = workbook.package.getPart(relationships[0].targetPartName);
  if (part?.contentType !== STYLES_CONTENT_TYPE) {
    throw new SpreadsheetError("invalid_styles", "The Styles part has an unsupported content type.");
  }
  let document: LosslessXmlDocument;
  try {
    document = parseLosslessXml(workbook.package.readPart(part));
  } catch (cause) {
    throw new SpreadsheetError("invalid_styles", "The Styles part is not valid XML.", { cause });
  }
  if (document.root.namespaceUri !== namespace || document.root.localName !== "styleSheet") {
    throw new SpreadsheetError("invalid_styles", "The Styles part must have a SpreadsheetML styleSheet root.");
  }
  const fonts = parseCollection(document.root, namespace, "fonts", "font", (element) => parseFont(element, namespace));
  const fills = parseCollection(document.root, namespace, "fills", "fill", (element) => parseFill(element, namespace));
  const borders = parseCollection(document.root, namespace, "borders", "border", (element) => parseBorder(element, namespace));
  const numberFormats = new Map<number, string>();
  for (const element of collectionElements(document.root, namespace, "numFmts", "numFmt")) {
    const id = requiredUnsigned(element, "numFmtId");
    const code = requiredAttribute(element, "formatCode");
    if (numberFormats.has(id)) throw styleError(`Number format id ${id} is duplicated.`);
    numberFormats.set(id, code);
  }
  const baseRecords = parseRecords(document.root, namespace, "cellStyleXfs");
  const cellRecords = parseRecords(document.root, namespace, "cellXfs");
  if (cellRecords.length === 0) throw styleError("A Styles part must contain at least one cell format.");
  const resolved = cellRecords.map((record) => resolveRecord(record, baseRecords, fonts, fills, borders, numberFormats));
  const theme = readTheme(workbook);
  const indexedColors = parseIndexedColors(document.root, namespace);
  return new SpreadsheetStyles({
    partName: part.name,
    fonts,
    fills,
    borders,
    cellFormats: resolved,
    ...(theme === undefined ? {} : { theme: theme.colors, themeFonts: theme.fonts }),
    ...(indexedColors === undefined ? {} : { indexedColors }),
  });
}

function defaultStyles(): SpreadsheetStyles {
  return new SpreadsheetStyles({
    fonts: [DEFAULT_FONT], fills: [DEFAULT_FILL], borders: [DEFAULT_BORDER],
    cellFormats: [Object.freeze({ font: DEFAULT_FONT, fill: DEFAULT_FILL, border: DEFAULT_BORDER, numberFormatId: 0, numberFormatCode: undefined, alignment: DEFAULT_ALIGNMENT })],
  });
}

function readTheme(workbook: SpreadsheetWorkbook): {
  readonly colors: ThemeColorScheme;
  readonly fonts: ThemeFontScheme;
} | undefined {
  const relationshipType = workbook.conformance === "strict"
    ? "http://purl.oclc.org/ooxml/officeDocument/relationships/theme"
    : "http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme";
  const relationships = workbook.package.relationships(workbook.part.name).byType(relationshipType);
  if (relationships.length === 0) return undefined;
  if (relationships.length !== 1 || relationships[0]?.targetMode !== "Internal") {
    throw styleError("A workbook must not reference more than one internal Theme part.");
  }
  const part = workbook.package.getPart(relationships[0].targetPartName);
  if (part?.contentType !== THEME_CONTENT_TYPE) throw styleError("The Theme part has an unsupported content type.");
  try {
    const bytes = workbook.package.readPart(part);
    return Object.freeze({
      colors: parseThemeColorScheme(bytes),
      fonts: parseThemeFontScheme(bytes),
    });
  } catch (cause) {
    throw new SpreadsheetError("invalid_styles", "The workbook Theme part is invalid.", { cause });
  }
}

function parseIndexedColors(root: LosslessXmlElement, namespace: string): string[] | undefined {
  const colors = children(root, namespace, "colors");
  if (colors.length > 1) throw styleError("Styles colors are duplicated.");
  if (colors.length === 0) return undefined;
  const indexed = children(colors[0]!, namespace, "indexedColors");
  if (indexed.length > 1) throw styleError("Indexed colors are duplicated.");
  if (indexed.length === 0) return undefined;
  return children(indexed[0]!, namespace, "rgbColor").map((element) => {
    const rgb = requiredAttribute(element, "rgb").toUpperCase();
    if (!/^[0-9A-F]{8}$/.test(rgb)) throw styleError("Indexed colors must contain eight hexadecimal digits.");
    return `FF${rgb.slice(2)}`;
  });
}

function parseFont(element: LosslessXmlElement, namespace: string): SpreadsheetFont {
  const scheme = valueChild(element, namespace, "scheme");
  if (scheme !== undefined && scheme !== "major" && scheme !== "minor" && scheme !== "none") {
    throw styleError(`Font scheme ${JSON.stringify(scheme)} is invalid.`);
  }
  return Object.freeze({
    name: valueChild(element, namespace, "name"),
    scheme,
    size: optionalDouble(valueChild(element, namespace, "sz"), "font size"),
    bold: propertyBoolean(element, namespace, "b"),
    italic: propertyBoolean(element, namespace, "i"),
    underline: child(element, namespace, "u") === undefined ? undefined : valueChild(element, namespace, "u") ?? "single",
    strike: propertyBoolean(element, namespace, "strike"),
    color: parseSpreadsheetColor(child(element, namespace, "color")),
  });
}

function parseFill(element: LosslessXmlElement, namespace: string): SpreadsheetFill {
  const pattern = child(element, namespace, "patternFill");
  return Object.freeze({
    patternType: pattern === undefined ? undefined : attr(pattern, "patternType"),
    foreground: pattern === undefined ? undefined : parseSpreadsheetColor(child(pattern, namespace, "fgColor")),
    background: pattern === undefined ? undefined : parseSpreadsheetColor(child(pattern, namespace, "bgColor")),
  });
}

function parseBorder(element: LosslessXmlElement, namespace: string): SpreadsheetBorder {
  return Object.freeze({
    left: parseEdge(child(element, namespace, "left") ?? child(element, namespace, "start"), namespace),
    right: parseEdge(child(element, namespace, "right") ?? child(element, namespace, "end"), namespace),
    top: parseEdge(child(element, namespace, "top"), namespace),
    bottom: parseEdge(child(element, namespace, "bottom"), namespace),
  });
}

function parseEdge(element: LosslessXmlElement | undefined, namespace: string): SpreadsheetBorderEdge {
  if (element === undefined) return EMPTY_EDGE;
  return Object.freeze({ style: attr(element, "style"), color: parseSpreadsheetColor(child(element, namespace, "color")) });
}

export function parseSpreadsheetColor(element: LosslessXmlElement | undefined): SpreadsheetColor | undefined {
  if (element === undefined) return undefined;
  const tint = optionalDouble(attr(element, "tint"), "color tint") ?? 0;
  if (tint < -1 || tint > 1) throw styleError("Color tint must be between -1 and 1.");
  const selectors = ["auto", "indexed", "rgb", "theme"].filter((name) => attr(element, name) !== undefined);
  if (selectors.length > 1) throw styleError("A color must not use multiple color selectors.");
  const rgb = attr(element, "rgb");
  if (rgb !== undefined) {
    const argb = rgb.length === 6 ? `FF${rgb.toUpperCase()}` : rgb.toUpperCase();
    if (!/^[0-9A-F]{8}$/.test(argb)) throw styleError("RGB colors must contain six or eight hexadecimal digits.");
    return Object.freeze({ type: "rgb", argb, tint });
  }
  const theme = attr(element, "theme");
  if (theme !== undefined) return Object.freeze({ type: "theme", index: parseUnsigned(theme, "theme color"), tint });
  const indexed = attr(element, "indexed");
  if (indexed !== undefined) return Object.freeze({ type: "indexed", index: parseUnsigned(indexed, "indexed color"), tint });
  if (attr(element, "auto") !== undefined) return Object.freeze({ type: "automatic", tint });
  return undefined;
}

function tintArgb(argb: string, tint: number): string {
  if (tint === 0) return argb;
  const red = Number.parseInt(argb.slice(2, 4), 16) / 255;
  const green = Number.parseInt(argb.slice(4, 6), 16) / 255;
  const blue = Number.parseInt(argb.slice(6, 8), 16) / 255;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  let hue = 0;
  let saturation = 0;
  let lightness = (maximum + minimum) / 2;
  if (maximum !== minimum) {
    const delta = maximum - minimum;
    saturation = lightness > 0.5 ? delta / (2 - maximum - minimum) : delta / (maximum + minimum);
    if (maximum === red) hue = (green - blue) / delta + (green < blue ? 6 : 0);
    else if (maximum === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    hue /= 6;
  }
  lightness = tint < 0 ? lightness * (1 + tint) : lightness + (1 - lightness) * tint;
  const channels = saturation === 0
    ? [lightness, lightness, lightness]
    : [hue + 1 / 3, hue, hue - 1 / 3].map((channel) => hueChannel(lightness, saturation, channel));
  return `FF${channels.map((channel) => Math.round(channel * 255).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

function hueChannel(lightness: number, saturation: number, rawHue: number): number {
  const hue = rawHue < 0 ? rawHue + 1 : rawHue > 1 ? rawHue - 1 : rawHue;
  const high = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
  const low = 2 * lightness - high;
  if (hue < 1 / 6) return low + (high - low) * 6 * hue;
  if (hue < 1 / 2) return high;
  if (hue < 2 / 3) return low + (high - low) * (2 / 3 - hue) * 6;
  return low;
}

function parseRecords(root: LosslessXmlElement, namespace: string, collection: string): FormatRecord[] {
  return parseCollection(root, namespace, collection, "xf", (element) => Object.freeze({
    fontId: optionalUnsigned(attr(element, "fontId"), "fontId"),
    fillId: optionalUnsigned(attr(element, "fillId"), "fillId"),
    borderId: optionalUnsigned(attr(element, "borderId"), "borderId"),
    numberFormatId: optionalUnsigned(attr(element, "numFmtId"), "numFmtId"),
    baseFormatId: optionalUnsigned(attr(element, "xfId"), "xfId"),
    alignment: parseAlignment(child(element, namespace, "alignment")),
    applyFont: optionalBoolean(attr(element, "applyFont"), "applyFont"),
    applyFill: optionalBoolean(attr(element, "applyFill"), "applyFill"),
    applyBorder: optionalBoolean(attr(element, "applyBorder"), "applyBorder"),
    applyNumberFormat: optionalBoolean(attr(element, "applyNumberFormat"), "applyNumberFormat"),
    applyAlignment: optionalBoolean(attr(element, "applyAlignment"), "applyAlignment"),
  }));
}

function parseAlignment(element: LosslessXmlElement | undefined): Partial<SpreadsheetAlignment> | undefined {
  if (element === undefined) return undefined;
  const horizontal = attr(element, "horizontal");
  const vertical = attr(element, "vertical");
  const wrapText = optionalBoolean(attr(element, "wrapText"), "alignment wrapText");
  const shrinkToFit = optionalBoolean(attr(element, "shrinkToFit"), "alignment shrinkToFit");
  const textRotation = optionalUnsigned(attr(element, "textRotation"), "alignment textRotation");
  const indent = optionalUnsigned(attr(element, "indent"), "alignment indent");
  const readingOrder = optionalUnsigned(attr(element, "readingOrder"), "alignment readingOrder");
  if (horizontal !== undefined && !HORIZONTAL_ALIGNMENTS.has(horizontal)) {
    throw styleError(`Horizontal alignment ${JSON.stringify(horizontal)} is invalid.`);
  }
  if (vertical !== undefined && !VERTICAL_ALIGNMENTS.has(vertical)) {
    throw styleError(`Vertical alignment ${JSON.stringify(vertical)} is invalid.`);
  }
  if (textRotation !== undefined && textRotation > 180 && textRotation !== 255) {
    throw styleError("Alignment textRotation must be between 0 and 180, or 255 for stacked text.");
  }
  if (readingOrder !== undefined && readingOrder > 2) {
    throw styleError("Alignment readingOrder must be 0, 1, or 2.");
  }
  return Object.freeze({
    ...(horizontal === undefined ? {} : { horizontal }),
    ...(vertical === undefined ? {} : { vertical }),
    ...(wrapText === undefined ? {} : { wrapText }),
    ...(shrinkToFit === undefined ? {} : { shrinkToFit }),
    ...(textRotation === undefined ? {} : { textRotation }),
    ...(indent === undefined ? {} : { indent }),
    ...(readingOrder === undefined ? {} : { readingOrder: readingOrder as 0 | 1 | 2 }),
  });
}

const HORIZONTAL_ALIGNMENTS = new Set([
  "general", "left", "center", "right", "fill", "justify", "centerContinuous", "distributed",
]);
const VERTICAL_ALIGNMENTS = new Set(["top", "center", "bottom", "justify", "distributed"]);

function resolveRecord(
  direct: FormatRecord,
  bases: readonly FormatRecord[],
  fonts: readonly SpreadsheetFont[],
  fills: readonly SpreadsheetFill[],
  borders: readonly SpreadsheetBorder[],
  numberFormats: ReadonlyMap<number, string>,
): SpreadsheetCellFormat {
  const base = direct.baseFormatId === undefined ? undefined : bases[direct.baseFormatId];
  if (direct.baseFormatId !== undefined && base === undefined) throw styleError(`Base style index ${direct.baseFormatId} does not exist.`);
  const fontId = appliedId(direct.fontId, base?.fontId, direct.applyFont);
  const fillId = appliedId(direct.fillId, base?.fillId, direct.applyFill);
  const borderId = appliedId(direct.borderId, base?.borderId, direct.applyBorder);
  const numberFormatId = appliedId(direct.numberFormatId, base?.numberFormatId, direct.applyNumberFormat);
  const font = fonts[fontId];
  const fill = fills[fillId];
  const border = borders[borderId];
  if (font === undefined || fill === undefined || border === undefined) throw styleError("A cell format references a missing font, fill, or border.");
  return Object.freeze({
    font, fill, border, numberFormatId,
    numberFormatCode: numberFormats.get(numberFormatId),
    alignment: Object.freeze({
      ...DEFAULT_ALIGNMENT,
      ...(direct.applyAlignment === true
        ? direct.alignment
        : direct.applyAlignment === false
          ? base?.alignment
          : { ...base?.alignment, ...direct.alignment }),
    }),
  });
}

function appliedId(direct: number | undefined, base: number | undefined, apply: boolean | undefined): number {
  if (apply === false) return base ?? 0;
  if (apply === true) return direct ?? 0;
  return direct ?? base ?? 0;
}

function parseCollection<T>(root: LosslessXmlElement, namespace: string, collection: string, item: string, parser: (element: LosslessXmlElement) => T): T[] {
  const elements = collectionElements(root, namespace, collection, item);
  return elements.map(parser);
}

function collectionElements(root: LosslessXmlElement, namespace: string, collection: string, item: string): LosslessXmlElement[] {
  const containers = children(root, namespace, collection);
  if (containers.length > 1) throw styleError(`Styles collection ${collection} is duplicated.`);
  if (containers.length === 0) return [];
  const items = children(containers[0]!, namespace, item);
  const count = optionalUnsigned(attr(containers[0]!, "count"), `${collection} count`);
  if (count !== undefined && count !== items.length) throw styleError(`${collection} count does not match its items.`);
  return items;
}

function child(parent: LosslessXmlElement, namespace: string, name: string): LosslessXmlElement | undefined {
  const matches = children(parent, namespace, name);
  if (matches.length > 1) throw styleError(`Style element ${name} is duplicated.`);
  return matches[0];
}

function children(parent: LosslessXmlElement, namespace: string, name: string): LosslessXmlElement[] {
  return parent.children.filter((node): node is LosslessXmlElement => node.kind === "element" && node.namespaceUri === namespace && node.localName === name);
}

function attr(element: LosslessXmlElement, name: string): string | undefined {
  return element.attributes.find((candidate) => candidate.namespaceUri === "" && candidate.localName === name)?.value;
}

function requiredAttribute(element: LosslessXmlElement, name: string): string {
  const value = attr(element, name);
  if (value === undefined) throw styleError(`Style element ${element.localName} requires ${name}.`);
  return value;
}

function valueChild(parent: LosslessXmlElement, namespace: string, name: string): string | undefined {
  const element = child(parent, namespace, name);
  return element === undefined ? undefined : attr(element, "val");
}

function propertyBoolean(parent: LosslessXmlElement, namespace: string, name: string): boolean {
  const element = child(parent, namespace, name);
  return element === undefined ? false : optionalBoolean(attr(element, "val"), name) ?? true;
}

function requiredUnsigned(element: LosslessXmlElement, name: string): number {
  return parseUnsigned(requiredAttribute(element, name), name);
}

function optionalUnsigned(raw: string | undefined, context: string): number | undefined {
  return raw === undefined ? undefined : parseUnsigned(raw, context);
}

function parseUnsigned(raw: string, context: string): number {
  if (!/^(?:0|[1-9][0-9]*)$/.test(raw)) throw styleError(`${context} must be an unsigned integer.`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value > 0xffffffff) throw styleError(`${context} is outside the unsigned integer range.`);
  return value;
}

function optionalDouble(raw: string | undefined, context: string): number | undefined {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || raw.trim() === "") throw styleError(`${context} must be a finite number.`);
  return value;
}

function optionalBoolean(raw: string | undefined, context: string): boolean | undefined {
  if (raw === undefined) return undefined;
  if (raw === "1" || raw === "true") return true;
  if (raw === "0" || raw === "false") return false;
  throw styleError(`${context} must be an XML boolean.`);
}

function styleError(message: string): SpreadsheetError {
  return new SpreadsheetError("invalid_styles", message);
}
