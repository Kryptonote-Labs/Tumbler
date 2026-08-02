import { SaxesParser, type SaxesAttributeNS, type SaxesTagNS } from "saxes";

const UTF8_BOM = [0xef, 0xbb, 0xbf] as const;

export type XmlEncoding = "utf-8" | "utf-16le" | "utf-16be";

export interface SourceSpan {
  readonly start: number;
  readonly end: number;
}

export interface XmlQualifiedName {
  readonly qualified: string;
  readonly prefix: string;
  readonly localName: string;
  readonly namespaceUri: string;
}

export interface LosslessXmlAttribute extends XmlQualifiedName {
  readonly value: string;
  readonly quote: "\"" | "'";
  readonly span: SourceSpan;
  readonly valueSpan: SourceSpan;
}

export interface LosslessXmlText {
  readonly kind: "text" | "cdata" | "comment" | "processing_instruction";
  readonly id: number;
  readonly value: string;
  readonly span: SourceSpan;
}

export interface LosslessXmlElement extends XmlQualifiedName {
  readonly kind: "element";
  readonly id: number;
  readonly attributes: readonly LosslessXmlAttribute[];
  readonly children: readonly LosslessXmlNode[];
  readonly span: SourceSpan;
  readonly startTagSpan: SourceSpan;
  readonly endTagSpan: SourceSpan | undefined;
  readonly selfClosing: boolean;
}

export type LosslessXmlNode = LosslessXmlElement | LosslessXmlText;

export interface LosslessXmlLimits {
  readonly maxSourceCharacters: number;
  readonly maxDepth: number;
  readonly maxElements: number;
  readonly maxAttributesPerElement: number;
  readonly maxTextCharacters: number;
}

export const DEFAULT_LOSSLESS_XML_LIMITS: LosslessXmlLimits = Object.freeze({
  maxSourceCharacters: 64 * 1024 * 1024,
  maxDepth: 256,
  maxElements: 1_000_000,
  maxAttributesPerElement: 512,
  maxTextCharacters: 32 * 1024 * 1024,
});

export type LosslessXmlErrorCode =
  | "doctype_forbidden"
  | "invalid_encoding"
  | "invalid_xml"
  | "limit_exceeded";

export class LosslessXmlError extends Error {
  readonly code: LosslessXmlErrorCode;

  constructor(
    code: LosslessXmlErrorCode,
    message: string,
    options: { cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "LosslessXmlError";
    this.code = code;
  }
}

export class LosslessXmlDocument {
  readonly source: string;
  readonly encoding: XmlEncoding;
  readonly hasByteOrderMark: boolean;
  readonly root: LosslessXmlElement;
  readonly #originalBytes: Uint8Array;
  readonly #elementsById: ReadonlyMap<number, LosslessXmlElement>;

  constructor(
    source: string,
    encoding: XmlEncoding,
    hasByteOrderMark: boolean,
    root: LosslessXmlElement,
    originalBytes: Uint8Array,
  ) {
    this.source = source;
    this.encoding = encoding;
    this.hasByteOrderMark = hasByteOrderMark;
    this.root = root;
    this.#originalBytes = originalBytes;
    const elements = new Map<number, LosslessXmlElement>();
    visitElements(root, (element) => elements.set(element.id, element));
    this.#elementsById = elements;
  }

  originalBytes(): Uint8Array {
    return this.#originalBytes;
  }

  element(id: number): LosslessXmlElement | undefined {
    return this.#elementsById.get(id);
  }

  elements(namespaceUri?: string, localName?: string): readonly LosslessXmlElement[] {
    return [...this.#elementsById.values()].filter(
      (element) =>
        (namespaceUri === undefined || element.namespaceUri === namespaceUri) &&
        (localName === undefined || element.localName === localName),
    );
  }

  textContent(element: LosslessXmlElement): string {
    if (this.#elementsById.get(element.id) !== element) {
      throw new TypeError("The XML element does not belong to this document.");
    }
    return collectText(element);
  }
}

interface LexicalAttribute {
  readonly name: string;
  readonly quote: "\"" | "'";
  readonly span: SourceSpan;
  readonly valueSpan: SourceSpan;
}

type LexicalToken =
  | { readonly kind: "start"; readonly name: string; readonly span: SourceSpan; readonly attributes: readonly LexicalAttribute[]; readonly selfClosing: boolean }
  | { readonly kind: "end"; readonly name: string; readonly span: SourceSpan }
  | { readonly kind: "text" | "cdata" | "comment" | "processing_instruction"; readonly span: SourceSpan; readonly value: string };

interface SemanticTag {
  readonly name: string;
  readonly prefix: string;
  readonly localName: string;
  readonly namespaceUri: string;
  readonly attributes: readonly SaxesAttributeNS[];
}

interface MutableElement extends XmlQualifiedName {
  readonly kind: "element";
  readonly id: number;
  readonly attributes: LosslessXmlAttribute[];
  readonly children: LosslessXmlNode[];
  span: SourceSpan;
  readonly startTagSpan: SourceSpan;
  endTagSpan: SourceSpan | undefined;
  readonly selfClosing: boolean;
}

export function parseLosslessXml(
  bytes: Uint8Array,
  limitOverrides: Partial<LosslessXmlLimits> = {},
): LosslessXmlDocument {
  const limits = { ...DEFAULT_LOSSLESS_XML_LIMITS, ...limitOverrides };
  let decoded: ReturnType<typeof decodeXml>;
  try {
    decoded = decodeXml(bytes);
  } catch (cause) {
    throw new LosslessXmlError("invalid_encoding", "XML uses an invalid or unsupported encoding.", { cause });
  }
  if (decoded.source.length > limits.maxSourceCharacters) {
    throw new LosslessXmlError(
      "limit_exceeded",
      `XML source exceeds ${limits.maxSourceCharacters} characters.`,
    );
  }

  let tokens: readonly LexicalToken[];
  try {
    tokens = scanXml(decoded.source);
  } catch (cause) {
    if (cause instanceof LosslessXmlError) {
      throw cause;
    }
    throw new LosslessXmlError("invalid_xml", "XML lexical structure is invalid.", { cause });
  }
  const semanticTags = validateSemantics(decoded.source, decoded.encoding, limits);
  const root = buildTree(tokens, semanticTags);
  return new LosslessXmlDocument(
    decoded.source,
    decoded.encoding,
    decoded.hasByteOrderMark,
    root,
    bytes,
  );
}

export function encodeXmlSource(
  source: string,
  encoding: XmlEncoding,
  withByteOrderMark: boolean,
): Uint8Array {
  const body = encoding === "utf-8"
    ? new TextEncoder().encode(source)
    : encodeUtf16(source, encoding === "utf-16le");
  if (!withByteOrderMark) {
    return body;
  }
  const bom = encoding === "utf-8"
    ? Uint8Array.from(UTF8_BOM)
    : encoding === "utf-16le"
      ? Uint8Array.from([0xff, 0xfe])
      : Uint8Array.from([0xfe, 0xff]);
  const output = new Uint8Array(bom.byteLength + body.byteLength);
  output.set(bom);
  output.set(body, bom.byteLength);
  return output;
}

function decodeXml(bytes: Uint8Array): {
  readonly source: string;
  readonly encoding: XmlEncoding;
  readonly hasByteOrderMark: boolean;
} {
  let encoding: XmlEncoding;
  let offset = 0;
  let hasByteOrderMark = false;
  if (startsWith(bytes, UTF8_BOM)) {
    encoding = "utf-8";
    offset = 3;
    hasByteOrderMark = true;
  } else if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    encoding = "utf-16le";
    offset = 2;
    hasByteOrderMark = true;
  } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    encoding = "utf-16be";
    offset = 2;
    hasByteOrderMark = true;
  } else if (bytes[0] === 0x00 && bytes[1] === 0x3c) {
    encoding = "utf-16be";
  } else if (bytes[0] === 0x3c && bytes[1] === 0x00) {
    encoding = "utf-16le";
  } else {
    encoding = "utf-8";
  }
  return {
    source: new TextDecoder(encoding, { fatal: true }).decode(bytes.subarray(offset)),
    encoding,
    hasByteOrderMark,
  };
}

function validateSemantics(
  source: string,
  encoding: XmlEncoding,
  limits: LosslessXmlLimits,
): readonly SemanticTag[] {
  const tags: SemanticTag[] = [];
  const parser = new SaxesParser({ xmlns: true, position: true });
  let depth = 0;
  let elements = 0;
  let textCharacters = 0;
  let failure: unknown;
  parser.on("doctype", () => {
    throw new LosslessXmlError("doctype_forbidden", "OOXML parts must not contain a DTD.");
  });
  parser.on("xmldecl", (declaration) => {
    if (
      declaration.encoding !== undefined &&
      !declaredEncodingMatches(declaration.encoding, encoding)
    ) {
      throw new Error(`XML declaration encoding does not match ${encoding}.`);
    }
  });
  parser.on("opentag", (tag) => {
    elements += 1;
    if (elements > limits.maxElements || depth >= limits.maxDepth) {
      throw new LosslessXmlError("limit_exceeded", "XML element count or depth exceeds its limit.");
    }
    const attributes = Object.values(tag.attributes);
    if (attributes.length > limits.maxAttributesPerElement) {
      throw new LosslessXmlError("limit_exceeded", "XML attribute count exceeds its limit.");
    }
    tags.push(copySemanticTag(tag, attributes));
    depth += 1;
  });
  parser.on("closetag", () => {
    depth -= 1;
  });
  const countText = (text: string) => {
    textCharacters += text.length;
    if (textCharacters > limits.maxTextCharacters) {
      throw new LosslessXmlError("limit_exceeded", "XML text exceeds its limit.");
    }
  };
  parser.on("text", countText);
  parser.on("cdata", countText);
  parser.on("error", (error) => {
    failure = error;
  });
  try {
    parser.write(source).close();
  } catch (cause) {
    if (cause instanceof LosslessXmlError) {
      throw cause;
    }
    throw new LosslessXmlError("invalid_xml", "XML is not well formed.", { cause });
  }
  if (failure !== undefined) {
    throw new LosslessXmlError("invalid_xml", "XML is not well formed.", { cause: failure });
  }
  return tags;
}

function scanXml(source: string): readonly LexicalToken[] {
  const tokens: LexicalToken[] = [];
  let cursor = 0;
  while (cursor < source.length) {
    const open = source.indexOf("<", cursor);
    if (open < 0) {
      if (cursor < source.length) {
        tokens.push({ kind: "text", span: { start: cursor, end: source.length }, value: decodeEntities(source.slice(cursor)) });
      }
      break;
    }
    if (open > cursor) {
      tokens.push({ kind: "text", span: { start: cursor, end: open }, value: decodeEntities(source.slice(cursor, open)) });
    }
    if (source.startsWith("<!--", open)) {
      const end = requireTerminator(source, "-->", open + 4) + 3;
      tokens.push({ kind: "comment", span: { start: open, end }, value: source.slice(open + 4, end - 3) });
      cursor = end;
      continue;
    }
    if (source.startsWith("<![CDATA[", open)) {
      const end = requireTerminator(source, "]]>", open + 9) + 3;
      tokens.push({ kind: "cdata", span: { start: open, end }, value: source.slice(open + 9, end - 3) });
      cursor = end;
      continue;
    }
    if (/^<!DOCTYPE(?:\s|>)/.test(source.slice(open))) {
      throw new LosslessXmlError("doctype_forbidden", "OOXML parts must not contain a DTD.");
    }
    if (source.startsWith("<!", open)) {
      throw new Error("Unsupported XML declaration.");
    }
    if (source.startsWith("<?", open)) {
      const end = requireTerminator(source, "?>", open + 2) + 2;
      tokens.push({ kind: "processing_instruction", span: { start: open, end }, value: source.slice(open + 2, end - 2) });
      cursor = end;
      continue;
    }
    if (source.startsWith("</", open)) {
      const close = requireTerminator(source, ">", open + 2);
      tokens.push({
        kind: "end",
        name: source.slice(open + 2, close).trim(),
        span: { start: open, end: close + 1 },
      });
      cursor = close + 1;
      continue;
    }
    const end = findStartTagEnd(source, open + 1);
    tokens.push(parseStartTag(source, open, end + 1));
    cursor = end + 1;
  }
  return tokens;
}

function parseStartTag(source: string, start: number, end: number): LexicalToken {
  let cursor = start + 1;
  while (cursor < end && !/[\s/>]/.test(source[cursor] ?? "")) cursor += 1;
  const name = source.slice(start + 1, cursor);
  const attributes: LexicalAttribute[] = [];
  while (cursor < end - 1) {
    while (/\s/.test(source[cursor] ?? "")) cursor += 1;
    if (source[cursor] === "/" || source[cursor] === ">") break;
    const attributeStart = cursor;
    while (cursor < end && !/[\s=/>]/.test(source[cursor] ?? "")) cursor += 1;
    const attributeName = source.slice(attributeStart, cursor);
    while (/\s/.test(source[cursor] ?? "")) cursor += 1;
    if (source[cursor] !== "=") throw new Error(`Attribute ${attributeName} has no equals sign.`);
    cursor += 1;
    while (/\s/.test(source[cursor] ?? "")) cursor += 1;
    const quote = source[cursor];
    if (quote !== '"' && quote !== "'") throw new Error(`Attribute ${attributeName} is not quoted.`);
    cursor += 1;
    const valueStart = cursor;
    const valueEnd = source.indexOf(quote, valueStart);
    if (valueEnd < 0 || valueEnd >= end) throw new Error(`Attribute ${attributeName} is unterminated.`);
    cursor = valueEnd + 1;
    attributes.push({
      name: attributeName,
      quote,
      span: { start: attributeStart, end: cursor },
      valueSpan: { start: valueStart, end: valueEnd },
    });
  }
  return {
    kind: "start",
    name,
    span: { start, end },
    attributes,
    selfClosing: /\/\s*>$/.test(source.slice(start, end)),
  };
}

function buildTree(
  tokens: readonly LexicalToken[],
  semanticTags: readonly SemanticTag[],
): LosslessXmlElement {
  const stack: MutableElement[] = [];
  let root: MutableElement | undefined;
  let semanticIndex = 0;
  let nextId = 1;
  for (const token of tokens) {
    if (token.kind === "start") {
      const semantic = semanticTags[semanticIndex++];
      if (semantic === undefined || semantic.name !== token.name) {
        throw new LosslessXmlError("invalid_xml", "Lexical and semantic XML structures disagree.");
      }
      const element: MutableElement = {
        kind: "element",
        id: nextId++,
        qualified: semantic.name,
        prefix: semantic.prefix,
        localName: semantic.localName,
        namespaceUri: semantic.namespaceUri,
        attributes: token.attributes.map((attribute) => mapAttribute(attribute, semantic)),
        children: [],
        span: token.span,
        startTagSpan: token.span,
        endTagSpan: undefined,
        selfClosing: token.selfClosing,
      };
      const parent = stack.at(-1);
      if (parent !== undefined) parent.children.push(element);
      else if (root === undefined) root = element;
      if (!token.selfClosing) stack.push(element);
      continue;
    }
    if (token.kind === "end") {
      const element = stack.pop();
      if (element === undefined || element.qualified !== token.name) {
        throw new LosslessXmlError("invalid_xml", "XML closing tag does not match its opening tag.");
      }
      element.endTagSpan = token.span;
      element.span = { start: element.span.start, end: token.span.end };
      continue;
    }
    const parent = stack.at(-1);
    if (parent !== undefined) {
      parent.children.push({ ...token, id: nextId++ });
    }
  }
  if (root === undefined || stack.length !== 0 || semanticIndex !== semanticTags.length) {
    throw new LosslessXmlError("invalid_xml", "XML document structure is incomplete.");
  }
  return root;
}

function mapAttribute(
  lexical: LexicalAttribute,
  semantic: SemanticTag,
): LosslessXmlAttribute {
  const attribute = semantic.attributes.find((candidate) => candidate.name === lexical.name);
  if (attribute === undefined) {
    throw new LosslessXmlError("invalid_xml", `Attribute ${lexical.name} has no semantic match.`);
  }
  return {
    qualified: attribute.name,
    prefix: attribute.prefix,
    localName: attribute.local,
    namespaceUri: attribute.uri,
    value: attribute.value,
    quote: lexical.quote,
    span: lexical.span,
    valueSpan: lexical.valueSpan,
  };
}

function copySemanticTag(tag: SaxesTagNS, attributes: readonly SaxesAttributeNS[]): SemanticTag {
  return {
    name: tag.name,
    prefix: tag.prefix,
    localName: tag.local,
    namespaceUri: tag.uri,
    attributes: attributes.map((attribute) => ({ ...attribute })),
  };
}

function collectText(element: LosslessXmlElement): string {
  return element.children.map((child) =>
    child.kind === "element"
      ? collectText(child)
      : child.kind === "text" || child.kind === "cdata"
        ? child.value
        : ""
  ).join("");
}

function visitElements(element: LosslessXmlElement, visit: (element: LosslessXmlElement) => void): void {
  visit(element);
  for (const child of element.children) {
    if (child.kind === "element") visitElements(child, visit);
  }
}

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9A-Fa-f]+|#[0-9]+|amp|lt|gt|apos|quot);/g, (_match, entity: string) => {
    if (entity === "amp") return "&";
    if (entity === "lt") return "<";
    if (entity === "gt") return ">";
    if (entity === "apos") return "'";
    if (entity === "quot") return '"';
    const codePoint = entity.startsWith("#x")
      ? Number.parseInt(entity.slice(2), 16)
      : Number.parseInt(entity.slice(1), 10);
    return String.fromCodePoint(codePoint);
  });
}

function findStartTagEnd(source: string, cursor: number): number {
  let quote: string | undefined;
  for (let index = cursor; index < source.length; index += 1) {
    const character = source[index];
    if (quote !== undefined) {
      if (character === quote) quote = undefined;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return index;
    }
  }
  throw new Error("Start tag is unterminated.");
}

function requireTerminator(source: string, terminator: string, from: number): number {
  const index = source.indexOf(terminator, from);
  if (index < 0) throw new Error(`XML construct is missing ${terminator}.`);
  return index;
}

function declaredEncodingMatches(value: string, encoding: XmlEncoding): boolean {
  const normalized = value.toLowerCase();
  return normalized === encoding ||
    (normalized === "utf-16" && (encoding === "utf-16le" || encoding === "utf-16be"));
}

function encodeUtf16(source: string, littleEndian: boolean): Uint8Array {
  const output = new Uint8Array(source.length * 2);
  const view = new DataView(output.buffer);
  for (let index = 0; index < source.length; index += 1) {
    view.setUint16(index * 2, source.charCodeAt(index), littleEndian);
  }
  return output;
}

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return prefix.every((byte, index) => bytes[index] === byte);
}
