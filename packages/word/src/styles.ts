import { wordThemeSlot } from './theme-colour-xml.ts';
import { resolveWordColour, resolveWordPaintProperties, DEFAULT_WORD_THEME, type WordThemeColour } from './theme-colours.ts';
import {
  OOXML_NAMESPACES,
  parseLosslessXml,
  parseThemeColorScheme,
  parseThemeFontScheme,
  type LosslessXmlElement,
  type ThemeColorScheme,
  type ThemeColorSlot,
  type ThemeFontScheme,
} from "@tumblerjs/ooxml";
import { RelationshipsError, type OpcPackage, type OpcPart, type PartName } from "@tumblerjs/opc";
import type { WordConformance, WordParagraph, WordRun } from "./document.ts";
import { WordError } from "./document.ts";

const STYLES_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml";
const THEME_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.theme+xml";
const MAX_STYLES = 100_000;
const MAX_STYLE_CHAIN = 100;

export type WordStyleType = "paragraph" | "character" | "table" | "numbering";
export type WordVerticalAlign = "baseline" | "superscript" | "subscript";

export type WordColor =
  | { readonly type: "automatic" }
  | { readonly type: "rgb"; readonly value: string }
  | { readonly type: "theme"; readonly slot: ThemeColorSlot; readonly tint?: number; readonly shade?: number; readonly fallback?: string };

export interface WordRunProperties {
  readonly fontFamily?: string;
  readonly themeFont?: "major" | "minor";
  readonly fontSizePoints?: number;
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly underline?: "none" | "single" | "double";
  readonly characterSpacingPoints?: number;
  readonly strike?: boolean;
  readonly color?: WordColor;
  readonly highlight?: string;
  readonly verticalAlign?: WordVerticalAlign;
  readonly rightToLeft?: boolean;
}

export interface WordTabStop {
  readonly positionTwips: number;
  readonly alignment: "start" | "center" | "end" | "decimal" | "bar" | "clear";
  readonly leader: "none" | "dot" | "hyphen" | "underscore" | "heavy" | "middleDot";
}

export interface WordLineSpacing {
  readonly rule: "auto" | "atLeast" | "exact";
  /** 240 means single spacing for `auto`; otherwise this is a twip measurement. */
  readonly value: number;
}

export interface WordParagraphProperties {
  readonly shading?: import('./theme-colours.ts').WordColour;
  readonly borders?: import('./table-format.ts').WordCellBorders;
  readonly styleId?: string;
  readonly alignment?: "start" | "center" | "end" | "justify" | "distribute";
  readonly spacingBeforeTwips?: number;
  readonly spacingAfterTwips?: number;
  readonly lineSpacing?: WordLineSpacing;
  readonly indentStartTwips?: number;
  readonly indentEndTwips?: number;
  readonly firstLineTwips?: number;
  readonly hangingTwips?: number;
  readonly keepNext?: boolean;
  readonly keepLines?: boolean;
  readonly pageBreakBefore?: boolean;
  readonly widowControl?: boolean;
  readonly contextualSpacing?: boolean;
  readonly rightToLeft?: boolean;
  readonly tabs?: readonly WordTabStop[];
}

export interface ComputedWordTextFormat {
  readonly fontFamily: string;
  readonly fontSizePoints: number;
  readonly bold: boolean;
  readonly italic: boolean;
  readonly underline: "none" | "single" | "double";
  readonly characterSpacingPoints?: number;
  readonly strike: boolean;
  readonly color: string;
  readonly themeColour?: WordThemeColour;
  readonly highlight: string | undefined;
  readonly verticalAlign: WordVerticalAlign;
  readonly rightToLeft: boolean;
}

export interface ComputedWordParagraphFormat {
  readonly borderColours?: import('./table-format.ts').WordCellBorders;
  readonly shadingColour?: import('./theme-colours.ts').WordColour;
  readonly shading?: string;
  readonly borders?: import('./table-format.ts').WordCellBorders;
  readonly styleId: string | undefined;
  readonly alignment: "start" | "center" | "end" | "justify" | "distribute";
  readonly spacingBeforeTwips: number;
  readonly spacingAfterTwips: number;
  readonly lineSpacing: WordLineSpacing;
  readonly indentStartTwips: number;
  readonly indentEndTwips: number;
  readonly firstLineTwips: number;
  readonly hangingTwips: number;
  readonly keepNext: boolean;
  readonly keepLines: boolean;
  readonly pageBreakBefore: boolean;
  readonly widowControl: boolean;
  readonly contextualSpacing: boolean;
  readonly rightToLeft: boolean;
  readonly tabs: readonly WordTabStop[];
}

export interface WordStyle {
  readonly styleId: string;
  readonly type: WordStyleType;
  readonly name: string | undefined;
  readonly basedOn: string | undefined;
  readonly linked: string | undefined;
  readonly isDefault: boolean;
  readonly paragraph: WordParagraphProperties;
  readonly run: WordRunProperties;
}

interface WordDocumentLike {
  readonly package: OpcPackage;
  readonly part: OpcPart;
  readonly source: { readonly element: (id: number) => LosslessXmlElement | undefined };
  readonly conformance: WordConformance;
}

export const DEFAULT_TEXT: ComputedWordTextFormat = Object.freeze({
  fontFamily: "Calibri",
  fontSizePoints: 11,
  bold: false,
  italic: false,
  underline: "none",
  strike: false,
  color: "#000000",
  highlight: undefined,
  verticalAlign: "baseline",
  rightToLeft: false,
});

export const DEFAULT_PARAGRAPH: ComputedWordParagraphFormat = Object.freeze({
  styleId: undefined,
  alignment: "start",
  spacingBeforeTwips: 0,
  spacingAfterTwips: 0,
  lineSpacing: Object.freeze({ rule: "auto", value: 240 }),
  indentStartTwips: 0,
  indentEndTwips: 0,
  firstLineTwips: 0,
  hangingTwips: 0,
  keepNext: false,
  keepLines: false,
  pageBreakBefore: false,
  widowControl: true,
  contextualSpacing: false,
  rightToLeft: false,
  tabs: Object.freeze([]),
});

export class WordStyles {
  readonly partName: PartName | undefined;
  readonly styles: readonly WordStyle[];
  readonly documentRunDefaults: WordRunProperties;
  readonly documentParagraphDefaults: WordParagraphProperties;
  readonly themeColors: ThemeColorScheme | undefined;
  readonly themeFonts: ThemeFontScheme | undefined;
  readonly #byId: ReadonlyMap<string, WordStyle>;
  readonly #defaultParagraphStyleId: string | undefined;
  readonly #defaultCharacterStyleId: string | undefined;

  constructor(input: {
    partName?: PartName;
    styles?: readonly WordStyle[];
    documentRunDefaults?: WordRunProperties;
    documentParagraphDefaults?: WordParagraphProperties;
    themeColors?: ThemeColorScheme;
    themeFonts?: ThemeFontScheme;
  } = {}) {
    this.partName = input.partName;
    this.styles = Object.freeze([...(input.styles ?? [])]);
    this.documentRunDefaults = Object.freeze({ ...(input.documentRunDefaults ?? {}) });
    this.documentParagraphDefaults = freezeParagraph(input.documentParagraphDefaults ?? {});
    this.themeColors = input.themeColors;
    this.themeFonts = input.themeFonts;
    this.#byId = new Map(this.styles.map((style) => [style.styleId, style]));
    this.#defaultParagraphStyleId = this.styles.find((style) => style.type === "paragraph" && style.isDefault)?.styleId;
    this.#defaultCharacterStyleId = this.styles.find((style) => style.type === "character" && style.isDefault)?.styleId;
  }

  style(id: string): WordStyle | undefined {
    return this.#byId.get(id);
  }

  /** Resolve a named paragraph style without reading document XML. */
  resolveParagraphStyle(styleId: string) {
    const chain = this.styleChain(styleId, 'paragraph');
    return {
      paragraph: computedParagraph(chain.reduce((value, style) => mergeParagraph(value, style.paragraph), this.documentParagraphDefaults), styleId, this.themeColors),
      text: this.computedRun(chain.reduce((value, style) => mergeRun(value, style.run), this.documentRunDefaults)),
    };
  }

  /** Resolve inherited run formatting while retaining an imported character style. */
  resolveStyledRun(paragraphStyleId: string, characterStyleId?: string): ComputedWordTextFormat {
    const paragraph = this.styleChain(paragraphStyleId, 'paragraph').reduce((value, style) => mergeRun(value, style.run), this.documentRunDefaults);
    return this.computedRun(this.styleChain(characterStyleId ?? this.#defaultCharacterStyleId, 'character').reduce((value, style) => mergeRun(value, style.run), paragraph));
  }

  runCharacterStyle(document: WordDocumentLike, run: WordRun): string | undefined {
    return run.propertiesElementId === undefined ? undefined : valueChild(requiredElement(document, run.propertiesElementId), wordNamespace(document.conformance), 'rStyle');
  }

  paragraphFormat(document: WordDocumentLike, paragraph: WordParagraph): ComputedWordParagraphFormat {
    const direct = paragraph.propertiesElementId === undefined
      ? {}
      : parseParagraphProperties(requiredElement(document, paragraph.propertiesElementId), wordNamespace(document.conformance));
    const styleId = direct.styleId ?? this.#defaultParagraphStyleId;
    const cascade = this.styleChain(styleId, "paragraph").reduce(
      (result, style) => mergeParagraph(result, style.paragraph),
      this.documentParagraphDefaults,
    );
    return computedParagraph(mergeParagraph(cascade, direct), styleId, this.themeColors);
  }

  // Without a run, resolve inherited text formatting for an empty paragraph.
  runFormat(document: WordDocumentLike, paragraph: WordParagraph, run?: WordRun): ComputedWordTextFormat {
    const namespace = wordNamespace(document.conformance);
    const paragraphDirect = paragraph.propertiesElementId === undefined
      ? {}
      : parseParagraphProperties(requiredElement(document, paragraph.propertiesElementId), namespace);
    const paragraphStyleId = paragraphDirect.styleId ?? this.#defaultParagraphStyleId;
    const paragraphRun = this.styleChain(paragraphStyleId, "paragraph").reduce(
      (result, style) => mergeRun(result, style.run),
      this.documentRunDefaults,
    );
    const runDirect = run?.propertiesElementId === undefined
      ? {}
      : parseRunProperties(requiredElement(document, run.propertiesElementId), namespace);
    const runElement = run?.propertiesElementId === undefined ? undefined : requiredElement(document, run.propertiesElementId);
    const characterStyleId = runElement === undefined ? this.#defaultCharacterStyleId : valueChild(runElement, namespace, "rStyle") ?? this.#defaultCharacterStyleId;
    const characterRun = this.styleChain(characterStyleId, "character").reduce(
      (result, style) => mergeRun(result, style.run),
      paragraphRun,
    );
    // Paragraph-mark formatting controls blank lines, but does not format ordinary runs.
    const paragraphProperties = paragraph.propertiesElementId === undefined ? undefined : requiredElement(document, paragraph.propertiesElementId);
    const mark = run === undefined && paragraphProperties
      ? onlyChild(paragraphProperties, namespace, 'rPr', 'Paragraph properties must not repeat rPr.') : undefined;
    return this.computedRun(mergeRun(characterRun, mark ? parseRunProperties(mark, namespace) : runDirect));
  }

  private styleChain(styleId: string | undefined, expectedType: "paragraph" | "character"): readonly WordStyle[] {
    if (styleId === undefined) return [];
    const reversed: WordStyle[] = [];
    const seen = new Set<string>();
    let current: string | undefined = styleId;
    while (current !== undefined) {
      if (seen.has(current)) throw new WordError("invalid_document", `Style ${JSON.stringify(current)} has a basedOn cycle.`);
      if (reversed.length >= MAX_STYLE_CHAIN) throw new WordError("limit_exceeded", `Style chain exceeds ${MAX_STYLE_CHAIN} entries.`);
      seen.add(current);
      const style = this.#byId.get(current);
      if (style === undefined) break;
      if (style.type !== expectedType) break;
      reversed.push(style);
      current = style.basedOn;
    }
    return Object.freeze(reversed.reverse());
  }

  private computedRun(properties: WordRunProperties): ComputedWordTextFormat {
    const fontFamily = properties.themeFont === undefined
      ? properties.fontFamily
      : this.themeFonts?.typeface(properties.themeFont, "latin") ?? properties.fontFamily;
    return Object.freeze({
      fontFamily: fontFamily ?? DEFAULT_TEXT.fontFamily,
      fontSizePoints: properties.fontSizePoints ?? DEFAULT_TEXT.fontSizePoints,
      bold: properties.bold ?? DEFAULT_TEXT.bold,
      italic: properties.italic ?? DEFAULT_TEXT.italic,
      underline: properties.underline ?? DEFAULT_TEXT.underline,
      strike: properties.strike ?? DEFAULT_TEXT.strike,
      color: this.resolveColor(properties.color) ?? DEFAULT_TEXT.color,
      ...(properties.color?.type === 'theme' ? { themeColour: { theme: properties.color.slot, fallback: this.resolveColor(properties.color) ?? DEFAULT_TEXT.color, ...(properties.color.tint === undefined ? {} : { tint: properties.color.tint }), ...(properties.color.shade === undefined ? {} : { shade: properties.color.shade }) } } : {}),
      highlight: properties.highlight,
      ...(properties.characterSpacingPoints === undefined ? {} : { characterSpacingPoints: properties.characterSpacingPoints }),
      verticalAlign: properties.verticalAlign ?? DEFAULT_TEXT.verticalAlign,
      rightToLeft: properties.rightToLeft ?? DEFAULT_TEXT.rightToLeft,
    });
  }

  private resolveColor(color: WordColor | undefined): string | undefined {
    if (color === undefined || color.type === "automatic") return undefined;
    if (color.type === "rgb") return `#${color.value}`;
    return resolveWordColour({ theme: color.slot, fallback: color.fallback ?? '#000000', ...(color.tint === undefined ? {} : { tint: color.tint }), ...(color.shade === undefined ? {} : { shade: color.shade }) }, this.themeColors);
  }
}

export function readWordStyles(document: WordDocumentLike): WordStyles {
  const namespace = wordNamespace(document.conformance);
  const relationshipNamespace = officeRelationshipsNamespace(document.conformance);
  const stylesPart = relatedPart(document.package, document.part, `${relationshipNamespace}/styles`, STYLES_CONTENT_TYPE, "Styles");
  const themePart = relatedPart(document.package, document.part, `${relationshipNamespace}/theme`, THEME_CONTENT_TYPE, "Theme");
  let themeColors: ThemeColorScheme | undefined;
  let themeFonts: ThemeFontScheme | undefined;
  if (themePart !== undefined) {
    const bytes = document.package.readPart(themePart);
    try {
      themeColors = parseThemeColorScheme(bytes);
      themeFonts = parseThemeFontScheme(bytes);
    } catch (cause) {
      throw new WordError("invalid_document", "The Theme part is invalid.", { cause });
    }
  }
  if (stylesPart === undefined) return new WordStyles({
    ...(themeColors === undefined ? {} : { themeColors }),
    ...(themeFonts === undefined ? {} : { themeFonts }),
  });
  let root: LosslessXmlElement;
  try {
    root = parseLosslessXml(document.package.readPart(stylesPart)).root;
  } catch (cause) {
    throw new WordError("invalid_document", "The Styles part is not valid XML.", { cause });
  }
  if (root.namespaceUri !== namespace || root.localName !== "styles") {
    throw new WordError("invalid_document", "The Styles part must have a WordprocessingML styles root.");
  }
  const defaults = onlyChild(root, namespace, "docDefaults", "Styles must not repeat docDefaults.");
  const runDefault = defaults === undefined ? undefined : onlyChild(defaults, namespace, "rPrDefault", "docDefaults must not repeat rPrDefault.");
  const paragraphDefault = defaults === undefined ? undefined : onlyChild(defaults, namespace, "pPrDefault", "docDefaults must not repeat pPrDefault.");
  const runDefaultsElement = runDefault === undefined ? undefined : onlyChild(runDefault, namespace, "rPr", "rPrDefault must not repeat rPr.");
  const paragraphDefaultsElement = paragraphDefault === undefined ? undefined : onlyChild(paragraphDefault, namespace, "pPr", "pPrDefault must not repeat pPr.");
  const styleElements = children(root, namespace, "style");
  if (styleElements.length > MAX_STYLES) throw new WordError("limit_exceeded", `Styles exceed ${MAX_STYLES} entries.`);
  const seen = new Set<string>();
  const styles = styleElements.map((element): WordStyle => {
    const styleId = requiredAttr(element, namespace, "styleId");
    const type = attr(element, namespace, "type");
    if (type !== "paragraph" && type !== "character" && type !== "table" && type !== "numbering") {
      throw new WordError("invalid_document", `Style ${JSON.stringify(styleId)} has an unsupported type.`);
    }
    if (seen.has(styleId)) throw new WordError("invalid_document", `Style id ${JSON.stringify(styleId)} is duplicated.`);
    seen.add(styleId);
    const pPr = onlyChild(element, namespace, "pPr", "A style must not repeat pPr.");
    const rPr = onlyChild(element, namespace, "rPr", "A style must not repeat rPr.");
    return Object.freeze({
      styleId,
      type,
      name: valueChild(element, namespace, "name"),
      basedOn: valueChild(element, namespace, "basedOn"),
      linked: valueChild(element, namespace, "link"),
      isDefault: onOffAttr(element, namespace, "default") ?? false,
      paragraph: pPr === undefined ? Object.freeze({}) : parseParagraphProperties(pPr, namespace),
      run: rPr === undefined ? Object.freeze({}) : parseRunProperties(rPr, namespace),
    });
  });
  return new WordStyles({
    partName: stylesPart.name,
    styles,
    documentRunDefaults: runDefaultsElement === undefined ? {} : parseRunProperties(runDefaultsElement, namespace),
    documentParagraphDefaults: paragraphDefaultsElement === undefined ? {} : parseParagraphProperties(paragraphDefaultsElement, namespace),
    ...(themeColors === undefined ? {} : { themeColors }),
    ...(themeFonts === undefined ? {} : { themeFonts }),
  });
}

export function parseRunProperties(element: LosslessXmlElement, namespace: string): WordRunProperties {
  const fonts = onlyChild(element, namespace, "rFonts", "Run properties must not repeat rFonts.");
  const literalFont = fonts === undefined
    ? undefined
    : attr(fonts, namespace, "ascii") ?? attr(fonts, namespace, "hAnsi") ?? attr(fonts, namespace, "cs") ?? attr(fonts, namespace, "eastAsia");
  const themeValue = fonts === undefined
    ? undefined
    : attr(fonts, namespace, "asciiTheme") ?? attr(fonts, namespace, "hAnsiTheme") ?? attr(fonts, namespace, "csTheme") ?? attr(fonts, namespace, "eastAsiaTheme");
  const size = valueChild(element, namespace, "sz");
  const color = onlyChild(element, namespace, "color", "Run properties must not repeat color.");
  const underline = onlyChild(element, namespace, "u", "Run properties must not repeat underline.");
  const vertical = valueChild(element, namespace, "vertAlign");
  const highlight = valueChild(element, namespace, "highlight");
  const spacing = valueChild(element, namespace, "spacing");
  return Object.freeze({
    ...(literalFont === undefined ? {} : { fontFamily: literalFont }),
    ...(themeValue === undefined ? {} : { themeFont: themeValue.startsWith("major") ? "major" as const : "minor" as const }),
    ...(size === undefined ? {} : { fontSizePoints: halfPoints(size, "run font size") }),
    ...optionalOnOffChild(element, namespace, "b", "bold"),
    ...optionalOnOffChild(element, namespace, "i", "italic"),
    ...optionalOnOffChild(element, namespace, "strike", "strike"),
    ...optionalOnOffChild(element, namespace, "rtl", "rightToLeft"),
    ...(underline === undefined ? {} : { underline: underlineValue(attr(underline, namespace, "val")) }),
    ...(color === undefined ? {} : { color: parseColor(color, namespace) }),
    ...(highlight === undefined ? {} : { highlight }),
    ...(spacing === undefined ? {} : { characterSpacingPoints: integer(spacing, "character spacing", -2147483648, 2147483647) / 20 }),
    ...(vertical === "superscript" || vertical === "subscript" || vertical === "baseline" ? { verticalAlign: vertical } : {}),
  });
}

import { readTableShading, readTableBorders } from './table-format.ts';

export function parseParagraphProperties(element: LosslessXmlElement, namespace: string): WordParagraphProperties {
  const spacing = onlyChild(element, namespace, "spacing", "Paragraph properties must not repeat spacing.");
  const indentation = onlyChild(element, namespace, "ind", "Paragraph properties must not repeat ind.");
  const tabs = onlyChild(element, namespace, "tabs", "Paragraph properties must not repeat tabs.");
  const rawAlignment = valueChild(element, namespace, "jc");
  const rawLineRule = spacing === undefined ? undefined : attr(spacing, namespace, "lineRule");
  const rawLine = spacing === undefined ? undefined : attr(spacing, namespace, "line");
  const styleId = valueChild(element, namespace, "pStyle");
  const alignment = paragraphAlignment(rawAlignment);
  const lineRule = rawLineRule === "exact" || rawLineRule === "atLeast" ? rawLineRule : "auto";
  const lineSpacing = rawLine === undefined ? undefined : Object.freeze({
    rule: lineRule,
    value: integer(rawLine, "line spacing", 0, 2_147_483_647),
  });
  return freezeParagraph({
    ...(onlyChild(element, namespace, 'shd', 'Duplicate shading') === undefined ? {} : { shading: readTableShading(onlyChild(element, namespace, 'shd', 'Duplicate shading'), namespace)! }),
    ...(onlyChild(element, namespace, 'pBdr', 'Duplicate borders') === undefined ? {} : { borders: readTableBorders(onlyChild(element, namespace, 'pBdr', 'Duplicate borders'), namespace) }),
    ...(styleId === undefined ? {} : { styleId }),
    ...(alignment === undefined ? {} : { alignment }),
    ...(spacing === undefined || attr(spacing, namespace, "before") === undefined ? {} : { spacingBeforeTwips: twips(attr(spacing, namespace, "before")!, "spacing before") }),
    ...(spacing === undefined || attr(spacing, namespace, "after") === undefined ? {} : { spacingAfterTwips: twips(attr(spacing, namespace, "after")!, "spacing after") }),
    ...(lineSpacing === undefined ? {} : { lineSpacing }),
    ...(indentation === undefined || startIndent(indentation, namespace) === undefined ? {} : { indentStartTwips: signedTwips(startIndent(indentation, namespace)!, "start indentation") }),
    ...(indentation === undefined || endIndent(indentation, namespace) === undefined ? {} : { indentEndTwips: signedTwips(endIndent(indentation, namespace)!, "end indentation") }),
    ...(indentation === undefined || attr(indentation, namespace, "firstLine") === undefined ? {} : { firstLineTwips: twips(attr(indentation, namespace, "firstLine")!, "first-line indentation") }),
    ...(indentation === undefined || attr(indentation, namespace, "hanging") === undefined ? {} : { hangingTwips: twips(attr(indentation, namespace, "hanging")!, "hanging indentation") }),
    ...optionalOnOffChild(element, namespace, "keepNext", "keepNext"),
    ...optionalOnOffChild(element, namespace, "keepLines", "keepLines"),
    ...optionalOnOffChild(element, namespace, "pageBreakBefore", "pageBreakBefore"),
    ...optionalOnOffChild(element, namespace, "widowControl", "widowControl"),
    ...optionalOnOffChild(element, namespace, "contextualSpacing", "contextualSpacing"),
    ...optionalOnOffChild(element, namespace, "bidi", "rightToLeft"),
    ...(tabs === undefined ? {} : { tabs: parseTabStops(tabs, namespace) }),
  });
}

function parseTabStops(element: LosslessXmlElement, namespace: string): readonly WordTabStop[] {
  const result = children(element, namespace, "tab").map((tab): WordTabStop => {
    const rawAlignment = requiredAttr(tab, namespace, "val");
    const alignment = rawAlignment === "left" || rawAlignment === "start" ? "start"
      : rawAlignment === "right" || rawAlignment === "end" ? "end"
      : rawAlignment === "center" || rawAlignment === "decimal" || rawAlignment === "bar" || rawAlignment === "clear" ? rawAlignment
      : undefined;
    if (alignment === undefined) throw new WordError("invalid_document", `Unsupported tab alignment ${JSON.stringify(rawAlignment)}.`);
    const rawLeader = attr(tab, namespace, "leader") ?? "none";
    const leader = rawLeader === "dot" || rawLeader === "hyphen" || rawLeader === "underscore" || rawLeader === "heavy" || rawLeader === "middleDot"
      ? rawLeader : "none";
    return Object.freeze({
      positionTwips: signedTwips(requiredAttr(tab, namespace, "pos"), "tab position"),
      alignment,
      leader,
    });
  });
  return Object.freeze(result.sort((left, right) => left.positionTwips - right.positionTwips));
}

function computedParagraph(properties: WordParagraphProperties, styleId: string | undefined, theme?: ThemeColorScheme): ComputedWordParagraphFormat {
  return Object.freeze({
    styleId,
    ...(properties.shading === undefined ? {} : { shading: resolveWordColour(properties.shading, theme), shadingColour: properties.shading }),
    ...(properties.borders === undefined ? {} : { borders: resolveWordPaintProperties({ borders: properties.borders }, theme ?? DEFAULT_WORD_THEME).borders, borderColours: properties.borders }),
    alignment: properties.alignment ?? DEFAULT_PARAGRAPH.alignment,
    spacingBeforeTwips: properties.spacingBeforeTwips ?? DEFAULT_PARAGRAPH.spacingBeforeTwips,
    spacingAfterTwips: properties.spacingAfterTwips ?? DEFAULT_PARAGRAPH.spacingAfterTwips,
    lineSpacing: properties.lineSpacing ?? DEFAULT_PARAGRAPH.lineSpacing,
    indentStartTwips: properties.indentStartTwips ?? DEFAULT_PARAGRAPH.indentStartTwips,
    indentEndTwips: properties.indentEndTwips ?? DEFAULT_PARAGRAPH.indentEndTwips,
    firstLineTwips: properties.firstLineTwips ?? DEFAULT_PARAGRAPH.firstLineTwips,
    hangingTwips: properties.hangingTwips ?? DEFAULT_PARAGRAPH.hangingTwips,
    keepNext: properties.keepNext ?? DEFAULT_PARAGRAPH.keepNext,
    keepLines: properties.keepLines ?? DEFAULT_PARAGRAPH.keepLines,
    pageBreakBefore: properties.pageBreakBefore ?? DEFAULT_PARAGRAPH.pageBreakBefore,
    widowControl: properties.widowControl ?? DEFAULT_PARAGRAPH.widowControl,
    contextualSpacing: properties.contextualSpacing ?? DEFAULT_PARAGRAPH.contextualSpacing,
    rightToLeft: properties.rightToLeft ?? DEFAULT_PARAGRAPH.rightToLeft,
    tabs: properties.tabs ?? DEFAULT_PARAGRAPH.tabs,
  });
}

function mergeRun(base: WordRunProperties, overlay: WordRunProperties): WordRunProperties {
  return Object.freeze({ ...base, ...overlay });
}

function mergeParagraph(base: WordParagraphProperties, overlay: WordParagraphProperties): WordParagraphProperties {
  return freezeParagraph({ ...base, ...overlay });
}

function freezeParagraph(properties: WordParagraphProperties): WordParagraphProperties {
  return Object.freeze({ ...properties, ...(properties.tabs === undefined ? {} : { tabs: Object.freeze([...properties.tabs]) }) });
}

function relatedPart(
  pkg: OpcPackage,
  source: OpcPart,
  relationshipType: string,
  contentType: string,
  label: string,
): OpcPart | undefined {
  let matches;
  try {
    matches = pkg.relationships(source.name).byType(relationshipType);
  } catch (cause) {
    if (cause instanceof RelationshipsError && cause.code === "missing_item") return undefined;
    throw new WordError("invalid_document", `${label} relationships are invalid.`, { cause });
  }
  if (matches.length === 0) return undefined;
  if (matches.length !== 1 || matches[0]?.targetMode !== "Internal") {
    throw new WordError("invalid_document", `A document must reference at most one internal ${label} part.`);
  }
  const part = pkg.getPart(matches[0].targetPartName);
  if (part?.contentType !== contentType) throw new WordError("invalid_document", `The ${label} part has an unsupported content type.`);
  return part;
}

function wordNamespace(conformance: WordConformance): string {
  return OOXML_NAMESPACES[conformance].wordprocessing;
}

function officeRelationshipsNamespace(conformance: WordConformance): string {
  return conformance === "strict"
    ? "http://purl.oclc.org/ooxml/officeDocument/relationships"
    : "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
}

function requiredElement(document: WordDocumentLike, id: number): LosslessXmlElement {
  const element = document.source.element(id);
  if (element === undefined) throw new TypeError("The WordprocessingML source element no longer exists.");
  return element;
}

function children(element: LosslessXmlElement, namespace: string, localName: string): LosslessXmlElement[] {
  return element.children.filter((child): child is LosslessXmlElement =>
    child.kind === "element" && child.namespaceUri === namespace && child.localName === localName
  );
}

function onlyChild(element: LosslessXmlElement, namespace: string, localName: string, message: string): LosslessXmlElement | undefined {
  const matches = children(element, namespace, localName);
  if (matches.length > 1) throw new WordError("invalid_document", message);
  return matches[0];
}

function attr(element: LosslessXmlElement, namespace: string, localName: string): string | undefined {
  return element.attributes.find((candidate) => candidate.namespaceUri === namespace && candidate.localName === localName)?.value;
}

function requiredAttr(element: LosslessXmlElement, namespace: string, localName: string): string {
  const value = attr(element, namespace, localName);
  if (value === undefined || value.length === 0) throw new WordError("invalid_document", `${element.localName} requires ${localName}.`);
  return value;
}

function valueChild(element: LosslessXmlElement, namespace: string, localName: string): string | undefined {
  const child = onlyChild(element, namespace, localName, `${element.localName} must not repeat ${localName}.`);
  return child === undefined ? undefined : attr(child, namespace, "val");
}

function optionalOnOffChild<K extends string>(
  element: LosslessXmlElement,
  namespace: string,
  localName: string,
  key: K,
): { readonly [P in K]?: boolean } {
  const child = onlyChild(element, namespace, localName, `${element.localName} must not repeat ${localName}.`);
  if (child === undefined) return {};
  return { [key]: onOffValue(attr(child, namespace, "val")) } as { readonly [P in K]?: boolean };
}

function onOffAttr(element: LosslessXmlElement, namespace: string, localName: string): boolean | undefined {
  const raw = attr(element, namespace, localName);
  return raw === undefined ? undefined : onOffValue(raw);
}

function onOffValue(raw: string | undefined): boolean {
  if (raw === undefined || raw === "1" || raw === "true" || raw === "on") return true;
  if (raw === "0" || raw === "false" || raw === "off") return false;
  throw new WordError("invalid_document", `Invalid on/off value ${JSON.stringify(raw)}.`);
}

function halfPoints(raw: string, label: string): number {
  return integer(raw, label, 1, 16_380) / 2;
}

function twips(raw: string, label: string): number {
  return integer(raw, label, 0, 2_147_483_647);
}

function signedTwips(raw: string, label: string): number {
  if (!/^-?[0-9]+$/.test(raw)) throw new WordError("invalid_document", `${label} must be an integer measurement.`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < -2_147_483_648 || value > 2_147_483_647) {
    throw new WordError("invalid_document", `${label} is outside the supported range.`);
  }
  return value;
}

function integer(raw: string, label: string, minimum: number, maximum: number): number {
  if (!/^[0-9]+$/.test(raw)) throw new WordError("invalid_document", `${label} must be an unsigned integer.`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new WordError("invalid_document", `${label} is outside the supported range.`);
  }
  return value;
}

function underlineValue(raw: string | undefined): "none" | "single" | "double" {
  if (raw === undefined || raw === "single" || raw === "words") return "single";
  if (raw === "double") return "double";
  if (raw === "none") return "none";
  return "single";
}

function parseColor(element: LosslessXmlElement, namespace: string): WordColor {
  const theme = attr(element, namespace, "themeColor");
  const slot = theme === undefined ? undefined : wordThemeSlot(theme);
  if (slot) {
    const byte = (name: string) => {
      const raw = attr(element, namespace, name);
      if (raw === undefined) return undefined;
      if (!/^[0-9a-f]{2}$/i.test(raw)) throw new WordError('invalid_document', 'Theme tint/shade must be a hexadecimal byte.');
      return parseInt(raw, 16);
    };
    const tint = byte('themeTint'), shade = byte('themeShade'), fallback = attr(element, namespace, 'val');
    return Object.freeze({ type: 'theme', slot, ...(tint === undefined ? {} : { tint }), ...(shade === undefined ? {} : { shade }), ...(fallback && /^[0-9a-f]{6}$/i.test(fallback) ? { fallback: '#' + fallback } : {}) });
  }
  const value = attr(element, namespace, "val");
  if (value === undefined || value === "auto") return Object.freeze({ type: "automatic" });
  if (!/^[0-9A-Fa-f]{6}$/.test(value)) throw new WordError("invalid_document", "Text color must be auto or six hexadecimal digits.");
  return Object.freeze({ type: "rgb", value: value.toUpperCase() });
}


function paragraphAlignment(value: string | undefined): WordParagraphProperties["alignment"] {
  if (value === "center") return "center";
  if (value === "right" || value === "end") return "end";
  if (value === "both") return "justify";
  if (value === "distribute") return "distribute";
  if (value === "left" || value === "start") return "start";
  return undefined;
}

function startIndent(element: LosslessXmlElement, namespace: string): string | undefined {
  return attr(element, namespace, "start") ?? attr(element, namespace, "left");
}

function endIndent(element: LosslessXmlElement, namespace: string): string | undefined {
  return attr(element, namespace, "end") ?? attr(element, namespace, "right");
}
