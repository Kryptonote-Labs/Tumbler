import {
  encodeXmlSource,
  LosslessXmlDocument,
  parseLosslessXml,
  type LosslessXmlAttribute,
  type LosslessXmlElement,
  type SourceSpan,
} from "./source-document.ts";

export type XmlEditorStatus = "active" | "committed" | "rolled_back";

export type XmlEditErrorCode =
  | "conflicting_edits"
  | "foreign_node"
  | "inactive_editor"
  | "self_closing_parent";

export class XmlEditError extends Error {
  readonly code: XmlEditErrorCode;

  constructor(code: XmlEditErrorCode, message: string) {
    super(message);
    this.name = "XmlEditError";
    this.code = code;
  }
}

export interface XmlEditResult {
  readonly bytes: Uint8Array;
  readonly document: LosslessXmlDocument;
}

export interface NewXmlAttribute {
  readonly qualifiedName: string;
  readonly value: string;
}

interface SourcePatch {
  readonly span: SourceSpan;
  readonly replacement: string;
  readonly label: string;
}

/** Stages surgical changes against the immutable lexical source document. */
export class LosslessXmlEditor {
  readonly document: LosslessXmlDocument;
  #status: XmlEditorStatus = "active";
  readonly #patches: SourcePatch[] = [];

  constructor(document: LosslessXmlDocument) {
    this.document = document;
  }

  get status(): XmlEditorStatus {
    return this.#status;
  }

  get hasChanges(): boolean {
    return this.#patches.length !== 0;
  }

  setText(element: LosslessXmlElement, value: string): this {
    this.#assertElement(element);
    if (element.selfClosing || element.endTagSpan === undefined) {
      const rawStartTag = this.document.source.slice(
        element.startTagSpan.start,
        element.startTagSpan.end,
      );
      const opened = rawStartTag.replace(/\/\s*>$/, ">");
      return this.#stage({
        span: element.span,
        replacement: `${opened}${escapeXmlText(value)}</${element.qualified}>`,
        label: `text of ${element.qualified}`,
      });
    }
    return this.#stage({
      span: { start: element.startTagSpan.end, end: element.endTagSpan.start },
      replacement: escapeXmlText(value),
      label: `text of ${element.qualified}`,
    });
  }

  setAttribute(attribute: LosslessXmlAttribute, value: string): this {
    this.#assertActive();
    this.#assertAttribute(attribute);
    return this.#stage({
      span: attribute.valueSpan,
      replacement: escapeXmlAttribute(value, attribute.quote),
      label: `attribute ${attribute.qualified}`,
    });
  }

  removeAttribute(attribute: LosslessXmlAttribute): this {
    this.#assertActive();
    this.#assertAttribute(attribute);
    return this.#stage({
      span: attribute.span,
      replacement: "",
      label: `attribute ${attribute.qualified}`,
    });
  }

  insertAttribute(
    element: LosslessXmlElement,
    qualifiedName: string,
    value: string,
  ): this {
    this.#assertElement(element);
    const insertion = startTagInsertionOffset(this.document.source, element.startTagSpan);
    return this.#stage({
      span: { start: insertion, end: insertion },
      replacement: ` ${qualifiedName}="${escapeXmlAttribute(value, '"')}"`,
      label: `new attribute ${qualifiedName}`,
    });
  }

  appendElement(
    parent: LosslessXmlElement,
    qualifiedName: string,
    text: string,
    attributes: readonly NewXmlAttribute[] = [],
  ): this {
    this.#assertElement(parent);
    if (parent.selfClosing || parent.endTagSpan === undefined) {
      throw new XmlEditError(
        "self_closing_parent",
        `Cannot append to self-closing element ${parent.qualified}.`,
      );
    }
    const serializedAttributes = attributes.map(
      (attribute) => ` ${attribute.qualifiedName}="${escapeXmlAttribute(attribute.value, '"')}"`,
    ).join("");
    return this.#stage({
      span: { start: parent.endTagSpan.start, end: parent.endTagSpan.start },
      replacement: `<${qualifiedName}${serializedAttributes}>${escapeXmlText(text)}</${qualifiedName}>`,
      label: `new element ${qualifiedName}`,
    });
  }

  /** Replaces an element with XML markup that is validated with the whole document on commit. */
  replaceElementMarkup(element: LosslessXmlElement, markup: string): this {
    this.#assertElement(element);
    return this.#stage({
      span: element.span,
      replacement: markup,
      label: `markup for ${element.qualified}`,
    });
  }

  /** Inserts XML markup immediately before a sibling and validates it on commit. */
  insertMarkupBefore(sibling: LosslessXmlElement, markup: string): this {
    this.#assertElement(sibling);
    return this.#stage({
      span: { start: sibling.span.start, end: sibling.span.start },
      replacement: markup,
      label: `markup before ${sibling.qualified}`,
    });
  }

  /** Appends XML markup to a non-self-closing parent and validates it on commit. */
  appendMarkup(parent: LosslessXmlElement, markup: string): this {
    this.#assertElement(parent);
    if (parent.selfClosing || parent.endTagSpan === undefined) {
      throw new XmlEditError(
        "self_closing_parent",
        `Cannot append to self-closing element ${parent.qualified}.`,
      );
    }
    return this.#stage({
      span: { start: parent.endTagSpan.start, end: parent.endTagSpan.start },
      replacement: markup,
      label: `markup in ${parent.qualified}`,
    });
  }

  removeElement(element: LosslessXmlElement): this {
    this.#assertElement(element);
    return this.#stage({
      span: element.span,
      replacement: "",
      label: `element ${element.qualified}`,
    });
  }

  commit(): XmlEditResult {
    this.#assertActive();
    if (this.#patches.length === 0) {
      this.#status = "committed";
      return { bytes: this.document.originalBytes(), document: this.document };
    }
    const patches = [...this.#patches].sort(
      (left, right) => left.span.start - right.span.start || left.span.end - right.span.end,
    );
    for (let index = 1; index < patches.length; index += 1) {
      const previous = patches[index - 1]!;
      const current = patches[index]!;
      if (
        current.span.start < previous.span.end ||
        (
          current.span.start === previous.span.start &&
          current.span.end === previous.span.end &&
          current.span.start !== current.span.end
        )
      ) {
        throw new XmlEditError(
          "conflicting_edits",
          `${previous.label} conflicts with ${current.label}.`,
        );
      }
    }
    let source = this.document.source;
    for (const patch of patches.toReversed()) {
      source = source.slice(0, patch.span.start) +
        patch.replacement +
        source.slice(patch.span.end);
    }
    const bytes = encodeXmlSource(
      source,
      this.document.encoding,
      this.document.hasByteOrderMark,
    );
    const document = parseLosslessXml(bytes);
    this.#status = "committed";
    return { bytes, document };
  }

  rollback(): void {
    this.#assertActive();
    this.#patches.length = 0;
    this.#status = "rolled_back";
  }

  #stage(patch: SourcePatch): this {
    this.#assertActive();
    this.#patches.push(patch);
    return this;
  }

  #assertElement(element: LosslessXmlElement): void {
    this.#assertActive();
    if (this.document.element(element.id) !== element) {
      throw new XmlEditError("foreign_node", "The XML element belongs to another document.");
    }
  }

  #assertAttribute(attribute: LosslessXmlAttribute): void {
    const found = this.document.elements().some(
      (element) => element.attributes.some((candidate) => candidate === attribute),
    );
    if (!found) {
      throw new XmlEditError("foreign_node", "The XML attribute belongs to another document.");
    }
  }

  #assertActive(): void {
    if (this.#status !== "active") {
      throw new XmlEditError(
        "inactive_editor",
        `The XML editor is already ${this.#status.replace("_", " ")}.`,
      );
    }
  }
}

export function beginLosslessXmlEdit(document: LosslessXmlDocument): LosslessXmlEditor {
  return new LosslessXmlEditor(document);
}

function startTagInsertionOffset(source: string, span: SourceSpan): number {
  let cursor = span.end - 1;
  while (cursor > span.start && /\s/.test(source[cursor - 1] ?? "")) cursor -= 1;
  if (source[cursor - 1] === "/") cursor -= 1;
  return cursor;
}

function escapeXmlText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll("]]>", "]]&gt;");
}

function escapeXmlAttribute(value: string, quote: "\"" | "'"): string {
  const escaped = value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll("\t", "&#x9;")
    .replaceAll("\n", "&#xA;")
    .replaceAll("\r", "&#xD;");
  return quote === '"'
    ? escaped.replaceAll('"', "&quot;")
    : escaped.replaceAll("'", "&apos;");
}
