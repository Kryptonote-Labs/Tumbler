import { OOXML_NAMESPACES, parseLosslessXml, type LosslessXmlDocument, type LosslessXmlElement } from "@tumblerjs/ooxml";
import { RelationshipsError, type OpcPackage, type OpcPart, type Relationships } from "@tumblerjs/opc";
import { readWordStyles, type WordStyles } from "./styles.ts";

const MAIN_DOCUMENT_CONTENT_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
  "application/vnd.ms-word.document.macroEnabled.main+xml",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.template.main+xml",
  "application/vnd.ms-word.template.macroEnabledTemplate.main+xml",
]);

const DEFAULT_MAX_BLOCKS = 100_000;
const DEFAULT_MAX_INLINE_ITEMS = 1_000_000;
const DEFAULT_MAX_TEXT_CHARACTERS = 32 * 1024 * 1024;

export type WordConformance = "strict" | "transitional";
export type WordErrorCode =
  | "invalid_document"
  | "limit_exceeded"
  | "unsupported_document";

export class WordError extends Error {
  readonly code: WordErrorCode;

  constructor(code: WordErrorCode, message: string, options: { cause?: unknown } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "WordError";
    this.code = code;
  }
}

export interface OpenWordDocumentOptions {
  readonly maxBlocks?: number;
  readonly maxInlineItems?: number;
  readonly maxTextCharacters?: number;
}

export interface WordParagraph {
  readonly kind: "paragraph";
  readonly elementId: number;
  readonly propertiesElementId: number | undefined;
  readonly inlines: readonly WordInline[];
  readonly section: WordSectionProperties | undefined;
}

export interface WordTable {
  readonly kind: "table";
  readonly elementId: number;
  readonly rows: readonly WordTableRow[];
}

export interface WordTableRow {
  readonly elementId: number;
  readonly cells: readonly WordTableCell[];
}

export interface WordTableCell {
  readonly elementId: number;
  readonly blocks: readonly WordBlock[];
}

export interface WordUnsupportedBlock {
  readonly kind: "unsupported";
  readonly elementId: number;
  readonly localName: string;
}

export type WordBlock = WordParagraph | WordTable | WordUnsupportedBlock;

export interface WordRun {
  readonly kind: "run";
  readonly elementId: number;
  readonly propertiesElementId: number | undefined;
  readonly contents: readonly WordRunContent[];
}

export interface WordHyperlink {
  readonly kind: "hyperlink";
  readonly elementId: number;
  readonly relationshipId: string | undefined;
  readonly anchor: string | undefined;
  readonly target: string | undefined;
  readonly runs: readonly WordRun[];
}

export interface WordBookmarkMarker {
  readonly kind: "bookmark-start" | "bookmark-end";
  readonly elementId: number;
  readonly id: string | undefined;
  readonly name: string | undefined;
}

export interface WordRevision {
  readonly kind: "insertion" | "deletion";
  readonly elementId: number;
  readonly runs: readonly WordRun[];
}

export interface WordUnsupportedInline {
  readonly kind: "unsupported";
  readonly elementId: number;
  readonly localName: string;
}

export type WordInline = WordRun | WordHyperlink | WordBookmarkMarker | WordRevision | WordUnsupportedInline;

export interface WordText {
  readonly kind: "text" | "deleted-text" | "field-instruction";
  readonly elementId: number;
  readonly value: string;
  readonly preserveSpace: boolean;
}

export interface WordTab {
  readonly kind: "tab";
  readonly elementId: number;
}

export type WordBreakType = "line" | "page" | "column";

export interface WordBreak {
  readonly kind: "break";
  readonly elementId: number;
  readonly breakType: WordBreakType;
}

export interface WordFieldCharacter {
  readonly kind: "field-character";
  readonly elementId: number;
  readonly fieldType: "begin" | "separate" | "end" | undefined;
}

export interface WordDrawingReference {
  readonly kind: "drawing";
  readonly elementId: number;
}

export interface WordUnsupportedRunContent {
  readonly kind: "unsupported";
  readonly elementId: number;
  readonly localName: string;
}

export type WordRunContent =
  | WordText
  | WordTab
  | WordBreak
  | WordFieldCharacter
  | WordDrawingReference
  | WordUnsupportedRunContent;

export interface WordSectionProperties {
  readonly elementId: number;
  readonly pageWidthTwips: number;
  readonly pageHeightTwips: number;
  readonly orientation: "portrait" | "landscape";
  readonly marginTopTwips: number;
  readonly marginRightTwips: number;
  readonly marginBottomTwips: number;
  readonly marginLeftTwips: number;
  readonly headerDistanceTwips: number;
  readonly footerDistanceTwips: number;
  readonly gutterTwips: number;
  readonly columnCount: number;
  readonly columnSpaceTwips: number;
}

interface ParseBudget {
  readonly maxBlocks: number;
  readonly maxInlineItems: number;
  readonly maxTextCharacters: number;
  blocks: number;
  inlineItems: number;
  textCharacters: number;
}

export class WordDocument {
  readonly package: OpcPackage;
  readonly part: OpcPart;
  readonly source: LosslessXmlDocument;
  readonly conformance: WordConformance;
  readonly blocks: readonly WordBlock[];
  readonly finalSection: WordSectionProperties;
  readonly styles: WordStyles;

  constructor(input: {
    pkg: OpcPackage;
    part: OpcPart;
    source: LosslessXmlDocument;
    conformance: WordConformance;
    blocks: readonly WordBlock[];
    finalSection: WordSectionProperties;
    styles: WordStyles;
  }) {
    this.package = input.pkg;
    this.part = input.part;
    this.source = input.source;
    this.conformance = input.conformance;
    this.blocks = Object.freeze([...input.blocks]);
    this.finalSection = input.finalSection;
    this.styles = input.styles;
  }

  bytes(): Uint8Array {
    return this.package.archive.originalBytes();
  }
}

/** Opens the WordprocessingML Main Document part without normalizing source markup. */
export function openWordDocument(pkg: OpcPackage, options: OpenWordDocumentOptions = {}): WordDocument {
  const main = pkg.mainOfficeDocumentPart();
  if (main.family !== "word" || !MAIN_DOCUMENT_CONTENT_TYPES.has(main.contentType)) {
    throw new WordError("unsupported_document", "The package is not a supported WordprocessingML document.");
  }
  let source: LosslessXmlDocument;
  try {
    source = parseLosslessXml(pkg.readPart(main));
  } catch (cause) {
    throw new WordError("invalid_document", "The Main Document part is not valid XML.", { cause });
  }
  const profile = (["strict", "transitional"] as const).find(
    (candidate) => source.root.namespaceUri === OOXML_NAMESPACES[candidate].wordprocessing,
  );
  if (profile === undefined || source.root.localName !== "document") {
    throw new WordError("invalid_document", "The Main Document part must have a WordprocessingML document root.");
  }
  const namespace = OOXML_NAMESPACES[profile].wordprocessing;
  const bodies = children(source.root, namespace, "body");
  if (bodies.length !== 1) throw new WordError("invalid_document", "A document must contain exactly one body.");
  const budget: ParseBudget = {
    maxBlocks: boundedLimit(options.maxBlocks, DEFAULT_MAX_BLOCKS, "block"),
    maxInlineItems: boundedLimit(options.maxInlineItems, DEFAULT_MAX_INLINE_ITEMS, "inline item"),
    maxTextCharacters: boundedLimit(options.maxTextCharacters, DEFAULT_MAX_TEXT_CHARACTERS, "text character"),
    blocks: 0,
    inlineItems: 0,
    textCharacters: 0,
  };
  let relationships: Relationships | undefined;
  try {
    relationships = pkg.relationships(main.name);
  } catch (cause) {
    if (!(cause instanceof RelationshipsError) || cause.code !== "missing_item") {
      throw new WordError("invalid_document", "The Main Document relationships are invalid.", { cause });
    }
  }
  const body = bodies[0]!;
  const blocks = body.children
    .filter((node): node is LosslessXmlElement => node.kind === "element")
    .filter((element) => !(element.namespaceUri === namespace && element.localName === "sectPr"))
    .map((element) => parseBlock(element, source, namespace, relationships, budget));
  const sectionElements = children(body, namespace, "sectPr");
  if (sectionElements.length > 1) throw new WordError("invalid_document", "A document body must not repeat final section properties.");
  const finalSection = parseSection(sectionElements[0], namespace);
  const styles = readWordStyles({ package: pkg, part: main, source, conformance: profile });
  return new WordDocument({ pkg, part: main, source, conformance: profile, blocks, finalSection, styles });
}

function parseBlock(
  element: LosslessXmlElement,
  source: LosslessXmlDocument,
  namespace: string,
  relationships: Relationships | undefined,
  budget: ParseBudget,
): WordBlock {
  takeBlock(budget);
  if (element.namespaceUri !== namespace) return unsupportedBlock(element);
  if (element.localName === "p") return parseParagraph(element, source, namespace, relationships, budget);
  if (element.localName === "tbl") return parseTable(element, source, namespace, relationships, budget);
  return unsupportedBlock(element);
}

function parseParagraph(
  element: LosslessXmlElement,
  source: LosslessXmlDocument,
  namespace: string,
  relationships: Relationships | undefined,
  budget: ParseBudget,
): WordParagraph {
  const properties = onlyChild(element, namespace, "pPr", "A paragraph must not repeat pPr.");
  const sectionElement = properties === undefined
    ? undefined
    : onlyChild(properties, namespace, "sectPr", "Paragraph properties must not repeat sectPr.");
  const inlines = element.children
    .filter((node): node is LosslessXmlElement => node.kind === "element")
    .filter((child) => child !== properties)
    .map((child) => parseInline(child, source, namespace, relationships, budget));
  return Object.freeze({
    kind: "paragraph",
    elementId: element.id,
    propertiesElementId: properties?.id,
    inlines: Object.freeze(inlines),
    section: sectionElement === undefined ? undefined : parseSection(sectionElement, namespace),
  });
}

function parseTable(
  element: LosslessXmlElement,
  source: LosslessXmlDocument,
  namespace: string,
  relationships: Relationships | undefined,
  budget: ParseBudget,
): WordTable {
  const rows = children(element, namespace, "tr").map((row): WordTableRow => Object.freeze({
    elementId: row.id,
    cells: Object.freeze(children(row, namespace, "tc").map((cell): WordTableCell => Object.freeze({
      elementId: cell.id,
      blocks: Object.freeze(cell.children
        .filter((node): node is LosslessXmlElement => node.kind === "element")
        .filter((child) => child.namespaceUri === namespace && (child.localName === "p" || child.localName === "tbl"))
        .map((child) => parseBlock(child, source, namespace, relationships, budget))),
    }))),
  }));
  return Object.freeze({ kind: "table", elementId: element.id, rows: Object.freeze(rows) });
}

function parseInline(
  element: LosslessXmlElement,
  source: LosslessXmlDocument,
  namespace: string,
  relationships: Relationships | undefined,
  budget: ParseBudget,
): WordInline {
  takeInline(budget);
  if (element.namespaceUri !== namespace) return unsupportedInline(element);
  if (element.localName === "r") return parseRun(element, source, namespace, budget);
  if (element.localName === "hyperlink") {
    const relationshipId = qualifiedAttr(element, relationshipsNamespace(namespace), "id");
    const relationship = relationshipId === undefined ? undefined : relationships?.get(relationshipId);
    return Object.freeze({
      kind: "hyperlink",
      elementId: element.id,
      relationshipId,
      anchor: attr(element, namespace, "anchor"),
      target: relationship?.targetMode === "External" ? relationship.target : undefined,
      runs: Object.freeze(children(element, namespace, "r").map((run) => parseRun(run, source, namespace, budget))),
    });
  }
  if (element.localName === "bookmarkStart" || element.localName === "bookmarkEnd") {
    return Object.freeze({
      kind: element.localName === "bookmarkStart" ? "bookmark-start" : "bookmark-end",
      elementId: element.id,
      id: attr(element, namespace, "id"),
      name: attr(element, namespace, "name"),
    });
  }
  if (element.localName === "ins" || element.localName === "del") {
    return Object.freeze({
      kind: element.localName === "ins" ? "insertion" : "deletion",
      elementId: element.id,
      runs: Object.freeze(children(element, namespace, "r").map((run) => parseRun(run, source, namespace, budget))),
    });
  }
  return unsupportedInline(element);
}

function parseRun(
  element: LosslessXmlElement,
  source: LosslessXmlDocument,
  namespace: string,
  budget: ParseBudget,
): WordRun {
  const properties = onlyChild(element, namespace, "rPr", "A run must not repeat rPr.");
  const contents = element.children
    .filter((node): node is LosslessXmlElement => node.kind === "element")
    .filter((child) => child !== properties)
    .map((child) => parseRunContent(child, source, namespace, budget));
  return Object.freeze({
    kind: "run",
    elementId: element.id,
    propertiesElementId: properties?.id,
    contents: Object.freeze(contents),
  });
}

function parseRunContent(
  element: LosslessXmlElement,
  source: LosslessXmlDocument,
  namespace: string,
  budget: ParseBudget,
): WordRunContent {
  takeInline(budget);
  if (element.namespaceUri !== namespace) return unsupportedRunContent(element);
  if (element.localName === "t" || element.localName === "delText" || element.localName === "instrText") {
    const value = source.textContent(element);
    budget.textCharacters += value.length;
    if (budget.textCharacters > budget.maxTextCharacters) limit("text character", budget.maxTextCharacters);
    return Object.freeze({
      kind: element.localName === "t" ? "text" : element.localName === "delText" ? "deleted-text" : "field-instruction",
      elementId: element.id,
      value,
      preserveSpace: element.attributes.some((attribute) =>
        attribute.namespaceUri === "http://www.w3.org/XML/1998/namespace" &&
        attribute.localName === "space" && attribute.value === "preserve"
      ),
    });
  }
  if (element.localName === "tab" || element.localName === "ptab") {
    return Object.freeze({ kind: "tab", elementId: element.id });
  }
  if (element.localName === "br" || element.localName === "cr") {
    const rawType = element.localName === "cr" ? "textWrapping" : attr(element, namespace, "type") ?? "textWrapping";
    const breakType = rawType === "page" ? "page" : rawType === "column" ? "column" : "line";
    return Object.freeze({ kind: "break", elementId: element.id, breakType });
  }
  if (element.localName === "fldChar") {
    const fieldType = attr(element, namespace, "fldCharType");
    return Object.freeze({
      kind: "field-character",
      elementId: element.id,
      fieldType: fieldType === "begin" || fieldType === "separate" || fieldType === "end" ? fieldType : undefined,
    });
  }
  if (element.localName === "drawing" || element.localName === "object" || element.localName === "pict") {
    return Object.freeze({ kind: "drawing", elementId: element.id });
  }
  return unsupportedRunContent(element);
}

function parseSection(element: LosslessXmlElement | undefined, namespace: string): WordSectionProperties {
  const pageSize = element === undefined ? undefined : onlyChild(element, namespace, "pgSz", "Section properties must not repeat pgSz.");
  const pageMargins = element === undefined ? undefined : onlyChild(element, namespace, "pgMar", "Section properties must not repeat pgMar.");
  const columns = element === undefined ? undefined : onlyChild(element, namespace, "cols", "Section properties must not repeat cols.");
  const width = twipsAttr(pageSize, namespace, "w", 12_240);
  const height = twipsAttr(pageSize, namespace, "h", 15_840);
  const rawOrientation = pageSize === undefined ? undefined : attr(pageSize, namespace, "orient");
  return Object.freeze({
    elementId: element?.id ?? -1,
    pageWidthTwips: width,
    pageHeightTwips: height,
    orientation: rawOrientation === "landscape" ? "landscape" : "portrait",
    marginTopTwips: twipsAttr(pageMargins, namespace, "top", 1_440, true),
    marginRightTwips: twipsAttr(pageMargins, namespace, "right", 1_440),
    marginBottomTwips: twipsAttr(pageMargins, namespace, "bottom", 1_440, true),
    marginLeftTwips: twipsAttr(pageMargins, namespace, "left", 1_440),
    headerDistanceTwips: twipsAttr(pageMargins, namespace, "header", 720),
    footerDistanceTwips: twipsAttr(pageMargins, namespace, "footer", 720),
    gutterTwips: twipsAttr(pageMargins, namespace, "gutter", 0),
    columnCount: integerAttr(columns, namespace, "num", 1, 1, 45),
    columnSpaceTwips: twipsAttr(columns, namespace, "space", 720),
  });
}

function twipsAttr(
  element: LosslessXmlElement | undefined,
  namespace: string,
  name: string,
  fallback: number,
  signed = false,
): number {
  if (element === undefined) return fallback;
  const raw = attr(element, namespace, name);
  if (raw === undefined) return fallback;
  if (!(signed ? /^-?[0-9]+$/ : /^[0-9]+$/).test(raw)) throw new WordError("invalid_document", `${name} must be a twip measurement.`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) throw new WordError("invalid_document", `${name} is outside the supported measurement range.`);
  return value;
}

function integerAttr(
  element: LosslessXmlElement | undefined,
  namespace: string,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (element === undefined) return fallback;
  const raw = attr(element, namespace, name);
  if (raw === undefined) return fallback;
  if (!/^[0-9]+$/.test(raw)) throw new WordError("invalid_document", `${name} must be an unsigned integer.`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new WordError("invalid_document", `${name} must be between ${minimum} and ${maximum}.`);
  }
  return value;
}

function onlyChild(
  element: LosslessXmlElement,
  namespace: string,
  localName: string,
  message: string,
): LosslessXmlElement | undefined {
  const matches = children(element, namespace, localName);
  if (matches.length > 1) throw new WordError("invalid_document", message);
  return matches[0];
}

function children(element: LosslessXmlElement, namespace: string, localName: string): LosslessXmlElement[] {
  return element.children.filter((child): child is LosslessXmlElement =>
    child.kind === "element" && child.namespaceUri === namespace && child.localName === localName
  );
}

function attr(element: LosslessXmlElement, namespace: string, localName: string): string | undefined {
  return element.attributes.find((attribute) => attribute.namespaceUri === namespace && attribute.localName === localName)?.value;
}

function qualifiedAttr(element: LosslessXmlElement, namespace: string, localName: string): string | undefined {
  return element.attributes.find((attribute) => attribute.namespaceUri === namespace && attribute.localName === localName)?.value;
}

function relationshipsNamespace(wordprocessingNamespace: string): string {
  return wordprocessingNamespace === OOXML_NAMESPACES.strict.wordprocessing
    ? "http://purl.oclc.org/ooxml/officeDocument/relationships"
    : "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
}

function unsupportedBlock(element: LosslessXmlElement): WordUnsupportedBlock {
  return Object.freeze({ kind: "unsupported", elementId: element.id, localName: element.localName });
}

function unsupportedInline(element: LosslessXmlElement): WordUnsupportedInline {
  return Object.freeze({ kind: "unsupported", elementId: element.id, localName: element.localName });
}

function unsupportedRunContent(element: LosslessXmlElement): WordUnsupportedRunContent {
  return Object.freeze({ kind: "unsupported", elementId: element.id, localName: element.localName });
}

function boundedLimit(value: number | undefined, fallback: number, label: string): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < 0) throw new RangeError(`Maximum ${label} count must be a non-negative integer.`);
  return resolved;
}

function takeBlock(budget: ParseBudget): void {
  budget.blocks += 1;
  if (budget.blocks > budget.maxBlocks) limit("block", budget.maxBlocks);
}

function takeInline(budget: ParseBudget): void {
  budget.inlineItems += 1;
  if (budget.inlineItems > budget.maxInlineItems) limit("inline item", budget.maxInlineItems);
}

function limit(label: string, maximum: number): never {
  throw new WordError("limit_exceeded", `Document exceeds ${maximum} ${label}s.`);
}
