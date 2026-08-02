import { ContentTypes, ContentTypesError, parseContentTypes } from "./content-types.ts";
import { PartName, PartNameError } from "./part-name.ts";
import {
  parseRelationships,
  isRelationshipPartName,
  relationshipSource,
  Relationships,
  RelationshipsError,
} from "./relationships.ts";
import { openZipArchive, type OpenZipArchiveOptions, type ZipArchive, type ZipEntry } from "./zip/archive.ts";
import { writeZipArchive } from "./zip/writer.ts";

const CONTENT_TYPES_ITEM_NAME = "[Content_Types].xml";
const RELATIONSHIPS_CONTENT_TYPE =
  "application/vnd.openxmlformats-package.relationships+xml";
const OFFICE_DOCUMENT_RELATIONSHIP_TYPES = new Set([
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument",
  "http://purl.oclc.org/ooxml/officeDocument/relationships/officeDocument",
]);

export type OfficeDocumentFamily = "word" | "spreadsheet" | "presentation";

export type OpcPackageErrorCode =
  | "duplicate_part"
  | "invalid_relationship_part"
  | "invalid_part_name"
  | "missing_internal_target"
  | "missing_main_part"
  | "multiple_main_parts"
  | "relationship_source_forbidden"
  | "relationship_target_forbidden"
  | "unsupported_main_part";

export class OpcPackageError extends Error {
  readonly code: OpcPackageErrorCode;
  readonly partName: string | undefined;

  constructor(
    code: OpcPackageErrorCode,
    message: string,
    options: { cause?: unknown; partName?: string } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "OpcPackageError";
    this.code = code;
    this.partName = options.partName;
  }
}

export interface OpcPart {
  readonly name: PartName;
  readonly contentType: string;
  readonly entry: ZipEntry;
}

export interface MainOfficeDocumentPart extends OpcPart {
  readonly family: OfficeDocumentFamily;
}

export class OpcPackage {
  readonly archive: ZipArchive;
  readonly contentTypes: ContentTypes;
  readonly parts: readonly OpcPart[];
  readonly #partsByName: ReadonlyMap<string, OpcPart>;

  constructor(archive: ZipArchive, contentTypes: ContentTypes, parts: readonly OpcPart[]) {
    this.archive = archive;
    this.contentTypes = contentTypes;
    this.parts = Object.freeze([...parts]);
    this.#partsByName = new Map(parts.map((part) => [part.name.equivalenceKey, part]));
  }

  getPart(name: PartName | string): OpcPart | undefined {
    const partName = typeof name === "string" ? PartName.parse(name) : name;
    return this.#partsByName.get(partName.equivalenceKey);
  }

  readPart(part: OpcPart): Uint8Array {
    if (this.#partsByName.get(part.name.equivalenceKey)?.entry !== part.entry) {
      throw new TypeError("The part does not belong to this package.");
    }
    return this.archive.read(part.entry);
  }

  relationships(source: PartName | null): Relationships {
    if (source !== null && isRelationshipPartName(source)) {
      throw new OpcPackageError(
        "relationship_source_forbidden",
        `Relationship part ${JSON.stringify(source.value)} cannot own relationships.`,
        { partName: source.value },
      );
    }
    const relationships = parseRelationships(this.archive, source);
    for (const relationship of relationships.items) {
      if (
        relationship.targetMode === "Internal" &&
        isRelationshipPartName(relationship.targetPartName)
      ) {
        throw new OpcPackageError(
          "relationship_target_forbidden",
          `Relationship ${JSON.stringify(relationship.id)} targets relationship part ${JSON.stringify(relationship.targetPartName.value)}.`,
          { partName: relationship.targetPartName.value },
        );
      }
      if (
        relationship.targetMode === "Internal" &&
        this.getPart(relationship.targetPartName) === undefined
      ) {
        throw new OpcPackageError(
          "missing_internal_target",
          `Relationship ${JSON.stringify(relationship.id)} targets missing part ${JSON.stringify(relationship.targetPartName.value)}.`,
          { partName: relationship.targetPartName.value },
        );
      }
    }
    return relationships;
  }

  mainOfficeDocumentPart(): MainOfficeDocumentPart {
    const candidates = this.relationships(null).items.filter(
      (relationship) => OFFICE_DOCUMENT_RELATIONSHIP_TYPES.has(relationship.type),
    );
    if (candidates.length === 0) {
      throw new OpcPackageError(
        "missing_main_part",
        "The package has no office-document relationship.",
      );
    }
    if (candidates.length > 1) {
      throw new OpcPackageError(
        "multiple_main_parts",
        "The package has more than one office-document relationship.",
      );
    }
    const relationship = candidates[0];
    if (relationship?.targetMode !== "Internal") {
      throw new OpcPackageError(
        "unsupported_main_part",
        "The office-document relationship must target a package part.",
      );
    }
    const part = this.getPart(relationship.targetPartName);
    if (part === undefined) {
      throw new OpcPackageError(
        "missing_internal_target",
        `The main office-document part ${JSON.stringify(relationship.targetPartName.value)} is missing.`,
        { partName: relationship.targetPartName.value },
      );
    }
    const family = classifyMainContentType(part.contentType);
    if (family === undefined) {
      throw new OpcPackageError(
        "unsupported_main_part",
        `Main part ${JSON.stringify(part.name.value)} has unsupported content type ${JSON.stringify(part.contentType)}.`,
        { partName: part.name.value },
      );
    }
    return Object.freeze({ ...part, family });
  }
}

export function openOpcPackage(
  source: Uint8Array,
  options: OpenZipArchiveOptions = {},
): OpcPackage {
  const archive = openZipArchive(source, options);
  const contentTypes = parseContentTypes(archive);
  const parts: OpcPart[] = [];
  const logicalNames = new Set<string>();

  for (const entry of archive.entries) {
    if (entry.name === CONTENT_TYPES_ITEM_NAME) {
      continue;
    }
    let name: PartName;
    try {
      name = PartName.fromZipItemName(entry.name);
    } catch (cause) {
      if (cause instanceof PartNameError) {
        throw new OpcPackageError(
          "invalid_part_name",
          `ZIP item ${JSON.stringify(entry.name)} is not a valid OPC part name.`,
          { cause, partName: entry.name },
        );
      }
      throw cause;
    }
    if (logicalNames.has(name.equivalenceKey)) {
      throw new OpcPackageError(
        "duplicate_part",
        `Package part ${JSON.stringify(name.value)} is equivalent to another part.`,
        { partName: name.value },
      );
    }
    logicalNames.add(name.equivalenceKey);
    let contentType: string;
    try {
      contentType = contentTypes.require(name);
    } catch (cause) {
      if (cause instanceof ContentTypesError) {
        throw cause;
      }
      throw cause;
    }
    parts.push(Object.freeze({ name, contentType, entry }));
  }
  const names = new Set(parts.map((part) => part.name.equivalenceKey));
  for (const part of parts) {
    const source = relationshipSource(part.name);
    if (source === undefined) {
      continue;
    }
    if (part.contentType !== RELATIONSHIPS_CONTENT_TYPE) {
      throw new OpcPackageError(
        "invalid_relationship_part",
        `Relationship part ${JSON.stringify(part.name.value)} has invalid content type ${JSON.stringify(part.contentType)}.`,
        { partName: part.name.value },
      );
    }
    if (source !== null && !names.has(source.equivalenceKey)) {
      throw new OpcPackageError(
        "invalid_relationship_part",
        `Relationship part ${JSON.stringify(part.name.value)} has no source part ${JSON.stringify(source.value)}.`,
        { partName: part.name.value },
      );
    }
  }
  return new OpcPackage(archive, contentTypes, parts);
}

export function saveOpcPackage(
  pkg: OpcPackage,
  replacements: ReadonlyMap<PartName | string, Uint8Array> = new Map(),
): Uint8Array {
  if (replacements.size === 0) {
    return pkg.archive.originalBytes();
  }
  const zipReplacements = new Map<string, Uint8Array>();
  for (const [name, bytes] of replacements) {
    const partName = typeof name === "string" ? PartName.parse(name) : name;
    const part = pkg.getPart(partName);
    if (part === undefined) {
      throw new OpcPackageError(
        "missing_internal_target",
        `Cannot replace missing part ${JSON.stringify(partName.value)}.`,
        { partName: partName.value },
      );
    }
    zipReplacements.set(part.entry.name, bytes);
  }
  return writeZipArchive(pkg.archive, zipReplacements);
}

function classifyMainContentType(contentType: string): OfficeDocumentFamily | undefined {
  if (
    contentType.includes("wordprocessingml") ||
    /^application\/vnd\.ms-word\./.test(contentType)
  ) {
    return "word";
  }
  if (
    contentType.includes("spreadsheetml") ||
    /^application\/vnd\.ms-excel\./.test(contentType)
  ) {
    return "spreadsheet";
  }
  if (
    contentType.includes("presentationml") ||
    /^application\/vnd\.ms-powerpoint\./.test(contentType)
  ) {
    return "presentation";
  }
  return undefined;
}

export { ContentTypesError, RelationshipsError };
