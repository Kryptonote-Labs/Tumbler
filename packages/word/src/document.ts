import { OOXML_NAMESPACES, parseLosslessXml, type LosslessXmlDocument, type LosslessXmlElement } from "@tumblerjs/ooxml";
import { RelationshipsError, type OpcPackage, type OpcPart, type Relationships } from "@tumblerjs/opc";
import { readWordStyles, type WordStyles } from "./styles.ts";
import { readWordNumbering, type WordNumbering } from "./numbering.ts";
import { readWordDrawings, type WordDrawing } from "./drawings.ts";

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
  readonly gridColumnWidthsTwips: readonly number[];
  readonly properties: WordTableProperties;
  readonly rows: readonly WordTableRow[];
}

export interface WordTableProperties {
  readonly width: WordTableWidth | undefined;
  readonly alignment: "start" | "center" | "end";
  readonly indentTwips: number;
  readonly layout: "autofit" | "fixed";
  readonly cellMargins: WordTableCellMargins;
}

export interface WordTableWidth {
  readonly type: "auto" | "dxa" | "pct" | "nil";
  readonly value: number;
}

export interface WordTableCellMargins {
  readonly topTwips: number;
  readonly endTwips: number;
  readonly bottomTwips: number;
  readonly startTwips: number;
}

export interface WordTableRow {
  readonly elementId: number;
  readonly gridBefore: number;
  readonly gridAfter: number;
  readonly cantSplit: boolean;
  readonly repeatHeader: boolean;
  readonly heightTwips: number | undefined;
  readonly heightRule: "auto" | "atLeast" | "exact";
  readonly cells: readonly WordTableCell[];
}

export interface WordTableCell {
  readonly elementId: number;
  readonly gridSpan: number;
  readonly verticalMerge: "restart" | "continue" | undefined;
  readonly width: WordTableWidth | undefined;
  readonly verticalAlignment: "top" | "center" | "bottom";
  readonly margins: WordTableCellMargins | undefined;
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

export interface WordNoteReference {
  readonly kind: "footnote-reference" | "endnote-reference";
  readonly elementId: number;
  readonly id: number;
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
  | WordNoteReference
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
  readonly breakType: "continuous" | "nextPage" | "nextColumn" | "evenPage" | "oddPage";
  readonly titlePage: boolean;
  readonly headerReferences: readonly WordHeaderFooterReference[];
  readonly footerReferences: readonly WordHeaderFooterReference[];
}

export interface WordHeaderFooterReference {
  readonly kind: "header" | "footer";
  readonly type: "default" | "first" | "even";
  readonly relationshipId: string;
}

export interface WordHeaderFooterStory {
  readonly kind: "header" | "footer";
  readonly type: "default" | "first" | "even";
  readonly relationshipId: string;
  readonly part: OpcPart;
  readonly source: LosslessXmlDocument;
  readonly blocks: readonly WordBlock[];
  readonly drawings: ReadonlyMap<number, WordDrawing>;
}

export interface WordNoteStory {
  readonly kind: "footnote" | "endnote";
  readonly id: number;
  readonly type: "normal" | "separator" | "continuation-separator" | "continuation-notice";
  readonly part: OpcPart;
  readonly source: LosslessXmlDocument;
  readonly blocks: readonly WordBlock[];
  readonly drawings: ReadonlyMap<number, WordDrawing>;
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
  readonly numbering: WordNumbering;
  readonly headerFooters: readonly WordHeaderFooterStory[];
  readonly drawings: ReadonlyMap<number, WordDrawing>;
  readonly notes: readonly WordNoteStory[];

  constructor(input: {
    pkg: OpcPackage;
    part: OpcPart;
    source: LosslessXmlDocument;
    conformance: WordConformance;
    blocks: readonly WordBlock[];
    finalSection: WordSectionProperties;
    styles: WordStyles;
    numbering: WordNumbering;
    headerFooters: readonly WordHeaderFooterStory[];
    drawings: ReadonlyMap<number, WordDrawing>;
    notes: readonly WordNoteStory[];
  }) {
    this.package = input.pkg;
    this.part = input.part;
    this.source = input.source;
    this.conformance = input.conformance;
    this.blocks = Object.freeze([...input.blocks]);
    this.finalSection = input.finalSection;
    this.styles = input.styles;
    this.numbering = input.numbering;
    this.headerFooters = Object.freeze([...input.headerFooters]);
    this.drawings = input.drawings;
    this.notes = Object.freeze([...input.notes]);
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
  const numbering = readWordNumbering({ package: pkg, part: main, source, conformance: profile });
  const drawings = readWordDrawings({ package: pkg, part: main, source, conformance: profile });
  const notes = readNoteStories(pkg, main, profile, budget);
  const headerFooters = readHeaderFooterStories(pkg, main, profile, [...blocks.flatMap(sectionReferences), ...finalSection.headerReferences, ...finalSection.footerReferences], budget);
  return new WordDocument({ pkg, part: main, source, conformance: profile, blocks, finalSection, styles, numbering, headerFooters, drawings, notes });
}

function readNoteStories(pkg: OpcPackage, main: OpcPart, conformance: WordConformance, budget: ParseBudget): readonly WordNoteStory[] {
  const relationshipPrefix = conformance === "strict" ? "http://purl.oclc.org/ooxml/officeDocument/relationships" : "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const namespace = OOXML_NAMESPACES[conformance].wordprocessing;
  let relationships: Relationships;
  try { relationships = pkg.relationships(main.name); }
  catch (cause) { if (cause instanceof RelationshipsError && cause.code === "missing_item") return Object.freeze([]); throw cause; }
  const stories: WordNoteStory[] = [];
  for (const kind of ["footnote", "endnote"] as const) {
    const plural = `${kind}s`;
    const matches = relationships.byType(`${relationshipPrefix}/${plural}`);
    if (matches.length > 1) throw new WordError("invalid_document", `The Main Document must not have multiple ${plural} relationships.`);
    const relationship = matches[0];
    if (relationship === undefined) continue;
    if (relationship.targetMode !== "Internal") throw new WordError("invalid_document", `${plural} must target an internal part.`);
    const part = pkg.getPart(relationship.targetPartName);
    const expected = `application/vnd.openxmlformats-officedocument.wordprocessingml.${plural}+xml`;
    if (part === undefined || part.contentType !== expected) throw new WordError("invalid_document", `The ${plural} relationship target has the wrong content type.`);
    let source: LosslessXmlDocument;
    try { source = parseLosslessXml(pkg.readPart(part)); }
    catch (cause) { throw new WordError("invalid_document", `The ${plural} part is not valid XML.`, { cause }); }
    if (source.root.namespaceUri !== namespace || source.root.localName !== plural) throw new WordError("invalid_document", `The ${plural} part has an invalid root element.`);
    let noteRelationships: Relationships | undefined;
    try { noteRelationships = pkg.relationships(part.name); }
    catch (cause) { if (!(cause instanceof RelationshipsError) || cause.code !== "missing_item") throw cause; }
    const drawings = readWordDrawings({ package: pkg, part, source, conformance });
    for (const element of children(source.root, namespace, kind)) {
      const rawId = attr(element, namespace, "id");
      if (rawId === undefined || !/^-?[0-9]+$/.test(rawId)) throw new WordError("invalid_document", `${kind} is missing a signed integer id.`);
      const id = Number(rawId);
      if (!Number.isSafeInteger(id)) throw new WordError("invalid_document", `${kind} id is outside the supported range.`);
      const rawType = attr(element, namespace, "type");
      const type = rawType === "separator" || rawType === "continuationSeparator" || rawType === "continuationNotice" ? rawType : "normal";
      const normalizedType = type === "continuationSeparator" ? "continuation-separator" : type === "continuationNotice" ? "continuation-notice" : type;
      const blocks = element.children.filter((node): node is LosslessXmlElement => node.kind === "element")
        .filter((child) => child.namespaceUri === namespace && (child.localName === "p" || child.localName === "tbl"))
        .map((child) => parseBlock(child, source, namespace, noteRelationships, budget));
      stories.push(Object.freeze({ kind, id, type: normalizedType, part, source, blocks: Object.freeze(blocks), drawings }));
    }
  }
  return Object.freeze(stories);
}

function sectionReferences(block: WordBlock): readonly WordHeaderFooterReference[] {
  if (block.kind !== "paragraph" || block.section === undefined) return [];
  return [...block.section.headerReferences, ...block.section.footerReferences];
}

function readHeaderFooterStories(
  pkg: OpcPackage,
  main: OpcPart,
  conformance: WordConformance,
  references: readonly WordHeaderFooterReference[],
  budget: ParseBudget,
): readonly WordHeaderFooterStory[] {
  if (references.length === 0) return Object.freeze([]);
  const relationships = pkg.relationships(main.name);
  const namespace = OOXML_NAMESPACES[conformance].wordprocessing;
  const expectedTypePrefix = conformance === "strict" ? "http://purl.oclc.org/ooxml/officeDocument/relationships" : "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const seen = new Set<string>();
  const stories: WordHeaderFooterStory[] = [];
  for (const reference of references) {
    const key = `${reference.kind}:${reference.type}:${reference.relationshipId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const relationship = relationships.get(reference.relationshipId);
    if (relationship?.targetMode !== "Internal" || relationship.type !== `${expectedTypePrefix}/${reference.kind}`) {
      throw new WordError("invalid_document", `A ${reference.kind} reference must resolve to an internal ${reference.kind} relationship.`);
    }
    const part = pkg.getPart(relationship.targetPartName);
    const expectedContentType = `application/vnd.openxmlformats-officedocument.wordprocessingml.${reference.kind}+xml`;
    if (part === undefined || part.contentType !== expectedContentType) throw new WordError("invalid_document", `The ${reference.kind} relationship target has the wrong content type.`);
    let source: LosslessXmlDocument;
    try { source = parseLosslessXml(pkg.readPart(part)); }
    catch (cause) { throw new WordError("invalid_document", `The ${reference.kind} part is not valid XML.`, { cause }); }
    if (source.root.namespaceUri !== namespace || source.root.localName !== (reference.kind === "header" ? "hdr" : "ftr")) {
      throw new WordError("invalid_document", `The ${reference.kind} part has an invalid root element.`);
    }
    let storyRelationships: Relationships | undefined;
    try { storyRelationships = pkg.relationships(part.name); }
    catch (cause) { if (!(cause instanceof RelationshipsError) || cause.code !== "missing_item") throw cause; }
    const blocks = source.root.children.filter((node): node is LosslessXmlElement => node.kind === "element")
      .map((element) => parseBlock(element, source, namespace, storyRelationships, budget));
    const drawings = readWordDrawings({ package: pkg, part, source, conformance });
    stories.push(Object.freeze({ ...reference, part, source, blocks: Object.freeze(blocks), drawings }));
  }
  return Object.freeze(stories);
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
  const properties = onlyChild(element, namespace, "tblPr", "A table must not repeat tblPr.");
  const grid = onlyChild(element, namespace, "tblGrid", "A table must not repeat tblGrid.");
  const margins = properties === undefined ? undefined : onlyChild(properties, namespace, "tblCellMar", "Table properties must not repeat tblCellMar.");
  const tableProperties: WordTableProperties = Object.freeze({
    width: properties === undefined ? undefined : parseTableWidth(onlyChild(properties, namespace, "tblW", "Table properties must not repeat tblW."), namespace),
    alignment: properties === undefined ? "start" : tableAlignment(valueChild(properties, namespace, "jc")),
    indentTwips: properties === undefined ? 0 : tableIndent(onlyChild(properties, namespace, "tblInd", "Table properties must not repeat tblInd."), namespace),
    layout: properties === undefined || valueChild(properties, namespace, "tblLayout") !== "fixed" ? "autofit" : "fixed",
    cellMargins: parseCellMargins(margins, namespace, { topTwips: 0, endTwips: 108, bottomTwips: 0, startTwips: 108 }),
  });
  const rows = children(element, namespace, "tr").map((row): WordTableRow => Object.freeze({
    elementId: row.id,
    ...parseRowProperties(onlyChild(row, namespace, "trPr", "A table row must not repeat trPr."), namespace),
    cells: Object.freeze(children(row, namespace, "tc").map((cell): WordTableCell => {
      const cellProperties = onlyChild(cell, namespace, "tcPr", "A table cell must not repeat tcPr.");
      const rawMerge = cellProperties === undefined ? undefined : onlyChild(cellProperties, namespace, "vMerge", "Cell properties must not repeat vMerge.");
      const mergeValue = rawMerge === undefined ? undefined : attr(rawMerge, namespace, "val");
      return Object.freeze({
      elementId: cell.id,
      gridSpan: cellProperties === undefined ? 1 : integerAttr(onlyChild(cellProperties, namespace, "gridSpan", "Cell properties must not repeat gridSpan."), namespace, "val", 1, 1, 32_767),
      verticalMerge: rawMerge === undefined ? undefined : mergeValue === "restart" ? "restart" : "continue",
      width: cellProperties === undefined ? undefined : parseTableWidth(onlyChild(cellProperties, namespace, "tcW", "Cell properties must not repeat tcW."), namespace),
      verticalAlignment: cellVerticalAlignment(cellProperties === undefined ? undefined : valueChild(cellProperties, namespace, "vAlign")),
      margins: cellProperties === undefined ? undefined : parseOptionalCellMargins(onlyChild(cellProperties, namespace, "tcMar", "Cell properties must not repeat tcMar."), namespace),
      blocks: Object.freeze(cell.children
        .filter((node): node is LosslessXmlElement => node.kind === "element")
        .filter((child) => child.namespaceUri === namespace && (child.localName === "p" || child.localName === "tbl"))
        .map((child) => parseBlock(child, source, namespace, relationships, budget))),
    }); })),
  }));
  const gridColumnWidthsTwips = grid === undefined ? [] : children(grid, namespace, "gridCol").map((column) => twipsAttr(column, namespace, "w", 0));
  return Object.freeze({ kind: "table", elementId: element.id, gridColumnWidthsTwips: Object.freeze(gridColumnWidthsTwips), properties: tableProperties, rows: Object.freeze(rows) });
}

function parseRowProperties(element: LosslessXmlElement | undefined, namespace: string): Pick<WordTableRow, "gridBefore" | "gridAfter" | "cantSplit" | "repeatHeader" | "heightTwips" | "heightRule"> {
  const height = element === undefined ? undefined : onlyChild(element, namespace, "trHeight", "Row properties must not repeat trHeight.");
  const rawHeight = height === undefined ? undefined : attr(height, namespace, "val");
  const rule = height === undefined ? undefined : attr(height, namespace, "hRule");
  return {
    gridBefore: element === undefined ? 0 : valueIntegerChild(element, namespace, "gridBefore", 0, 32_767),
    gridAfter: element === undefined ? 0 : valueIntegerChild(element, namespace, "gridAfter", 0, 32_767),
    cantSplit: element !== undefined && children(element, namespace, "cantSplit").length > 0,
    repeatHeader: element !== undefined && children(element, namespace, "tblHeader").length > 0,
    heightTwips: rawHeight === undefined ? undefined : unsignedInteger(rawHeight, "row height", 0, 2_147_483_647),
    heightRule: rule === "exact" || rule === "atLeast" ? rule : "auto",
  };
}

function valueIntegerChild(element: LosslessXmlElement, namespace: string, name: string, minimum: number, maximum: number): number {
  const child = onlyChild(element, namespace, name, `${element.localName} must not repeat ${name}.`);
  const raw = child === undefined ? undefined : attr(child, namespace, "val");
  return raw === undefined ? minimum : unsignedInteger(raw, name, minimum, maximum);
}

function parseTableWidth(element: LosslessXmlElement | undefined, namespace: string): WordTableWidth | undefined {
  if (element === undefined) return undefined;
  const rawType = attr(element, namespace, "type") ?? "dxa";
  const type = rawType === "auto" || rawType === "pct" || rawType === "nil" ? rawType : "dxa";
  const rawValue = attr(element, namespace, "w") ?? "0";
  return Object.freeze({ type, value: unsignedInteger(rawValue, "table width", 0, 2_147_483_647) });
}

function tableIndent(element: LosslessXmlElement | undefined, namespace: string): number {
  if (element === undefined || attr(element, namespace, "type") !== "dxa") return 0;
  const raw = attr(element, namespace, "w");
  return raw === undefined ? 0 : unsignedInteger(raw, "table indentation", 0, 2_147_483_647);
}

function parseOptionalCellMargins(element: LosslessXmlElement | undefined, namespace: string): WordTableCellMargins | undefined {
  return element === undefined ? undefined : parseCellMargins(element, namespace, { topTwips: 0, endTwips: 0, bottomTwips: 0, startTwips: 0 });
}

function parseCellMargins(element: LosslessXmlElement | undefined, namespace: string, fallback: WordTableCellMargins): WordTableCellMargins {
  if (element === undefined) return Object.freeze(fallback);
  const measurement = (modern: string, legacy: string, defaultValue: number): number => {
    const child = onlyChild(element, namespace, modern, `Cell margins must not repeat ${modern}.`) ?? onlyChild(element, namespace, legacy, `Cell margins must not repeat ${legacy}.`);
    const raw = child === undefined ? undefined : attr(child, namespace, "w");
    return raw === undefined || attr(child!, namespace, "type") !== "dxa" ? defaultValue : unsignedInteger(raw, `${modern} cell margin`, 0, 2_147_483_647);
  };
  return Object.freeze({
    topTwips: measurement("top", "top", fallback.topTwips),
    endTwips: measurement("end", "right", fallback.endTwips),
    bottomTwips: measurement("bottom", "bottom", fallback.bottomTwips),
    startTwips: measurement("start", "left", fallback.startTwips),
  });
}

function tableAlignment(value: string | undefined): "start" | "center" | "end" { return value === "center" ? "center" : value === "right" || value === "end" ? "end" : "start"; }
function cellVerticalAlignment(value: string | undefined): "top" | "center" | "bottom" { return value === "center" || value === "bottom" ? value : "top"; }
function unsignedInteger(raw: string, label: string, minimum: number, maximum: number): number { if (!/^[0-9]+$/.test(raw)) throw new WordError("invalid_document", `${label} must be an unsigned integer.`); const value = Number(raw); if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new WordError("invalid_document", `${label} must be between ${minimum} and ${maximum}.`); return value; }

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
  if (element.localName === "footnoteReference" || element.localName === "endnoteReference") {
    const rawId = attr(element, namespace, "id");
    if (rawId === undefined || !/^-?[0-9]+$/.test(rawId)) throw new WordError("invalid_document", `${element.localName} requires a signed integer id.`);
    const id = Number(rawId);
    if (!Number.isSafeInteger(id)) throw new WordError("invalid_document", `${element.localName} id is outside the supported range.`);
    return Object.freeze({ kind: element.localName === "footnoteReference" ? "footnote-reference" : "endnote-reference", elementId: element.id, id });
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
  const rawBreakType = element === undefined ? undefined : valueChild(element, namespace, "type");
  const references = element === undefined ? [] : element.children.filter((child): child is LosslessXmlElement => child.kind === "element" && child.namespaceUri === namespace && (child.localName === "headerReference" || child.localName === "footerReference"));
  const headerReferences: WordHeaderFooterReference[] = [];
  const footerReferences: WordHeaderFooterReference[] = [];
  for (const reference of references) {
    const relationshipId = qualifiedAttr(reference, relationshipsNamespace(namespace), "id");
    if (relationshipId === undefined) throw new WordError("invalid_document", `${reference.localName} is missing its relationship id.`);
    const rawType = attr(reference, namespace, "type");
    const type = rawType === "first" || rawType === "even" ? rawType : "default";
    const value: WordHeaderFooterReference = Object.freeze({ kind: reference.localName === "headerReference" ? "header" : "footer", type, relationshipId });
    (value.kind === "header" ? headerReferences : footerReferences).push(value);
  }
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
    breakType: rawBreakType === "continuous" || rawBreakType === "nextColumn" || rawBreakType === "evenPage" || rawBreakType === "oddPage"
      ? rawBreakType
      : "nextPage",
    titlePage: element !== undefined && children(element, namespace, "titlePg").length > 0,
    headerReferences: Object.freeze(headerReferences),
    footerReferences: Object.freeze(footerReferences),
  });
}

function valueChild(element: LosslessXmlElement, namespace: string, localName: string): string | undefined {
  const matches = children(element, namespace, localName);
  if (matches.length > 1) throw new WordError("invalid_document", `${element.localName} must not repeat ${localName}.`);
  return matches[0] === undefined ? undefined : attr(matches[0], namespace, "val");
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
