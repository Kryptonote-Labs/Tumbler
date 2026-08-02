import { OpcPackage, OpcPackageError, saveOpcPackage } from "./package.ts";
import { PartName } from "./part-name.ts";

export type PackageTransactionStatus = "active" | "committed" | "rolled_back";

export type PackageTransactionErrorCode =
  | "inactive_transaction"
  | "missing_part";

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

  constructor(pkg: OpcPackage) {
    this.package = pkg;
  }

  get status(): PackageTransactionStatus {
    return this.#status;
  }

  get hasChanges(): boolean {
    return this.#replacements.size !== 0;
  }

  replacePart(name: PartName | string, bytes: Uint8Array): this {
    this.#assertActive();
    const partName = typeof name === "string" ? PartName.parse(name) : name;
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

  commit(): Uint8Array {
    this.#assertActive();
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
    const output = saveOpcPackage(this.package, replacements);
    this.#status = "committed";
    return output;
  }

  rollback(): void {
    this.#assertActive();
    this.#replacements.clear();
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
}

export function beginPackageTransaction(pkg: OpcPackage): PackageTransaction {
  return new PackageTransaction(pkg);
}
