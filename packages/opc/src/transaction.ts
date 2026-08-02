import { serializeContentTypes, updateContentTypes } from "./content-types.ts";
import {
  OpcPackage,
  OpcPackageError,
  openOpcPackage,
  saveOpcPackage,
} from "./package.ts";
import { PartName } from "./part-name.ts";
import {
  createRelationship,
  relationshipItemName,
  Relationships,
  serializeRelationships,
  type NewExternalRelationship,
} from "./relationships.ts";
import { writeZipArchiveChanges, type ZipEntryAddition } from "./zip/writer.ts";

export type PackageTransactionStatus = "active" | "committed" | "rolled_back";

export type PackageTransactionErrorCode =
  | "duplicate_relationship"
  | "duplicate_part"
  | "incoming_relationship"
  | "inactive_transaction"
  | "missing_part"
  | "missing_relationship"
  | "missing_source"
  | "part_removed";

export type PackageRelationshipInput =
  | {
      readonly id: string;
      readonly type: string;
      readonly target: PartName | string;
      readonly targetMode?: "Internal";
      readonly fragment?: string;
    }
  | NewExternalRelationship;

export class PackageTransactionError extends Error {
  readonly code: PackageTransactionErrorCode;
  readonly partName: string | undefined;

  constructor(
    code: PackageTransactionErrorCode,
    message: string,
    options: { partName?: string } = {},
  ) {
    super(message);
    this.name = "PackageTransactionError";
    this.code = code;
    this.partName = options.partName;
  }
}

/**
 * Collects package edits without mutating the opened package. Commit produces a
 * new byte sequence only after all staged changes have been validated.
 */
export class PackageTransaction {
  readonly package: OpcPackage;
  #status: PackageTransactionStatus = "active";
  readonly #replacements = new Map<string, Uint8Array>();
  readonly #additions = new Map<string, {
    readonly name: PartName;
    readonly contentType: string;
    readonly bytes: Uint8Array;
    readonly compressionMethod: 0 | 8;
  }>();
  readonly #removals = new Map<string, PartName>();
  readonly #relationshipSets = new Map<string, Relationships>();

  constructor(pkg: OpcPackage) {
    this.package = pkg;
  }

  get status(): PackageTransactionStatus {
    return this.#status;
  }

  get hasChanges(): boolean {
    return this.#replacements.size !== 0 ||
      this.#additions.size !== 0 ||
      this.#removals.size !== 0 ||
      this.#relationshipSets.size !== 0;
  }

  replacePart(name: PartName | string, bytes: Uint8Array): this {
    this.#assertActive();
    const partName = typeof name === "string" ? PartName.parse(name) : name;
    const addition = this.#additions.get(partName.equivalenceKey);
    if (addition !== undefined) {
      this.#additions.set(partName.equivalenceKey, { ...addition, bytes: bytes.slice() });
      return this;
    }
    if (this.#removals.has(partName.equivalenceKey)) {
      throw new PackageTransactionError(
        "part_removed",
        `Cannot replace removed part ${JSON.stringify(partName.value)}.`,
        { partName: partName.value },
      );
    }
    if (this.package.getPart(partName) === undefined) {
      throw new PackageTransactionError(
        "missing_part",
        `Cannot replace missing part ${JSON.stringify(partName.value)}.`,
        { partName: partName.value },
      );
    }
    this.#replacements.set(partName.equivalenceKey, bytes.slice());
    return this;
  }

  addPart(
    name: PartName | string,
    contentType: string,
    bytes: Uint8Array,
    options: { compressionMethod?: 0 | 8 } = {},
  ): this {
    this.#assertActive();
    const partName = typeof name === "string" ? PartName.parse(name) : name;
    if (
      this.package.getPart(partName) !== undefined ||
      this.#additions.has(partName.equivalenceKey)
    ) {
      throw new PackageTransactionError(
        "duplicate_part",
        `Part ${JSON.stringify(partName.value)} already exists.`,
        { partName: partName.value },
      );
    }
    this.#additions.set(partName.equivalenceKey, {
      name: partName,
      contentType,
      bytes: bytes.slice(),
      compressionMethod: options.compressionMethod ?? 8,
    });
    return this;
  }

  removePart(name: PartName | string): this {
    this.#assertActive();
    const partName = typeof name === "string" ? PartName.parse(name) : name;
    if (this.#additions.delete(partName.equivalenceKey)) {
      this.#relationshipSets.delete(sourceKey(partName));
      return this;
    }
    const part = this.package.getPart(partName);
    if (part === undefined) {
      throw new PackageTransactionError(
        "missing_part",
        `Cannot remove missing part ${JSON.stringify(partName.value)}.`,
        { partName: partName.value },
      );
    }
    this.#replacements.delete(partName.equivalenceKey);
    this.#relationshipSets.delete(sourceKey(part.name));
    this.#removals.set(partName.equivalenceKey, part.name);
    return this;
  }

  addRelationship(
    source: PartName | string | null,
    input: PackageRelationshipInput,
  ): this {
    this.#assertActive();
    const sourceName = normalizeSource(source);
    const current = this.#editableRelationships(sourceName);
    if (current.items.some((relationship) => relationship.id === input.id)) {
      throw new PackageTransactionError(
        "duplicate_relationship",
        `Relationship Id ${JSON.stringify(input.id)} already exists for this source.`,
      );
    }
    const relationship = input.targetMode === "External"
      ? createRelationship(sourceName, input)
      : createRelationship(sourceName, {
          ...input,
          target: typeof input.target === "string"
            ? PartName.parse(input.target)
            : input.target,
        });
    this.#relationshipSets.set(
      sourceKey(sourceName),
      new Relationships(sourceName, [...current.items, relationship]),
    );
    return this;
  }

  removeRelationship(source: PartName | string | null, id: string): this {
    this.#assertActive();
    const sourceName = normalizeSource(source);
    const current = this.#editableRelationships(sourceName);
    if (!current.items.some((relationship) => relationship.id === id)) {
      throw new PackageTransactionError(
        "missing_relationship",
        `Relationship Id ${JSON.stringify(id)} does not exist for this source.`,
      );
    }
    this.#relationshipSets.set(
      sourceKey(sourceName),
      new Relationships(
        sourceName,
        current.items.filter((relationship) => relationship.id !== id),
      ),
    );
    return this;
  }

  commit(): Uint8Array {
    this.#assertActive();
    this.#validateNoIncomingRelationships();
    if (
      this.#additions.size === 0 &&
      this.#removals.size === 0 &&
      this.#relationshipSets.size === 0
    ) {
      const output = this.#commitReplacements();
      this.#status = "committed";
      return output;
    }

    const replacements = this.#zipReplacements();
    const removals = new Set<string>();
    const contentTypeRemovals = new Set<string>();
    for (const partName of this.#removals.values()) {
      const part = this.package.getPart(partName);
      if (part === undefined) {
        throw new OpcPackageError("missing_internal_target", "A staged removal disappeared.");
      }
      removals.add(part.entry.name);
      contentTypeRemovals.add(part.name.equivalenceKey);
      const relationshipEntryName = relationshipItemName(part.name);
      const relationshipEntry = this.package.archive.get(relationshipEntryName);
      if (relationshipEntry !== undefined) {
        removals.add(relationshipEntry.name);
        contentTypeRemovals.add(PartName.fromZipItemName(relationshipEntry.name).equivalenceKey);
      }
    }
    const additions: ZipEntryAddition[] = [...this.#additions.values()].map((addition) => ({
      name: addition.name.value.slice(1),
      data: addition.bytes,
      compressionMethod: addition.compressionMethod,
    }));
    const contentTypeAdditions = new Map(
      [...this.#additions.values()].map((addition) => [addition.name, addition.contentType]),
    );
    for (const relationships of this.#relationshipSets.values()) {
      const itemName = relationshipItemName(relationships.source);
      const existing = this.package.archive.get(itemName);
      if (relationships.items.length === 0) {
        if (existing !== undefined) {
          removals.add(existing.name);
          contentTypeRemovals.add(PartName.fromZipItemName(existing.name).equivalenceKey);
        }
        continue;
      }
      const bytes = serializeRelationships(relationships);
      if (existing === undefined) {
        const partName = PartName.fromZipItemName(itemName);
        additions.push({ name: itemName, data: bytes, compressionMethod: 8 });
        contentTypeAdditions.set(
          partName,
          "application/vnd.openxmlformats-package.relationships+xml",
        );
      } else {
        replacements.set(existing.name, bytes);
      }
    }
    const updatedContentTypes = updateContentTypes(this.package.contentTypes, {
      additions: contentTypeAdditions,
      removals: contentTypeRemovals,
    });
    if (!contentTypesEqual(this.package.contentTypes, updatedContentTypes)) {
      replacements.set("[Content_Types].xml", serializeContentTypes(updatedContentTypes));
    }

    const output = writeZipArchiveChanges(this.package.archive, {
      replacements,
      additions,
      removals,
    });
    validateRelationshipGraph(openOpcPackage(output));
    this.#status = "committed";
    return output;
  }

  #commitReplacements(): Uint8Array {
    const replacements = new Map<PartName, Uint8Array>();
    for (const [key, bytes] of this.#replacements) {
      const part = this.package.parts.find((candidate) => candidate.name.equivalenceKey === key);
      if (part === undefined) {
        throw new OpcPackageError(
          "missing_internal_target",
          `A staged replacement part disappeared from the base package.`,
        );
      }
      replacements.set(part.name, bytes);
    }
    return saveOpcPackage(this.package, replacements);
  }

  rollback(): void {
    this.#assertActive();
    this.#replacements.clear();
    this.#additions.clear();
    this.#removals.clear();
    this.#relationshipSets.clear();
    this.#status = "rolled_back";
  }

  #assertActive(): void {
    if (this.#status !== "active") {
      throw new PackageTransactionError(
        "inactive_transaction",
        `The package transaction is already ${this.#status.replace("_", " ")}.`,
      );
    }
  }

  #zipReplacements(): Map<string, Uint8Array> {
    const replacements = new Map<string, Uint8Array>();
    for (const [key, bytes] of this.#replacements) {
      const part = this.package.parts.find((candidate) => candidate.name.equivalenceKey === key);
      if (part !== undefined) {
        replacements.set(part.entry.name, bytes);
      }
    }
    return replacements;
  }

  #validateNoIncomingRelationships(): void {
    if (this.#removals.size === 0) {
      return;
    }
    const sources: Array<PartName | null> = [
      null,
      ...this.package.parts.map((part) => part.name),
      ...[...this.#relationshipSets.values()].map((relationships) => relationships.source),
    ];
    const visited = new Set<string>();
    for (const source of sources) {
      const key = sourceKey(source);
      if (visited.has(key)) {
        continue;
      }
      visited.add(key);
      if (source !== null && this.#removals.has(source.equivalenceKey)) {
        continue;
      }
      const edited = this.#relationshipSets.get(key);
      if (
        edited === undefined &&
        this.package.archive.get(relationshipItemName(source)) === undefined
      ) {
        continue;
      }
      const relationships = edited ?? this.package.relationships(source);
      for (const relationship of relationships.items) {
        if (
          relationship.targetMode === "Internal" &&
          this.#removals.has(relationship.targetPartName.equivalenceKey)
        ) {
          throw new PackageTransactionError(
            "incoming_relationship",
            `Part ${JSON.stringify(relationship.targetPartName.value)} is still targeted by relationship ${JSON.stringify(relationship.id)}.`,
            { partName: relationship.targetPartName.value },
          );
        }
      }
    }
  }

  #editableRelationships(source: PartName | null): Relationships {
    if (source !== null) {
      if (this.#removals.has(source.equivalenceKey)) {
        throw new PackageTransactionError(
          "part_removed",
          `Cannot edit relationships for removed source ${JSON.stringify(source.value)}.`,
          { partName: source.value },
        );
      }
      if (
        this.package.getPart(source) === undefined &&
        !this.#additions.has(source.equivalenceKey)
      ) {
        throw new PackageTransactionError(
          "missing_source",
          `Relationship source ${JSON.stringify(source.value)} does not exist.`,
          { partName: source.value },
        );
      }
    }
    const key = sourceKey(source);
    const staged = this.#relationshipSets.get(key);
    if (staged !== undefined) {
      return staged;
    }
    const existing = this.package.archive.get(relationshipItemName(source));
    return existing === undefined
      ? new Relationships(source, [])
      : this.package.relationships(source);
  }
}

export function beginPackageTransaction(pkg: OpcPackage): PackageTransaction {
  return new PackageTransaction(pkg);
}

function normalizeSource(source: PartName | string | null): PartName | null {
  return typeof source === "string" ? PartName.parse(source) : source;
}

function sourceKey(source: PartName | null): string {
  return source?.equivalenceKey ?? "$package";
}

function validateRelationshipGraph(pkg: OpcPackage): void {
  const sources: Array<PartName | null> = [null, ...pkg.parts.map((part) => part.name)];
  for (const source of sources) {
    if (pkg.archive.get(relationshipItemName(source)) !== undefined) {
      pkg.relationships(source);
    }
  }
}

function contentTypesEqual(
  left: OpcPackage["contentTypes"],
  right: OpcPackage["contentTypes"],
): boolean {
  return left.defaults.length === right.defaults.length &&
    left.overrides.length === right.overrides.length &&
    left.defaults.every((item, index) => {
      const other = right.defaults[index];
      return other !== undefined &&
        item.extension === other.extension &&
        item.contentType === other.contentType;
    }) &&
    left.overrides.every((item, index) => {
      const other = right.overrides[index];
      return other !== undefined &&
        item.partName.equals(other.partName) &&
        item.contentType === other.contentType;
    });
}
