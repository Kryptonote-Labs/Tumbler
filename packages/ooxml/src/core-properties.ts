import {
  beginPackageTransaction,
  OpcPackage,
  openOpcPackage,
  PartName,
  type PackageTransactionStatus,
} from "@tumblerjs/opc";
import { OOXML_NAMESPACES } from "./namespaces.ts";
import { beginLosslessXmlEdit } from "./xml/editor.ts";
import {
  parseLosslessXml,
  type LosslessXmlDocument,
  type LosslessXmlElement,
} from "./xml/source-document.ts";

const CORE_PROPERTIES_RELATIONSHIP =
  "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties";
const CORE_PROPERTIES_CONTENT_TYPE =
  "application/vnd.openxmlformats-package.core-properties+xml";
const XMLNS_NAMESPACE = "http://www.w3.org/2000/xmlns/";
const XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace";
const CP = OOXML_NAMESPACES.coreProperties;
const DC = OOXML_NAMESPACES.dublinCore;
const DCTERMS = OOXML_NAMESPACES.dublinCoreTerms;
const XSI = OOXML_NAMESPACES.xsi;

export type CorePropertyName =
  | "category"
  | "contentStatus"
  | "created"
  | "creator"
  | "description"
  | "identifier"
  | "keywords"
  | "language"
  | "lastModifiedBy"
  | "lastPrinted"
  | "modified"
  | "revision"
  | "subject"
  | "title"
  | "version";

interface CorePropertyDescriptor {
  readonly name: CorePropertyName;
  readonly namespaceUri: string;
  readonly localName: string;
  readonly preferredPrefix: string;
  readonly date: boolean;
}

const DESCRIPTORS: readonly CorePropertyDescriptor[] = [
  descriptor("title", DC, "title", "dc"),
  descriptor("subject", DC, "subject", "dc"),
  descriptor("creator", DC, "creator", "dc"),
  descriptor("keywords", CP, "keywords", "cp"),
  descriptor("description", DC, "description", "dc"),
  descriptor("lastModifiedBy", CP, "lastModifiedBy", "cp"),
  descriptor("revision", CP, "revision", "cp"),
  descriptor("lastPrinted", CP, "lastPrinted", "cp", true),
  descriptor("created", DCTERMS, "created", "dcterms", true),
  descriptor("modified", DCTERMS, "modified", "dcterms", true),
  descriptor("category", CP, "category", "cp"),
  descriptor("contentStatus", CP, "contentStatus", "cp"),
  descriptor("identifier", DC, "identifier", "dc"),
  descriptor("language", DC, "language", "dc"),
  descriptor("version", CP, "version", "cp"),
];
const DESCRIPTOR_BY_EXPANDED_NAME = new Map(
  DESCRIPTORS.map((item) => [`${item.namespaceUri}|${item.localName}`, item]),
);

export type CorePropertiesErrorCode =
  | "duplicate_property"
  | "invalid_content_type"
  | "invalid_markup"
  | "invalid_relationship"
  | "invalid_value"
  | "namespace_collision";

export class CorePropertiesError extends Error {
  readonly code: CorePropertiesErrorCode;

  constructor(code: CorePropertiesErrorCode, message: string) {
    super(message);
    this.name = "CorePropertiesError";
    this.code = code;
  }
}

export class CoreProperties {
  readonly partName: PartName;
  readonly document: LosslessXmlDocument;
  readonly values: Readonly<Partial<Record<CorePropertyName, string>>>;
  readonly #elements: ReadonlyMap<CorePropertyName, LosslessXmlElement>;

  constructor(
    partName: PartName,
    document: LosslessXmlDocument,
    values: Partial<Record<CorePropertyName, string>>,
    elements: ReadonlyMap<CorePropertyName, LosslessXmlElement>,
  ) {
    this.partName = partName;
    this.document = document;
    this.values = Object.freeze({ ...values });
    this.#elements = elements;
  }

  element(name: CorePropertyName): LosslessXmlElement | undefined {
    return this.#elements.get(name);
  }
}

export function readCoreProperties(pkg: OpcPackage): CoreProperties | undefined {
  const coreParts = pkg.parts.filter((part) => part.contentType === CORE_PROPERTIES_CONTENT_TYPE);
  if (coreParts.length > 1) {
    throw new CorePropertiesError(
      "invalid_relationship",
      "A package must not contain more than one Core Properties part.",
    );
  }
  const relationships = pkg.relationships(null).byType(CORE_PROPERTIES_RELATIONSHIP);
  if (relationships.length > 1) {
    throw new CorePropertiesError(
      "invalid_relationship",
      "A package must not contain more than one core-properties relationship.",
    );
  }
  const relationship = relationships[0];
  if (relationship === undefined) {
    if (coreParts.length !== 0) {
      throw new CorePropertiesError(
        "invalid_relationship",
        "The Core Properties part is not referenced from the package.",
      );
    }
    return undefined;
  }
  if (relationship.targetMode !== "Internal") {
    throw new CorePropertiesError(
      "invalid_relationship",
      "The core-properties relationship must target an internal part.",
    );
  }
  const part = pkg.getPart(relationship.targetPartName)!;
  if (part.contentType !== CORE_PROPERTIES_CONTENT_TYPE) {
    throw new CorePropertiesError(
      "invalid_content_type",
      `Core-properties part has content type ${JSON.stringify(part.contentType)}.`,
    );
  }
  return parseCoreProperties(part.name, pkg.readPart(part));
}

export function parseCoreProperties(partName: PartName, bytes: Uint8Array): CoreProperties {
  const document = parseLosslessXml(bytes);
  if (document.root.namespaceUri !== CP || document.root.localName !== "coreProperties") {
    throw new CorePropertiesError("invalid_markup", "Core properties has an invalid root element.");
  }
  if (document.root.attributes.some((attribute) => attribute.namespaceUri !== XMLNS_NAMESPACE)) {
    throw new CorePropertiesError("invalid_markup", "The coreProperties root must not have attributes.");
  }
  if (
    document.elements(OOXML_NAMESPACES.markupCompatibility).length !== 0 ||
    document.elements().some((element) =>
      element.attributes.some(
        (attribute) => attribute.namespaceUri === OOXML_NAMESPACES.markupCompatibility,
      )
    )
  ) {
    throw new CorePropertiesError(
      "invalid_markup",
      "Core properties must not use Markup Compatibility markup.",
    );
  }

  const values: Partial<Record<CorePropertyName, string>> = {};
  const elements = new Map<CorePropertyName, LosslessXmlElement>();
  for (const child of document.root.children) {
    if (child.kind !== "element") continue;
    const property = DESCRIPTOR_BY_EXPANDED_NAME.get(`${child.namespaceUri}|${child.localName}`);
    if (property === undefined) {
      throw new CorePropertiesError(
        "invalid_markup",
        `Unknown core property ${JSON.stringify(child.qualified)}.`,
      );
    }
    if (elements.has(property.name)) {
      throw new CorePropertiesError(
        "duplicate_property",
        `Core property ${property.name} appears more than once.`,
      );
    }
    if (property.name !== "keywords" && child.children.some((item) => item.kind === "element")) {
      throw new CorePropertiesError(
        "invalid_markup",
        `Core property ${property.name} must not have child elements.`,
      );
    }
    validatePropertyAttributes(property, child);
    elements.set(property.name, child);
    const value = document.textContent(child);
    validatePropertyValue(property, value);
    values[property.name] = value;
  }
  return new CoreProperties(partName, document, values, elements);
}

export class CorePropertiesEditor {
  readonly package: OpcPackage;
  #status: PackageTransactionStatus = "active";
  readonly #changes = new Map<CorePropertyName, string | undefined>();

  constructor(pkg: OpcPackage) {
    this.package = pkg;
  }

  get status(): PackageTransactionStatus {
    return this.#status;
  }

  set(name: CorePropertyName, value: string | undefined): this {
    this.#assertActive();
    if (value !== undefined) validatePropertyValue(descriptorByName(name), value);
    this.#changes.set(name, value);
    return this;
  }

  setTitle(value: string | undefined): this {
    return this.set("title", value);
  }

  setCreator(value: string | undefined): this {
    return this.set("creator", value);
  }

  commit(): Uint8Array {
    this.#assertActive();
    if (this.#changes.size === 0) {
      this.#status = "committed";
      return this.package.archive.originalBytes();
    }
    const current = readCoreProperties(this.package);
    const transaction = beginPackageTransaction(this.package);
    if (current === undefined) {
      const values = Object.fromEntries(
        [...this.#changes].filter((entry): entry is [CorePropertyName, string] => entry[1] !== undefined),
      ) as Partial<Record<CorePropertyName, string>>;
      if (Object.keys(values).length === 0) {
        this.#status = "committed";
        return this.package.archive.originalBytes();
      }
      const partName = availableCorePropertiesPartName(this.package);
      transaction
        .addPart(partName, CORE_PROPERTIES_CONTENT_TYPE, serializeNewCoreProperties(values))
        .addRelationship(null, {
          id: availableRelationshipId(this.package),
          type: CORE_PROPERTIES_RELATIONSHIP,
          target: partName,
        });
    } else {
      const xml = beginLosslessXmlEdit(current.document);
      const namespaces = namespacePrefixes(current.document.root);
      for (const [name, value] of this.#changes) {
        const existing = current.element(name);
        if (value === undefined) {
          if (existing !== undefined) xml.removeElement(existing);
          continue;
        }
        if (existing !== undefined) {
          xml.setText(existing, value);
          continue;
        }
        const property = descriptorByName(name);
        const prefix = ensurePrefix(xml, current.document.root, namespaces, property);
        const attributes = property.namespaceUri === DCTERMS
          ? [{ qualifiedName: `${ensureNamedPrefix(xml, current.document.root, namespaces, XSI, "xsi")}:type`, value: `${prefix}:W3CDTF` }]
          : [];
        xml.appendElement(
          current.document.root,
          prefix === "" ? property.localName : `${prefix}:${property.localName}`,
          value,
          attributes,
        );
      }
      transaction.replacePart(current.partName, xml.commit().bytes);
    }
    const bytes = transaction.commit();
    readCoreProperties(openOpcPackage(bytes));
    this.#status = "committed";
    return bytes;
  }

  rollback(): void {
    this.#assertActive();
    this.#changes.clear();
    this.#status = "rolled_back";
  }

  #assertActive(): void {
    if (this.#status !== "active") {
      throw new CorePropertiesError("invalid_markup", `The core-properties editor is already ${this.#status}.`);
    }
  }
}

export function beginCorePropertiesEdit(pkg: OpcPackage): CorePropertiesEditor {
  return new CorePropertiesEditor(pkg);
}

function validatePropertyAttributes(
  property: CorePropertyDescriptor,
  element: LosslessXmlElement,
): void {
  const attributes = element.attributes.filter((attribute) => attribute.namespaceUri !== XMLNS_NAMESPACE);
  if (property.namespaceUri === DCTERMS) {
    if (
      attributes.length !== 1 ||
      attributes[0]?.namespaceUri !== XSI ||
      attributes[0]?.localName !== "type" ||
      attributes[0]?.value !== "dcterms:W3CDTF"
    ) {
      throw new CorePropertiesError(
        "invalid_markup",
        `${property.name} must have xsi:type="dcterms:W3CDTF".`,
      );
    }
  } else if (property.name === "keywords") {
    if (
      attributes.some(
        (attribute) => attribute.namespaceUri !== XML_NAMESPACE || attribute.localName !== "lang",
      ) ||
      element.children.some((child) =>
        child.kind === "element" &&
        (
          child.namespaceUri !== CP ||
          child.localName !== "value" ||
          child.children.some((grandchild) => grandchild.kind === "element") ||
          child.attributes.some(
            (attribute) =>
              attribute.namespaceUri !== XMLNS_NAMESPACE &&
              (attribute.namespaceUri !== XML_NAMESPACE || attribute.localName !== "lang"),
          )
        )
      )
    ) {
      throw new CorePropertiesError(
        "invalid_markup",
        "keywords may contain only localized value elements and xml:lang attributes.",
      );
    }
  } else if (attributes.length !== 0) {
    throw new CorePropertiesError("invalid_markup", `${property.name} must not have attributes.`);
  }
}

function validatePropertyValue(property: CorePropertyDescriptor, value: string): void {
  if (
    property.date &&
    !/^-?\d{4,}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(value)
  ) {
    throw new CorePropertiesError(
      "invalid_value",
      `${property.name} is not a supported W3CDTF date or date-time.`,
    );
  }
}

function namespacePrefixes(root: LosslessXmlElement): Map<string, string> {
  const prefixes = new Map<string, string>();
  for (const attribute of root.attributes) {
    if (attribute.namespaceUri === XMLNS_NAMESPACE) {
      prefixes.set(attribute.value, attribute.qualified === "xmlns" ? "" : attribute.localName);
    }
  }
  prefixes.set(root.namespaceUri, root.prefix);
  return prefixes;
}

function ensurePrefix(
  editor: ReturnType<typeof beginLosslessXmlEdit>,
  root: LosslessXmlElement,
  prefixes: Map<string, string>,
  property: CorePropertyDescriptor,
): string {
  if (property.namespaceUri === CP) return root.prefix;
  return ensureNamedPrefix(editor, root, prefixes, property.namespaceUri, property.preferredPrefix);
}

function ensureNamedPrefix(
  editor: ReturnType<typeof beginLosslessXmlEdit>,
  root: LosslessXmlElement,
  prefixes: Map<string, string>,
  namespaceUri: string,
  preferredPrefix: string,
): string {
  const existing = prefixes.get(namespaceUri);
  if (existing !== undefined && existing !== "") return existing;
  const collision = root.attributes.find(
    (attribute) =>
      attribute.namespaceUri === XMLNS_NAMESPACE &&
      attribute.localName === preferredPrefix &&
      attribute.value !== namespaceUri,
  );
  if (collision !== undefined) {
    throw new CorePropertiesError(
      "namespace_collision",
      `Prefix ${preferredPrefix} is already bound to another namespace.`,
    );
  }
  editor.insertAttribute(root, `xmlns:${preferredPrefix}`, namespaceUri);
  prefixes.set(namespaceUri, preferredPrefix);
  return preferredPrefix;
}

function serializeNewCoreProperties(
  values: Partial<Record<CorePropertyName, string>>,
): Uint8Array {
  const children = DESCRIPTORS.flatMap((property) => {
    const value = values[property.name];
    if (value === undefined) return [];
    const qualified = property.namespaceUri === CP
      ? `cp:${property.localName}`
      : `${property.preferredPrefix}:${property.localName}`;
    const dateAttribute = property.namespaceUri === DCTERMS
      ? ' xsi:type="dcterms:W3CDTF"'
      : "";
    return [`<${qualified}${dateAttribute}>${escapeXmlText(value)}</${qualified}>`];
  }).join("");
  return new TextEncoder().encode(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="${CP}" xmlns:dc="${DC}" xmlns:dcterms="${DCTERMS}" xmlns:xsi="${XSI}">${children}</cp:coreProperties>`,
  );
}

function availableCorePropertiesPartName(pkg: OpcPackage): PartName {
  for (let index = 0; ; index += 1) {
    const suffix = index === 0 ? "core.xml" : `core-${index + 1}.xml`;
    const name = PartName.parse(`/docProps/${suffix}`);
    if (pkg.getPart(name) === undefined) return name;
  }
}

function availableRelationshipId(pkg: OpcPackage): string {
  const relationships = pkg.relationships(null);
  for (let index = 0; ; index += 1) {
    const id = index === 0 ? "coreProperties" : `coreProperties${index + 1}`;
    if (relationships.get(id) === undefined) return id;
  }
}

function descriptor(
  name: CorePropertyName,
  namespaceUri: string,
  localName: string,
  preferredPrefix: string,
  date = false,
): CorePropertyDescriptor {
  return Object.freeze({ name, namespaceUri, localName, preferredPrefix, date });
}

function descriptorByName(name: CorePropertyName): CorePropertyDescriptor {
  return DESCRIPTORS.find((item) => item.name === name)!;
}

function escapeXmlText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll("]]>", "]]&gt;");
}
