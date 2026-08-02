import { PartName, PartNameError } from "./part-name.ts";
import {
  parsePackageXml,
  unqualifiedAttributes,
} from "./xml/parser.ts";
import type { ZipArchive } from "./zip/archive.ts";

const RELATIONSHIPS_NAMESPACE =
  "http://schemas.openxmlformats.org/package/2006/relationships";
const ABSOLUTE_IRI = /^[A-Za-z][A-Za-z0-9+.-]*:/;

export type RelationshipsErrorCode =
  | "duplicate_id"
  | "invalid_relationship"
  | "invalid_target"
  | "invalid_xml"
  | "missing_item";

export class RelationshipsError extends Error {
  readonly code: RelationshipsErrorCode;

  constructor(
    code: RelationshipsErrorCode,
    message: string,
    options: { cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "RelationshipsError";
    this.code = code;
  }
}

export interface InternalRelationship {
  readonly id: string;
  readonly type: string;
  readonly target: string;
  readonly targetMode: "Internal";
  readonly targetPartName: PartName;
  readonly fragment: string | undefined;
}

export interface ExternalRelationship {
  readonly id: string;
  readonly type: string;
  readonly target: string;
  readonly targetMode: "External";
}

export type Relationship = InternalRelationship | ExternalRelationship;

export class Relationships {
  readonly source: PartName | null;
  readonly items: readonly Relationship[];
  readonly #byId: ReadonlyMap<string, Relationship>;

  constructor(source: PartName | null, items: readonly Relationship[]) {
    this.source = source;
    this.items = Object.freeze([...items]);
    this.#byId = new Map(items.map((relationship) => [relationship.id, relationship]));
  }

  get(id: string): Relationship | undefined {
    return this.#byId.get(id);
  }

  byType(type: string): readonly Relationship[] {
    return this.items.filter((relationship) => relationship.type === type);
  }
}

export function relationshipItemName(source: PartName | null): string {
  if (source === null) {
    return "_rels/.rels";
  }
  const slash = source.value.lastIndexOf("/");
  const directory = source.value.slice(1, slash + 1);
  const filename = source.value.slice(slash + 1);
  return `${directory}_rels/${filename}.rels`;
}

export function parseRelationships(
  archive: ZipArchive,
  source: PartName | null,
): Relationships {
  const itemName = relationshipItemName(source);
  const entry = archive.get(itemName);
  if (entry === undefined) {
    throw new RelationshipsError(
      "missing_item",
      `The package does not contain relationship item ${JSON.stringify(itemName)}.`,
    );
  }

  const items: Relationship[] = [];
  const ids = new Set<string>();
  let rootSeen = false;

  try {
    parsePackageXml(archive.read(entry), {
      openElement(tag, depth) {
        if (depth === 0) {
          if (tag.uri !== RELATIONSHIPS_NAMESPACE || tag.local !== "Relationships") {
            throw new Error("A relationships item must have a Relationships root element.");
          }
          if (unqualifiedAttributes(tag).size !== 0) {
            throw new Error("The Relationships root element must not have attributes.");
          }
          rootSeen = true;
          return;
        }
        if (
          depth !== 1 ||
          tag.uri !== RELATIONSHIPS_NAMESPACE ||
          tag.local !== "Relationship"
        ) {
          throw new Error("A relationships item contains an unexpected element.");
        }

        const attributes = unqualifiedAttributes(tag);
        const allowed = new Set(["Id", "Type", "Target", "TargetMode"]);
        if (
          attributes.size < 3 ||
          attributes.size > 4 ||
          [...attributes.keys()].some((name) => !allowed.has(name))
        ) {
          throw new RelationshipsError(
            "invalid_relationship",
            "A Relationship must have Id, Type, Target, and optionally TargetMode.",
          );
        }
        const id = attributes.get("Id");
        const type = attributes.get("Type");
        const target = attributes.get("Target");
        const targetMode = attributes.get("TargetMode") ?? "Internal";
        if (id === undefined || type === undefined || target === undefined) {
          throw new RelationshipsError(
            "invalid_relationship",
            "A Relationship is missing Id, Type, or Target.",
          );
        }
        if (!isXmlId(id) || !ABSOLUTE_IRI.test(type) || target.length === 0) {
          throw new RelationshipsError(
            "invalid_relationship",
            `Relationship ${JSON.stringify(id)} has invalid metadata.`,
          );
        }
        if (ids.has(id)) {
          throw new RelationshipsError(
            "duplicate_id",
            `Relationship Id ${JSON.stringify(id)} appears more than once.`,
          );
        }
        ids.add(id);

        if (targetMode === "External") {
          items.push(Object.freeze({ id, type, target, targetMode }));
          return;
        }
        if (targetMode !== "Internal") {
          throw new RelationshipsError(
            "invalid_relationship",
            `Relationship ${JSON.stringify(id)} has invalid TargetMode ${JSON.stringify(targetMode)}.`,
          );
        }
        const resolved = resolveInternalTarget(source, target);
        items.push(Object.freeze({ id, type, target, targetMode, ...resolved }));
      },
      text(text) {
        if (text.trim() !== "") {
          throw new Error("A relationships item must not contain text content.");
        }
      },
    });
  } catch (cause) {
    if (cause instanceof RelationshipsError) {
      throw cause;
    }
    throw new RelationshipsError(
      "invalid_xml",
      `Relationship item ${JSON.stringify(itemName)} is invalid.`,
      { cause },
    );
  }

  if (!rootSeen) {
    throw new RelationshipsError("invalid_xml", "The relationships item is empty.");
  }
  return new Relationships(source, items);
}

function resolveInternalTarget(
  source: PartName | null,
  target: string,
): { readonly targetPartName: PartName; readonly fragment: string | undefined } {
  if (ABSOLUTE_IRI.test(target) || target.startsWith("//")) {
    throw new RelationshipsError(
      "invalid_target",
      `Internal relationship target ${JSON.stringify(target)} must be relative.`,
    );
  }
  try {
    const base = source === null
      ? "https://opc.invalid/"
      : `https://opc.invalid${source.value}`;
    const url = new URL(target, base);
    if (url.origin !== "https://opc.invalid" || url.search !== "") {
      throw new Error("The target escapes the package or contains a query.");
    }
    const targetPartName = PartName.parse(url.pathname);
    return {
      targetPartName,
      fragment: url.hash === "" ? undefined : url.hash.slice(1),
    };
  } catch (cause) {
    if (cause instanceof RelationshipsError) {
      throw cause;
    }
    throw new RelationshipsError(
      "invalid_target",
      `Internal relationship target ${JSON.stringify(target)} is invalid.`,
      { cause },
    );
  }
}

function isXmlId(value: string): boolean {
  return /^[:A-Z_a-z][:A-Z_a-z.\-0-9\u00b7\u00c0-\u02ff\u0370-\u1fff\u200c-\u200d\u2070-\u218f\u2c00-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd]*$/u.test(value);
}
