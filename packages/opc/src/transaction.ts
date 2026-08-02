import { serializeContentTypes, updateContentTypes } from "./content-types.ts";
import {
  OpcPackage,
  OpcPackageError,
  openOpcPackage,
  saveOpcPackage,
} from "./package.ts";
import { PartName } from "./part-name.ts";
import { relationshipItemName } from "./relationships.ts";
import { writeZipArchiveChanges, type ZipEntryAddition } from "./zip/writer.ts";

export type PackageTransactionStatus = "active" | "committed" | "rolled_back";

export type PackageTransactionErrorCode =
  | "duplicate_part"
  | "incoming_relationship"
  | "inactive_transaction"
  | "missing_part"
  | "part_removed";

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

  constructor(pkg: OpcPackage) {
    this.package = pkg;
  }

  get status(): PackageTransactionStatus {
    return this.#status;
  }

  get hasChanges(): boolean {
    return this.#replacements.size !== 0 || this.#additions.size !== 0 || this.#removals.size !== 0;
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
    this.#removals.set(partName.equivalenceKey, part.name);
    return this;
  }

  commit(): Uint8Array {
    this.#assertActive();
    this.#validateNoIncomingRelationships();
    if (this.#additions.size === 0 && this.#removals.size === 0) {
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
    const updatedContentTypes = updateContentTypes(this.package.contentTypes, {
      additions: contentTypeAdditions,
      removals: contentTypeRemovals,
    });
    replacements.set("[Content_Types].xml", serializeContentTypes(updatedContentTypes));

    const output = writeZipArchiveChanges(this.package.archive, {
      replacements,
      additions,
      removals,
    });
    openOpcPackage(output);
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
    const sources: Array<PartName | null> = [null, ...this.package.parts.map((part) => part.name)];
    for (const source of sources) {
      if (source !== null && this.#removals.has(source.equivalenceKey)) {
        continue;
      }
      if (this.package.archive.get(relationshipItemName(source)) === undefined) {
        continue;
      }
      for (const relationship of this.package.relationships(source).items) {
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
}

export function beginPackageTransaction(pkg: OpcPackage): PackageTransaction {
  return new PackageTransaction(pkg);
}
