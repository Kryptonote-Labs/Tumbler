import { readNumberingStyles, WordNumberingStyles } from './numbering-styles.ts';
import type { WordAuthoredList } from './authored-list.ts';
import { OOXML_NAMESPACES, parseLosslessXml, type LosslessXmlElement } from "@tumblerjs/ooxml";
import { RelationshipsError, type OpcPackage, type OpcPart, type PartName } from "@tumblerjs/opc";
import { WordError, type WordBlock, type WordConformance, type WordParagraph } from "./document.ts";

const NUMBERING_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml";
const MAX_NUMBERING_DEFINITIONS = 100_000;
const MAX_LEVEL = 8;
const DEFAULT_MAX_MARKER_CHARACTERS = 1_000_000;

export interface WordMarkerOptions {
  /** Total derived UTF-16 units, including suffixes, per resolution call. */
  readonly maxCharacters?: number;
}

export class WordMarkerBudget {
  remaining: number;
  constructor(maximum = DEFAULT_MAX_MARKER_CHARACTERS) {
    if (!Number.isSafeInteger(maximum) || maximum < 0) throw new RangeError('Marker character budget must be a non-negative safe integer.');
    this.remaining = maximum;
  }
  consume(length: number): void {
    if (length > this.remaining) throw new WordError('limit_exceeded', 'Derived numbering text exceeds the marker character budget.');
    this.remaining -= length;
  }
}

export type WordNumberFormat = "decimal" | "lowerLetter" | "upperLetter" | "lowerRoman" | "upperRoman" | "bullet" | "none";

export interface WordNumberingLevel {
  readonly level: number;
  readonly start: number;
  /** One-based restart trigger; zero disables automatic restarts. */
  readonly restart?: number;
  readonly paragraphStyleId?: string;
  readonly format: WordNumberFormat;
  readonly text: string;
  readonly suffix: "tab" | "space" | "nothing";
  readonly indentStartTwips: number | undefined;
  readonly hangingTwips: number | undefined;
}

export interface WordAbstractNumbering {
  readonly id: number;
  readonly levels: readonly WordNumberingLevel[];
  readonly numberingStyleId?: string;
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

  readonly #styles: WordNumberingStyles;
  readonly #resolved = new Map<number, readonly WordNumberingLevel[]>();

  snapshot() {
    return { styles: this.#styles, partName: this.partName, abstracts: this.abstracts, instances: this.instances };
  }

  constructor(input: { styles?: WordNumberingStyles; partName?: PartName; abstracts?: readonly WordAbstractNumbering[]; instances?: readonly WordNumberingInstance[] } = {}) {
    this.#styles = input.styles ?? new WordNumberingStyles();
    this.partName = input.partName;
    this.abstracts = Object.freeze([...(input.abstracts ?? [])]);
    this.instances = Object.freeze([...(input.instances ?? [])]);
    this.#abstracts = new Map(this.abstracts.map((item) => [item.id, item]));
    this.#instances = new Map(this.instances.map((item) => [item.id, item]));
  }

  /** Native updates see the same added built-ins as package export, without changing imported metadata. */
  withParagraphStyles(styles: Parameters<WordNumberingStyles['withParagraphStyles']>[0]): WordNumbering {
    if (!styles.length) return this;
    return new WordNumbering({
      ...(this.partName === undefined ? {} : { partName: this.partName }),
      abstracts: this.abstracts, instances: this.instances,
      styles: this.#styles.withParagraphStyles(styles),
    });
  }

  /** Imported identities continue their original instance, including level overrides. */
  importedReference(list: WordAuthoredList): WordParagraphNumbering | undefined {
    const { id, level = 0 } = list;
    const match = /^source-list-([1-9][0-9]*)$/.exec(id);
    if (!match || !Number.isInteger(level) || level < 0 || level > MAX_LEVEL) return undefined;
    const numId = Number(match[1]);
    const instance = this.#instances.get(numId);
    if (!instance) return undefined;
    const definition = this.level({ numId, level });
    if (!definition) throw new TypeError('An imported list identity cannot reference an undefined source level. Use a new identity for an independently defined list.');
    if (list.kind !== definition.format || (list.start ?? 1) !== definition.start ||
        (list.kind === 'bullet' && (list.marker ?? '•') !== definition.text) ||
        (list.multilevel !== undefined && definition.text !== (list.multilevel ? Array.from({ length: level + 1 }, (_, index) => `%${index + 1}`).join('.') + '.' : `%${level + 1}.`)))
      throw new TypeError('An imported list identity must retain its source definition. Use a new identity for an independently defined list.');
    return { numId, level };
  }

  /** Resolve style indirection once per instance, then apply overrides from inner to outer. */
  #levels(numId: number): readonly WordNumberingLevel[] {
    const cached = this.#resolved.get(numId);
    if (cached) return cached;
    const path: WordNumberingInstance[] = [];
    const seen = new Set<number>();
    let current: number | undefined = numId;
    let levels: readonly WordNumberingLevel[] = [];
    while (current !== undefined) {
      if (seen.has(current)) throw new WordError('invalid_document', 'Numbering style link has a cycle.');
      if (path.length >= 100) throw new WordError('limit_exceeded', 'Numbering style link chain exceeds 100 entries.');
      const resolved = this.#resolved.get(current);
      if (resolved) {
        const starts = this.#instances.get(current)?.startOverrides;
        levels = resolved.map(level => starts?.has(level.level) ? { ...level, start: starts.get(level.level)! } : level);
        break;
      }
      seen.add(current);
      const instance = this.#instances.get(current);
      const abstract = instance && this.#abstracts.get(instance.abstractId);
      if (!instance || !abstract) break;
      path.push(instance);
      if (abstract.numberingStyleId === undefined) { levels = abstract.levels; break; }
      current = this.#styles.resolve(abstract.numberingStyleId, 'numbering').numId;
    }
    for (const instance of path.reverse()) {
      const merged = new Map(levels.map(level => [level.level, level]));
      for (const [index, definition] of instance.levelOverrides) merged.set(index, definition);
      const definitions = Object.freeze([...merged.values()]);
      this.#resolved.set(instance.id, definitions);
      // Inner start overrides become inherited starts, while the outer instance
      // retains its own override separately from its source definition.
      levels = definitions.map(level => instance.startOverrides.has(level.level)
        ? { ...level, start: instance.startOverrides.get(level.level)! } : level);
    }
    return this.#resolved.get(numId) ?? [];
  }

  /** Effective level shared by package markers, native import, and export validation. */
  level(reference: WordParagraphNumbering): WordNumberingLevel | undefined {
    return this.#levels(reference.numId).find(item => item.level === reference.level);
  }

  /** Compile direct properties once for native edits; omitted fields still inherit. */
  paragraphProperties(document: WordDocumentLike, paragraph: WordParagraph): Partial<WordParagraphNumbering> {
    const properties = paragraph.propertiesElementId === undefined ? undefined : document.source.element(paragraph.propertiesElementId);
    const ns = namespace(document.conformance);
    const numPr = properties && one(properties, ns, "numPr", "Paragraph properties must not repeat numPr.");
    const rawId = numPr && valueChild(numPr, ns, "numId");
    const rawLevel = numPr && valueChild(numPr, ns, 'ilvl');
    return {
      ...(rawId === undefined ? {} : { numId: integer(rawId, 'numbering instance', 0, 2_147_483_647) }),
      ...(rawLevel === undefined ? {} : { level: integer(rawLevel, 'numbering level', 0, MAX_LEVEL) }),
    };
  }

  /** Resolve the same direct properties and current style for XML and native paragraphs. */
  reference(properties: Partial<WordParagraphNumbering>, styleId?: string): WordParagraphNumbering | undefined {
    const { numId: directId, level: directLevel } = properties;
    if (directId === 0) return undefined;
    if (directId !== undefined && directLevel !== undefined) return Object.freeze({ numId: directId, level: directLevel });
    const style = this.#styles.resolve(styleId, 'paragraph');
    const numId = directId ?? style.numId;
    if (numId === undefined || numId === 0) return undefined;
    const levels = this.#levels(numId);
    const linkedLevel = style.ids.map(id => levels.find(level => level.paragraphStyleId === id)).find(level => level !== undefined);
    return Object.freeze({ numId, level: directLevel ?? linkedLevel?.level ?? 0 });
  }

  paragraphReference(document: WordDocumentLike, paragraph: WordParagraph): WordParagraphNumbering | undefined {
    const properties = paragraph.propertiesElementId === undefined ? undefined : document.source.element(paragraph.propertiesElementId);
    const styleId = properties && valueChild(properties, namespace(document.conformance), 'pStyle');
    return this.reference(this.paragraphProperties(document, paragraph), styleId);
  }

  markers(document: WordDocumentLike & { readonly blocks: readonly WordBlock[] }, options: WordMarkerOptions = {}, budget = new WordMarkerBudget(options.maxCharacters)): ReadonlyMap<number, WordListMarker> {
    const paragraphs: { elementId: number; reference: WordParagraphNumbering }[] = [];
    const visit = (blocks: readonly WordBlock[]): void => {
      for (const block of blocks) {
        if (block.kind === "paragraph") {
          const reference = this.paragraphReference(document, block);
          if (reference) paragraphs.push({ elementId: block.elementId, reference });
        } else if (block.kind === "table") for (const row of block.rows) for (const cell of row.cells) visit(cell.blocks);
      }
    };
    visit(document.blocks);
    return this.markersFor(paragraphs, options, budget);
  }

  /** Number a semantic sequence without consulting XML or opening a package. */
  markersFor(paragraphs: Iterable<{ elementId: number; reference: WordParagraphNumbering }>, options: WordMarkerOptions = {}, budget = new WordMarkerBudget(options.maxCharacters)): ReadonlyMap<number, WordListMarker> {
    const markers = new Map<number, WordListMarker>();
    const counters = new Map<number, number[]>();
    for (const { elementId, reference } of paragraphs) {
          const instance = this.#instances.get(reference.numId);
          const levels = this.#levels(reference.numId);
          const level = levels.find(item => item.level === reference.level);
          if (instance === undefined || level === undefined) continue;
          const state = counters.get(reference.numId) ?? [];
          for (let index = reference.level + 1; index < state.length; index += 1) {
            const definition = levels.find(item => item.level === index);
            const restart = definition?.restart ?? index;
            if (restart !== 0 && reference.level < restart) state[index] = Number.NaN;
          }
          for (let index = 0; index <= reference.level; index += 1) {
            const definition = levels.find((item) => item.level === index);
            if (definition === undefined) continue;
            const start = instance.startOverrides.get(index) ?? definition.start;
            if (!Number.isFinite(state[index])) state[index] = start;
            else if (index === reference.level) state[index] = state[index]! + 1;
          }
          counters.set(reference.numId, state);
          budget.consume(level.suffix === 'nothing' ? 0 : 1);
          const text = wordMarkerText(level.text, level.format === "bullet", budget, (index, maximum) => {
            const definition = levels.find((item) => item.level === index);
            return formatWordNumber(state[index] ?? definition?.start ?? 1, definition?.format ?? "decimal", maximum);
          });
          markers.set(elementId, Object.freeze({ text, suffix: level.suffix, level: reference.level, indentStartTwips: level.indentStartTwips, hangingTwips: level.hangingTwips }));
    }
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
    const numberingStyleId = valueChild(element, ns, 'numStyleLink');
    return Object.freeze({ id, levels: Object.freeze(levels), ...(numberingStyleId === undefined ? {} : { numberingStyleId }) });
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
  return new WordNumbering({ partName: part.name, abstracts, instances, styles: readNumberingStyles(document.package, document.part, relationshipType.replace(/numbering$/, 'styles'), ns) });
}

function parseLevel(element: LosslessXmlElement, ns: string, forcedLevel?: number): WordNumberingLevel {
  const level = forcedLevel ?? integer(requiredAttr(element, ns, "ilvl"), "numbering level", 0, MAX_LEVEL);
  const rawFormat = valueChild(element, ns, "numFmt") ?? "decimal";
  const format: WordNumberFormat = rawFormat === "decimal" || rawFormat === "lowerLetter" || rawFormat === "upperLetter" || rawFormat === "lowerRoman" || rawFormat === "upperRoman" || rawFormat === "bullet" || rawFormat === "none" ? rawFormat : "decimal";
  const suffixValue = valueChild(element, ns, "suff");
  const pPr = one(element, ns, "pPr", "A numbering level must not repeat pPr.");
  const ind = pPr === undefined ? undefined : one(pPr, ns, "ind", "Numbering paragraph properties must not repeat ind.");
  const rawRestart = valueChild(element, ns, 'lvlRestart');
  const restart = rawRestart === undefined ? level : integer(rawRestart, 'numbering restart', 0, 2_147_483_647);
  const paragraphStyleId = valueChild(element, ns, 'pStyle');
  return Object.freeze({
    level,
    restart: restart > level ? level : restart,
    ...(paragraphStyleId === undefined ? {} : { paragraphStyleId }),
    start: integer(valueChild(element, ns, "start") ?? "0", "numbering start", 0, 2_147_483_647),
    format,
    text: valueChild(element, ns, "lvlText") ?? (format === "bullet" ? "•" : `%${level + 1}.`),
    suffix: suffixValue === "space" || suffixValue === "nothing" ? suffixValue : "tab",
    indentStartTwips: ind === undefined ? undefined : optionalSignedAttr(ind, ns, "start") ?? optionalSignedAttr(ind, ns, "left"),
    hangingTwips: ind === undefined ? undefined : optionalSignedAttr(ind, ns, "hanging"),
  });
}

/** Budget derived text before expansion, including repeated placeholders and literals. */
export function wordMarkerText(pattern: string, literal: boolean, budget: WordMarkerBudget, number: (index: number, maximum: number) => string): string {
  if (literal) {
    budget.consume(pattern.length);
    return pattern;
  }
  const parts: string[] = [];
  let offset = 0;
  for (const match of pattern.matchAll(/%([1-9])/g)) {
    budget.consume(match.index - offset);
    parts.push(pattern.slice(offset, match.index));
    const value = number(Number(match[1]) - 1, budget.remaining);
    budget.consume(value.length);
    parts.push(value);
    offset = match.index + match[0].length;
  }
  budget.consume(pattern.length - offset);
  parts.push(pattern.slice(offset));
  return parts.join('');
}

/** Preserve numeral semantics; reject work exceeding the caller's derived-text budget. */
export function formatWordNumber(value: number, format: WordNumberFormat, maxCharacters = DEFAULT_MAX_MARKER_CHARACTERS): string {
  const budget = new WordMarkerBudget(maxCharacters);
  if (format === "none") return "";
  if (!Number.isSafeInteger(value)) throw new WordError('invalid_document', 'Numbering value must be a safe integer.');
  if (format === "lowerLetter" || format === "upperLetter") {
    let current = Math.max(1, value); let result = "";
    while (current > 0) { budget.consume(1); current -= 1; result = String.fromCharCode(65 + current % 26) + result; current = Math.floor(current / 26); }
    return format === "lowerLetter" ? result.toLowerCase() : result;
  }
  if (format === "lowerRoman" || format === "upperRoman") {
    const pairs: readonly [number, string][] = [[1000,"M"],[900,"CM"],[500,"D"],[400,"CD"],[100,"C"],[90,"XC"],[50,"L"],[40,"XL"],[10,"X"],[9,"IX"],[5,"V"],[4,"IV"],[1,"I"]];
    let current = Math.max(1, value);
    const counts = pairs.map(([amount, symbol]) => {
      const count = Math.floor(current / amount);
      budget.consume(count * symbol.length);
      current -= count * amount;
      return count;
    });
    const result = pairs.map(([, symbol], index) => symbol.repeat(counts[index]!)).join('');
    return format === "lowerRoman" ? result.toLowerCase() : result;
  }
  const result = String(value);
  budget.consume(result.length);
  return result;
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
