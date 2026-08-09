import { OOXML_NAMESPACES, parseLosslessXml, type LosslessXmlElement } from "@tumblerjs/ooxml";
import { RelationshipsError, type OpcPackage, type OpcPart, type PartName } from "@tumblerjs/opc";
import { WordError, type WordBlock, type WordConformance, type WordParagraph } from "./document.ts";

const NUMBERING_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml";
const MAX_NUMBERING_DEFINITIONS = 100_000;
const MAX_LEVEL = 8;

export type WordNumberFormat = "decimal" | "lowerLetter" | "upperLetter" | "lowerRoman" | "upperRoman" | "bullet" | "none";

export interface WordNumberingLevel {
  readonly level: number;
  readonly start: number;
  readonly format: WordNumberFormat;
  readonly text: string;
  readonly suffix: "tab" | "space" | "nothing";
  readonly indentStartTwips: number | undefined;
  readonly hangingTwips: number | undefined;
}

export interface WordAbstractNumbering {
  readonly id: number;
  readonly levels: readonly WordNumberingLevel[];
}

export interface WordNumberingInstance {
  readonly id: number;
  readonly abstractId: number;
  readonly startOverrides: ReadonlyMap<number, number>;
  readonly levelOverrides: ReadonlyMap<number, WordNumberingLevel>;
}

export interface WordParagraphNumbering {
  readonly numId: number;
  readonly level: number;
}

export interface WordListMarker {
  readonly text: string;
  readonly suffix: "tab" | "space" | "nothing";
  readonly level: number;
  readonly indentStartTwips: number | undefined;
  readonly hangingTwips: number | undefined;
}

interface WordDocumentLike {
  readonly package: OpcPackage;
  readonly part: OpcPart;
  readonly conformance: WordConformance;
  readonly source: { readonly element: (id: number) => LosslessXmlElement | undefined };
}

export class WordNumbering {
  readonly partName: PartName | undefined;
  readonly abstracts: readonly WordAbstractNumbering[];
  readonly instances: readonly WordNumberingInstance[];
  readonly #abstracts: ReadonlyMap<number, WordAbstractNumbering>;
  readonly #instances: ReadonlyMap<number, WordNumberingInstance>;

  constructor(input: { partName?: PartName; abstracts?: readonly WordAbstractNumbering[]; instances?: readonly WordNumberingInstance[] } = {}) {
    this.partName = input.partName;
    this.abstracts = Object.freeze([...(input.abstracts ?? [])]);
    this.instances = Object.freeze([...(input.instances ?? [])]);
    this.#abstracts = new Map(this.abstracts.map((item) => [item.id, item]));
    this.#instances = new Map(this.instances.map((item) => [item.id, item]));
  }

  paragraphReference(document: WordDocumentLike, paragraph: WordParagraph): WordParagraphNumbering | undefined {
    if (paragraph.propertiesElementId === undefined) return undefined;
    const properties = document.source.element(paragraph.propertiesElementId);
    if (properties === undefined) return undefined;
    const ns = namespace(document.conformance);
    const numPr = one(properties, ns, "numPr", "Paragraph properties must not repeat numPr.");
    if (numPr === undefined) return undefined;
    const rawId = valueChild(numPr, ns, "numId");
    if (rawId === undefined) return undefined;
    const numId = integer(rawId, "numbering instance", 0, 2_147_483_647);
    if (numId === 0) return undefined;
    const level = integer(valueChild(numPr, ns, "ilvl") ?? "0", "numbering level", 0, MAX_LEVEL);
    return Object.freeze({ numId, level });
  }

  markers(document: WordDocumentLike & { readonly blocks: readonly WordBlock[] }): ReadonlyMap<number, WordListMarker> {
    const markers = new Map<number, WordListMarker>();
    const counters = new Map<number, number[]>();
    const visit = (blocks: readonly WordBlock[]): void => {
      for (const block of blocks) {
        if (block.kind === "paragraph") {
          const reference = this.paragraphReference(document, block);
          if (reference === undefined) continue;
          const instance = this.#instances.get(reference.numId);
          const abstract = instance === undefined ? undefined : this.#abstracts.get(instance.abstractId);
          const level = instance?.levelOverrides.get(reference.level) ?? abstract?.levels.find((item) => item.level === reference.level);
          if (instance === undefined || abstract === undefined || level === undefined) continue;
          const state = counters.get(reference.numId) ?? [];
          for (let index = reference.level + 1; index < state.length; index += 1) state[index] = Number.NaN;
          for (let index = 0; index <= reference.level; index += 1) {
            const definition = instance.levelOverrides.get(index) ?? abstract.levels.find((item) => item.level === index);
            if (definition === undefined) continue;
            const start = instance.startOverrides.get(index) ?? definition.start;
            if (!Number.isFinite(state[index])) state[index] = start;
            else if (index === reference.level) state[index] = state[index]! + 1;
          }
          counters.set(reference.numId, state);
          const text = level.format === "bullet" ? level.text : level.text.replace(/%([1-9])/g, (_match, digit: string) => {
            const index = Number(digit) - 1;
            const definition = instance.levelOverrides.get(index) ?? abstract.levels.find((item) => item.level === index);
            return formatNumber(state[index] ?? definition?.start ?? 1, definition?.format ?? "decimal");
          });
          markers.set(block.elementId, Object.freeze({ text, suffix: level.suffix, level: reference.level, indentStartTwips: level.indentStartTwips, hangingTwips: level.hangingTwips }));
        } else if (block.kind === "table") for (const row of block.rows) for (const cell of row.cells) visit(cell.blocks);
      }
    };
    visit(document.blocks);
    return markers;
  }
}

export function readWordNumbering(document: WordDocumentLike): WordNumbering {
  const relationshipType = `${document.conformance === "strict" ? "http://purl.oclc.org/ooxml/officeDocument/relationships" : "http://schemas.openxmlformats.org/officeDocument/2006/relationships"}/numbering`;
  let relationships;
  try {
    relationships = document.package.relationships(document.part.name);
  } catch (cause) {
    if (cause instanceof RelationshipsError && cause.code === "missing_item") return new WordNumbering();
    throw new WordError("invalid_document", "The Main Document relationships are invalid.", { cause });
  }
  const matches = relationships.byType(relationshipType);
  if (matches.length > 1) throw new WordError("invalid_document", "The Main Document must not have multiple numbering relationships.");
  const relationship = matches[0];
  if (relationship === undefined) return new WordNumbering();
  if (relationship.targetMode !== "Internal") throw new WordError("invalid_document", "The Numbering relationship must target a package part.");
  const part = document.package.getPart(relationship.targetPartName);
  if (part === undefined || part.contentType !== NUMBERING_CONTENT_TYPE) throw new WordError("invalid_document", "The Numbering relationship target has the wrong content type.");
  let root: LosslessXmlElement;
  try { root = parseLosslessXml(document.package.readPart(part)).root; }
  catch (cause) { throw new WordError("invalid_document", "The Numbering part is not valid XML.", { cause }); }
  const ns = namespace(document.conformance);
  if (root.namespaceUri !== ns || root.localName !== "numbering") throw new WordError("invalid_document", "The Numbering part must have a WordprocessingML numbering root.");
  const abstractElements = children(root, ns, "abstractNum");
  const instanceElements = children(root, ns, "num");
  if (abstractElements.length + instanceElements.length > MAX_NUMBERING_DEFINITIONS) throw new WordError("limit_exceeded", `Numbering definitions exceed ${MAX_NUMBERING_DEFINITIONS} entries.`);
  const abstractIds = new Set<number>();
  const abstracts = abstractElements.map((element): WordAbstractNumbering => {
    const id = integer(requiredAttr(element, ns, "abstractNumId"), "abstract numbering id", 0, 2_147_483_647);
    if (abstractIds.has(id)) throw new WordError("invalid_document", `Abstract numbering id ${id} is duplicated.`);
    abstractIds.add(id);
    const levels = children(element, ns, "lvl").map((level) => parseLevel(level, ns));
    const levelIds = new Set(levels.map((level) => level.level));
    if (levelIds.size !== levels.length) throw new WordError("invalid_document", `Abstract numbering ${id} repeats a level.`);
    return Object.freeze({ id, levels: Object.freeze(levels) });
  });
  const instanceIds = new Set<number>();
  const instances = instanceElements.map((element): WordNumberingInstance => {
    const id = integer(requiredAttr(element, ns, "numId"), "numbering instance id", 1, 2_147_483_647);
    if (instanceIds.has(id)) throw new WordError("invalid_document", `Numbering instance id ${id} is duplicated.`);
    instanceIds.add(id);
    const abstractId = integer(requiredValueChild(element, ns, "abstractNumId"), "abstract numbering id", 0, 2_147_483_647);
    const startOverrides = new Map<number, number>();
    const levelOverrides = new Map<number, WordNumberingLevel>();
    for (const override of children(element, ns, "lvlOverride")) {
      const level = integer(requiredAttr(override, ns, "ilvl"), "numbering override level", 0, MAX_LEVEL);
      const start = valueChild(override, ns, "startOverride");
      if (start !== undefined) startOverrides.set(level, integer(start, "numbering start override", 0, 2_147_483_647));
      const definition = one(override, ns, "lvl", "A numbering level override must not repeat lvl.");
      if (definition !== undefined) levelOverrides.set(level, parseLevel(definition, ns, level));
    }
    return Object.freeze({ id, abstractId, startOverrides, levelOverrides });
  });
  return new WordNumbering({ partName: part.name, abstracts, instances });
}

function parseLevel(element: LosslessXmlElement, ns: string, forcedLevel?: number): WordNumberingLevel {
  const level = forcedLevel ?? integer(requiredAttr(element, ns, "ilvl"), "numbering level", 0, MAX_LEVEL);
  const rawFormat = valueChild(element, ns, "numFmt") ?? "decimal";
  const format: WordNumberFormat = rawFormat === "decimal" || rawFormat === "lowerLetter" || rawFormat === "upperLetter" || rawFormat === "lowerRoman" || rawFormat === "upperRoman" || rawFormat === "bullet" || rawFormat === "none" ? rawFormat : "decimal";
  const suffixValue = valueChild(element, ns, "suff");
  const pPr = one(element, ns, "pPr", "A numbering level must not repeat pPr.");
  const ind = pPr === undefined ? undefined : one(pPr, ns, "ind", "Numbering paragraph properties must not repeat ind.");
  return Object.freeze({
    level,
    start: integer(valueChild(element, ns, "start") ?? "1", "numbering start", 0, 2_147_483_647),
    format,
    text: valueChild(element, ns, "lvlText") ?? (format === "bullet" ? "•" : `%${level + 1}.`),
    suffix: suffixValue === "space" || suffixValue === "nothing" ? suffixValue : "tab",
    indentStartTwips: ind === undefined ? undefined : optionalSignedAttr(ind, ns, "start") ?? optionalSignedAttr(ind, ns, "left"),
    hangingTwips: ind === undefined ? undefined : optionalSignedAttr(ind, ns, "hanging"),
  });
}

function formatNumber(value: number, format: WordNumberFormat): string {
  if (format === "none") return "";
  if (format === "lowerLetter" || format === "upperLetter") {
    let current = Math.max(1, value); let result = "";
    while (current > 0) { current -= 1; result = String.fromCharCode(65 + current % 26) + result; current = Math.floor(current / 26); }
    return format === "lowerLetter" ? result.toLowerCase() : result;
  }
  if (format === "lowerRoman" || format === "upperRoman") {
    const pairs: readonly [number, string][] = [[1000,"M"],[900,"CM"],[500,"D"],[400,"CD"],[100,"C"],[90,"XC"],[50,"L"],[40,"XL"],[10,"X"],[9,"IX"],[5,"V"],[4,"IV"],[1,"I"]];
    let current = Math.max(1, value); let result = "";
    for (const [amount, symbol] of pairs) while (current >= amount) { result += symbol; current -= amount; }
    return format === "lowerRoman" ? result.toLowerCase() : result;
  }
  return String(value);
}

function namespace(conformance: WordConformance): string { return OOXML_NAMESPACES[conformance].wordprocessing; }
function children(element: LosslessXmlElement, ns: string, name: string): LosslessXmlElement[] { return element.children.filter((child): child is LosslessXmlElement => child.kind === "element" && child.namespaceUri === ns && child.localName === name); }
function one(element: LosslessXmlElement, ns: string, name: string, message: string): LosslessXmlElement | undefined { const result = children(element, ns, name); if (result.length > 1) throw new WordError("invalid_document", message); return result[0]; }
function attr(element: LosslessXmlElement, ns: string, name: string): string | undefined { return element.attributes.find((item) => item.namespaceUri === ns && item.localName === name)?.value; }
function requiredAttr(element: LosslessXmlElement, ns: string, name: string): string { const value = attr(element, ns, name); if (value === undefined) throw new WordError("invalid_document", `${element.localName} is missing ${name}.`); return value; }
function valueChild(element: LosslessXmlElement, ns: string, name: string): string | undefined { const child = one(element, ns, name, `${element.localName} must not repeat ${name}.`); return child === undefined ? undefined : attr(child, ns, "val"); }
function requiredValueChild(element: LosslessXmlElement, ns: string, name: string): string { const value = valueChild(element, ns, name); if (value === undefined) throw new WordError("invalid_document", `${element.localName} is missing ${name}.`); return value; }
function integer(raw: string, label: string, minimum: number, maximum: number): number { if (!/^[0-9]+$/.test(raw)) throw new WordError("invalid_document", `${label} must be an unsigned integer.`); const value = Number(raw); if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new WordError("invalid_document", `${label} must be between ${minimum} and ${maximum}.`); return value; }
function optionalSignedAttr(element: LosslessXmlElement, ns: string, name: string): number | undefined { const raw = attr(element, ns, name); if (raw === undefined) return undefined; if (!/^-?[0-9]+$/.test(raw)) throw new WordError("invalid_document", `${name} must be a signed twip measurement.`); const value = Number(raw); if (!Number.isSafeInteger(value)) throw new WordError("invalid_document", `${name} is outside the supported measurement range.`); return value; }
