import { beginLosslessXmlEdit, encodeXmlSource, parseLosslessXml, type LosslessXmlElement } from "@tumblerjs/ooxml";
import { beginPackageTransaction, PartName } from "@tumblerjs/opc";
import { BUILT_IN_NUMBER_FORMATS } from "./number-format.ts";
import {
  appendCollection,
  child,
  serializeBorder,
  serializeCellFormat,
  serializeFill,
  serializeFont,
  serializeNumberFormat,
  spreadsheetNamespace,
  type XmlEditor,
} from "./style-xml.ts";
import {
  readSpreadsheetStyles,
  type SpreadsheetBorder,
  type SpreadsheetCellFormat,
  type SpreadsheetFill,
  type SpreadsheetFont,
  type SpreadsheetStyles,
} from "./styles.ts";
import { SpreadsheetError, type SpreadsheetWorkbook } from "./workbook.ts";

const STYLES_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml";
/** ECMA-376-1 §18.8.20: ids below 164 are reserved for built-in number formats. */
const FIRST_CUSTOM_NUMBER_FORMAT_ID = 164;
const NO_FILL: SpreadsheetFill = Object.freeze({ patternType: "none", foreground: undefined, background: undefined });
/** Excel reserves fill 1 for gray125 even when no cell uses it. */
const GRAY_FILL: SpreadsheetFill = Object.freeze({ patternType: "gray125", foreground: undefined, background: undefined });
const BUILT_IN_IDS_BY_CODE = new Map([...BUILT_IN_NUMBER_FORMATS].map(([id, code]) => [code, id]));

/**
 * Derives a complete cell format from an existing one. The second argument is
 * the workbook's Normal format (cellXfs 0). A transform may set
 * `numberFormatCode`; the planner assigns the matching built-in or custom id.
 */
export type SpreadsheetStyleTransform = (format: SpreadsheetCellFormat, normal: SpreadsheetCellFormat) => SpreadsheetCellFormat;

/** Collects append-only style records for one package transaction. */
export class SpreadsheetStylePlanner {
  readonly source: SpreadsheetStyles;
  readonly #workbook: SpreadsheetWorkbook;
  readonly #formats: SpreadsheetCellFormat[];
  readonly #formatKeys = new Map<string, number>();
  readonly #fonts: StyleCollection<SpreadsheetFont>;
  readonly #fills: StyleCollection<SpreadsheetFill>;
  readonly #borders: StyleCollection<SpreadsheetBorder>;
  readonly #numberFormats: Map<number, string>;
  readonly #newNumberFormats: number[] = [];
  readonly #memo = new WeakMap<SpreadsheetStyleTransform, Map<number, number>>();

  constructor(workbook: SpreadsheetWorkbook, source = readSpreadsheetStyles(workbook)) {
    this.#workbook = workbook;
    this.source = source;
    this.#formats = [...source.cellFormats];
    this.#formats.forEach((format, index) => {
      const key = styleKey(format);
      if (!this.#formatKeys.has(key)) this.#formatKeys.set(key, index);
    });
    this.#fonts = new StyleCollection(source.fonts);
    this.#fills = new StyleCollection(source.fills);
    this.#borders = new StyleCollection(source.borders);
    this.#numberFormats = new Map(source.numberFormats);
  }

  get normal(): SpreadsheetCellFormat {
    return this.#formats[0]!;
  }

  /** Returns the cellXfs index for the transformed base format, reusing equivalent records. */
  formatIndex(baseIndex: number, transform: SpreadsheetStyleTransform): number {
    let memo = this.#memo.get(transform);
    if (memo === undefined) this.#memo.set(transform, memo = new Map());
    const cached = memo.get(baseIndex);
    if (cached !== undefined) return cached;
    const base = this.#formats[baseIndex];
    if (base === undefined) throw new SpreadsheetError("invalid_styles", `Cell format index ${baseIndex} does not exist.`);
    const format = this.#withNumberFormatId(transform(base, this.normal));
    const key = styleKey(format);
    const index = key === styleKey(base) ? baseIndex : this.#formatKeys.get(key) ?? this.#append(format, key);
    memo.set(baseIndex, index);
    return index;
  }

  /** Writes new records into the Styles part, creating the part when the workbook has none. */
  stage(transaction: ReturnType<typeof beginPackageTransaction>): void {
    const added = this.#formats.slice(this.source.cellFormats.length);
    if (added.length === 0) return;
    if (this.source.partName === undefined) {
      const partName = availableStylesPartName(this.#workbook);
      transaction
        .addPart(partName, STYLES_CONTENT_TYPE, encodeXmlSource(this.#serializeStyleSheet(), "utf-8", false))
        .addRelationship(this.#workbook.part.name, {
          id: availableRelationshipId(this.#workbook),
          type: stylesRelationshipType(this.#workbook),
          target: partName,
        });
      return;
    }
    const part = this.#workbook.package.getPart(this.source.partName)!;
    const document = parseLosslessXml(this.#workbook.package.readPart(part));
    const namespace = spreadsheetNamespace(this.#workbook.conformance);
    const root = document.root;
    const cellXfs = child(root, namespace, "cellXfs");
    if (child(root, namespace, "fonts") === undefined || cellXfs === undefined) {
      throw new SpreadsheetError("invalid_styles", "Editable styles require fonts and cellXfs collections.");
    }
    const editor = beginLosslessXmlEdit(document);
    // ECMA-376-1 §18.8.39 orders numFmts, fonts, fills, borders, cellStyleXfs, cellXfs.
    const collections: readonly [string, string, number, readonly string[]][] = [
      ["numFmts", this.#newNumberFormats.map((id) => serializeNumberFormat(root.prefix, id, this.#numberFormats.get(id)!)).join(""), this.#numberFormats.size, []],
      ["fonts", this.#fonts.added.map((font) => serializeFont(root.prefix, font)).join(""), this.#fonts.items.length, ["numFmts"]],
      ["fills", this.#fills.added.map((fill) => serializeFill(root.prefix, fill)).join(""), this.#fills.items.length, ["fonts", "numFmts"]],
      ["borders", this.#borders.added.map((border) => serializeBorder(root.prefix, border)).join(""), this.#borders.items.length, ["fills", "fonts", "numFmts"]],
    ];
    for (const [name, markup, count, predecessors] of collections) {
      if (markup === "") continue;
      const collection = child(root, namespace, name);
      if (collection !== undefined) appendCollection(editor, document, collection, markup, count);
      else insertCollection(editor, root, namespace, name, markup, count, predecessors);
    }
    appendCollection(editor, document, cellXfs, added.map((format) => serializeCellFormat(root.prefix, format, this.#ids(format))).join(""), this.#formats.length);
    transaction.replacePart(this.source.partName, editor.commit().bytes);
  }

  #append(format: SpreadsheetCellFormat, key: string): number {
    if (this.#fonts.index(format.font) === undefined) this.#fonts.add(format.font);
    if (this.#fills.index(format.fill) === undefined) {
      if (this.#fills.items.length === 0) this.#fills.add(NO_FILL);
      if (this.#fills.items.length === 1) this.#fills.add(GRAY_FILL);
      this.#fills.add(format.fill);
    }
    if (this.#borders.index(format.border) === undefined) this.#borders.add(format.border);
    this.#formats.push(format);
    this.#formatKeys.set(key, this.#formats.length - 1);
    return this.#formats.length - 1;
  }

  #ids(format: SpreadsheetCellFormat) {
    return {
      numberFormatId: format.numberFormatId,
      fontId: this.#fonts.required(format.font),
      fillId: this.#fills.required(format.fill),
      borderId: this.#borders.required(format.border),
    };
  }

  #withNumberFormatId(format: SpreadsheetCellFormat): SpreadsheetCellFormat {
    const code = format.numberFormatCode;
    if (code === undefined || this.#numberFormats.get(format.numberFormatId) === code) return format;
    const custom = [...this.#numberFormats].find(([, candidate]) => candidate === code)?.[0];
    const builtIn = BUILT_IN_IDS_BY_CODE.get(code);
    if (custom === undefined && builtIn !== undefined && !this.#numberFormats.has(builtIn)) {
      return Object.freeze({ ...format, numberFormatId: builtIn, numberFormatCode: undefined });
    }
    const id = custom ?? this.#allocateNumberFormat(code);
    return Object.freeze({ ...format, numberFormatId: id, numberFormatCode: code });
  }

  #allocateNumberFormat(code: string): number {
    const id = Math.max(FIRST_CUSTOM_NUMBER_FORMAT_ID - 1, ...this.#numberFormats.keys()) + 1;
    this.#numberFormats.set(id, code);
    this.#newNumberFormats.push(id);
    return id;
  }

  #serializeStyleSheet(): string {
    const fills = this.#fills.items.length >= 2 ? this.#fills.items : [...this.#fills.items, GRAY_FILL];
    const numberFormats = [...this.#numberFormats];
    return `<styleSheet xmlns="${spreadsheetNamespace(this.#workbook.conformance)}">` +
      (numberFormats.length === 0 ? "" : `<numFmts count="${numberFormats.length}">${numberFormats.map(([id, code]) => serializeNumberFormat("", id, code)).join("")}</numFmts>`) +
      `<fonts count="${this.#fonts.items.length}">${this.#fonts.items.map((font) => serializeFont("", font)).join("")}</fonts>` +
      `<fills count="${fills.length}">${fills.map((fill) => serializeFill("", fill)).join("")}</fills>` +
      `<borders count="${this.#borders.items.length}">${this.#borders.items.map((border) => serializeBorder("", border)).join("")}</borders>` +
      `<cellXfs count="${this.#formats.length}">${this.#formats.map((format) => serializeCellFormat("", format, this.#ids(format))).join("")}</cellXfs></styleSheet>`;
  }
}

/** Font, fill and border records: source objects keep their exact ids; new values are deduplicated. */
class StyleCollection<T extends object> {
  readonly items: T[];
  readonly #initial: number;
  readonly #identities = new Map<T, number>();
  readonly #keys = new Map<string, number>();

  constructor(source: readonly T[]) {
    this.items = [...source];
    this.#initial = source.length;
    source.forEach((item, index) => {
      if (!this.#identities.has(item)) this.#identities.set(item, index);
      const key = styleKey(item);
      if (!this.#keys.has(key)) this.#keys.set(key, index);
    });
  }

  get added(): readonly T[] {
    return this.items.slice(this.#initial);
  }

  index(item: T): number | undefined {
    return this.#identities.get(item) ?? this.#keys.get(styleKey(item));
  }

  required(item: T): number {
    const index = this.index(item);
    if (index === undefined) throw new SpreadsheetError("invalid_styles", "A resolved style component is missing from its collection.");
    return index;
  }

  add(item: T): number {
    this.items.push(item);
    const key = styleKey(item);
    if (!this.#keys.has(key)) this.#keys.set(key, this.items.length - 1);
    return this.items.length - 1;
  }
}

/** Stable structural identity for style records, independent of property order. */
export function styleKey(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "undefined";
  if (Array.isArray(value)) return `[${value.map(styleKey).join(",")}]`;
  return `{${Object.entries(value)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([name, item]) => `${JSON.stringify(name)}:${styleKey(item)}`)
    .join(",")}}`;
}

function insertCollection(
  editor: XmlEditor,
  root: LosslessXmlElement,
  namespace: string,
  name: string,
  markup: string,
  count: number,
  predecessors: readonly string[],
): void {
  const element = `<${root.prefix === "" ? name : `${root.prefix}:${name}`} count="${count}">${markup}</${root.prefix === "" ? name : `${root.prefix}:${name}`}>`;
  const previous = predecessors.map((candidate) => child(root, namespace, candidate)).find((candidate) => candidate !== undefined);
  const elements = root.children.filter((node): node is LosslessXmlElement => node.kind === "element");
  const next = previous === undefined ? elements[0] : elements[elements.indexOf(previous) + 1];
  if (next === undefined) editor.appendMarkup(root, element);
  else editor.insertMarkupBefore(next, element);
}

function availableStylesPartName(workbook: SpreadsheetWorkbook): PartName {
  const directory = workbook.part.name.value.slice(0, workbook.part.name.value.lastIndexOf("/") + 1);
  for (let suffix = 0; ; suffix += 1) {
    const name = PartName.parse(`${directory}styles${suffix === 0 ? "" : suffix}.xml`);
    if (workbook.package.getPart(name) === undefined) return name;
  }
}

function availableRelationshipId(workbook: SpreadsheetWorkbook): string {
  const used = new Set(workbook.package.relationships(workbook.part.name).items.map((relationship) => relationship.id));
  for (let suffix = 0; ; suffix += 1) {
    const id = `tumblerStyles${suffix === 0 ? "" : suffix}`;
    if (!used.has(id)) return id;
  }
}

function stylesRelationshipType(workbook: SpreadsheetWorkbook): string {
  return workbook.conformance === "strict"
    ? "http://purl.oclc.org/ooxml/officeDocument/relationships/styles"
    : "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles";
}
