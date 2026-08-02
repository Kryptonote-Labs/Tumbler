import { OOXML_NAMESPACES } from "./namespaces.ts";
import type {
  LosslessXmlAttribute,
  LosslessXmlDocument,
  LosslessXmlElement,
} from "./xml/source-document.ts";

const XMLNS_NAMESPACE = "http://www.w3.org/2000/xmlns/";
const XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace";
const MC = OOXML_NAMESPACES.markupCompatibility;

export type MarkupCompatibilityErrorCode =
  | "invalid_alternate_content"
  | "must_understand"
  | "unbound_prefix";

export class MarkupCompatibilityError extends Error {
  readonly code: MarkupCompatibilityErrorCode;

  constructor(code: MarkupCompatibilityErrorCode, message: string) {
    super(message);
    this.name = "MarkupCompatibilityError";
    this.code = code;
  }
}

export interface MarkupCompatibilityOptions {
  readonly understoodNamespaces: ReadonlySet<string>;
}

interface ExpandedNamePattern {
  readonly namespaceUri: string;
  readonly localName: string | "*";
}

interface CompatibilityState {
  readonly namespaces: ReadonlyMap<string, string>;
  readonly ignorable: ReadonlySet<string>;
  readonly processContent: readonly ExpandedNamePattern[];
}

export class MarkupCompatibilityView {
  readonly document: LosslessXmlDocument;
  readonly understoodNamespaces: ReadonlySet<string>;
  readonly #states = new Map<number, CompatibilityState>();

  constructor(document: LosslessXmlDocument, options: MarkupCompatibilityOptions) {
    this.document = document;
    this.understoodNamespaces = new Set([
      ...options.understoodNamespaces,
      MC,
      XML_NAMESPACE,
    ]);
    this.#index(document.root, {
      namespaces: new Map([["xml", XML_NAMESPACE]]),
      ignorable: new Set(),
      processContent: [],
    });
  }

  validate(): void {
    for (const element of this.document.elements()) {
      const state = this.#states.get(element.id)!;
      for (const prefix of tokens(attributeValue(element, MC, "MustUnderstand"))) {
        const namespaceUri = resolvePrefix(prefix, state.namespaces);
        if (!this.understoodNamespaces.has(namespaceUri)) {
          throw new MarkupCompatibilityError(
            "must_understand",
            `Namespace ${JSON.stringify(namespaceUri)} is required but not understood.`,
          );
        }
      }
      if (isMcElement(element, "AlternateContent")) {
        this.#selectAlternateContent(element, state);
      }
    }
  }

  children(parent: LosslessXmlElement): readonly LosslessXmlElement[] {
    const state = this.#states.get(parent.id);
    if (state === undefined || this.document.element(parent.id) !== parent) {
      throw new TypeError("The XML element does not belong to this compatibility view.");
    }
    return this.#projectChildren(parent, state);
  }

  #projectChildren(
    parent: LosslessXmlElement,
    state: CompatibilityState,
  ): readonly LosslessXmlElement[] {
    const projected: LosslessXmlElement[] = [];
    for (const child of elementChildren(parent)) {
      const childState = this.#states.get(child.id)!;
      if (isMcElement(child, "AlternateContent")) {
        const branch = this.#selectAlternateContent(child, childState);
        if (branch !== undefined) {
          projected.push(...this.#projectChildren(branch, this.#states.get(branch.id)!));
        }
        continue;
      }
      if (
        !this.understoodNamespaces.has(child.namespaceUri) &&
        childState.ignorable.has(child.namespaceUri)
      ) {
        const process = childState.processContent.some(
          (pattern) =>
            pattern.namespaceUri === child.namespaceUri &&
            (pattern.localName === "*" || pattern.localName === child.localName),
        );
        if (process) {
          projected.push(...this.#projectChildren(child, childState));
        }
        continue;
      }
      projected.push(child);
    }
    return projected;
  }

  #selectAlternateContent(
    alternate: LosslessXmlElement,
    state: CompatibilityState,
  ): LosslessXmlElement | undefined {
    const children = elementChildren(alternate);
    const choices = children.filter((child) => isMcElement(child, "Choice"));
    const fallbacks = children.filter((child) => isMcElement(child, "Fallback"));
    if (
      choices.length === 0 ||
      fallbacks.length > 1 ||
      children.some((child) => !isMcElement(child, "Choice") && !isMcElement(child, "Fallback")) ||
      (fallbacks.length === 1 && children.at(-1) !== fallbacks[0])
    ) {
      throw new MarkupCompatibilityError(
        "invalid_alternate_content",
        "mc:AlternateContent must contain Choices followed by at most one Fallback.",
      );
    }
    for (const choice of choices) {
      const requires = unqualifiedAttribute(choice, "Requires");
      if (requires === undefined || tokens(requires.value).length === 0) {
        throw new MarkupCompatibilityError(
          "invalid_alternate_content",
          "Every mc:Choice must have a non-empty Requires attribute.",
        );
      }
      const choiceState = this.#states.get(choice.id)!;
      const supported = tokens(requires.value).every((prefix) =>
        this.understoodNamespaces.has(resolvePrefix(prefix, choiceState.namespaces))
      );
      if (supported) return choice;
    }
    return fallbacks[0];
  }

  #index(element: LosslessXmlElement, parent: CompatibilityState): void {
    const namespaces = new Map(parent.namespaces);
    for (const attribute of element.attributes) {
      if (attribute.namespaceUri === XMLNS_NAMESPACE) {
        const prefix = attribute.qualified === "xmlns" ? "" : attribute.localName;
        namespaces.set(prefix, attribute.value);
      }
    }
    const ignorable = new Set(parent.ignorable);
    for (const prefix of tokens(attributeValue(element, MC, "Ignorable"))) {
      const namespaceUri = resolvePrefix(prefix, namespaces);
      if (namespaceUri === MC) {
        throw new MarkupCompatibilityError(
          "invalid_alternate_content",
          "The Markup Compatibility namespace cannot be ignorable.",
        );
      }
      ignorable.add(namespaceUri);
    }
    const processContent = [...parent.processContent];
    for (const token of tokens(attributeValue(element, MC, "ProcessContent"))) {
      const separator = token.indexOf(":");
      const prefix = separator < 0 ? "" : token.slice(0, separator);
      const localName = separator < 0 ? token : token.slice(separator + 1);
      if (localName.length === 0) {
        throw new MarkupCompatibilityError(
          "unbound_prefix",
          `ProcessContent token ${JSON.stringify(token)} has no local name.`,
        );
      }
      const namespaceUri = resolvePrefix(prefix, namespaces);
      if (!ignorable.has(namespaceUri)) {
        throw new MarkupCompatibilityError(
          "unbound_prefix",
          `ProcessContent namespace ${JSON.stringify(namespaceUri)} is not ignorable.`,
        );
      }
      processContent.push({
        namespaceUri,
        localName,
      });
    }
    const state = { namespaces, ignorable, processContent };
    this.#states.set(element.id, state);
    for (const child of elementChildren(element)) {
      this.#index(child, state);
    }
  }
}

export function createMarkupCompatibilityView(
  document: LosslessXmlDocument,
  options: MarkupCompatibilityOptions,
): MarkupCompatibilityView {
  return new MarkupCompatibilityView(document, options);
}

function elementChildren(element: LosslessXmlElement): readonly LosslessXmlElement[] {
  return element.children.filter((child): child is LosslessXmlElement => child.kind === "element");
}

function tokens(value: string | undefined): readonly string[] {
  return value?.trim().split(/\s+/).filter(Boolean) ?? [];
}

function attributeValue(
  element: LosslessXmlElement,
  namespaceUri: string,
  localName: string,
): string | undefined {
  return element.attributes.find(
    (attribute) => attribute.namespaceUri === namespaceUri && attribute.localName === localName,
  )?.value;
}

function unqualifiedAttribute(
  element: LosslessXmlElement,
  localName: string,
): LosslessXmlAttribute | undefined {
  return element.attributes.find(
    (attribute) => attribute.namespaceUri === "" && attribute.localName === localName,
  );
}

function resolvePrefix(prefix: string, namespaces: ReadonlyMap<string, string>): string {
  const namespaceUri = namespaces.get(prefix);
  if (namespaceUri === undefined) {
    throw new MarkupCompatibilityError(
      "unbound_prefix",
      `Namespace prefix ${JSON.stringify(prefix)} is not bound.`,
    );
  }
  return namespaceUri;
}

function isMcElement(element: LosslessXmlElement, localName: string): boolean {
  return element.namespaceUri === MC && element.localName === localName;
}
