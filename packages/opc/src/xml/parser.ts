import {
  SaxesParser,
  type SaxesAttributeNS,
  type SaxesTagNS,
} from "saxes";

const UTF8_BOM = [0xef, 0xbb, 0xbf] as const;
const XMLNS_NAMESPACE = "http://www.w3.org/2000/xmlns/";

export interface PackageXmlLimits {
  readonly maxDepth: number;
  readonly maxElements: number;
  readonly maxAttributesPerElement: number;
  readonly maxTextCharacters: number;
}

export const DEFAULT_PACKAGE_XML_LIMITS: PackageXmlLimits = Object.freeze({
  maxDepth: 128,
  maxElements: 100_000,
  maxAttributesPerElement: 256,
  maxTextCharacters: 8 * 1024 * 1024,
});

export interface PackageXmlVisitor {
  readonly openElement?: (tag: SaxesTagNS, depth: number) => void;
  readonly closeElement?: (tag: SaxesTagNS, depth: number) => void;
  readonly text?: (text: string, depth: number) => void;
}

export function parsePackageXml(
  bytes: Uint8Array,
  visitor: PackageXmlVisitor,
  limitOverrides: Partial<PackageXmlLimits> = {},
): void {
  const limits = { ...DEFAULT_PACKAGE_XML_LIMITS, ...limitOverrides };
  const xml = decodePackageXml(bytes);
  const parser = new SaxesParser({ xmlns: true, position: true });
  let depth = 0;
  let elements = 0;
  let textCharacters = 0;

  parser.on("doctype", () => {
    throw new Error("OPC infrastructure XML must not contain a DTD.");
  });
  parser.on("xmldecl", (declaration) => {
    if (
      declaration.encoding !== undefined &&
      !/^utf-(?:8|16)$/i.test(declaration.encoding)
    ) {
      throw new Error("OPC infrastructure XML must use UTF-8 or UTF-16.");
    }
  });
  parser.on("opentag", (tag) => {
    elements += 1;
    if (elements > limits.maxElements) {
      throw new Error(`XML element count exceeds ${limits.maxElements}.`);
    }
    if (depth >= limits.maxDepth) {
      throw new Error(`XML nesting depth exceeds ${limits.maxDepth}.`);
    }
    if (Object.keys(tag.attributes).length > limits.maxAttributesPerElement) {
      throw new Error(
        `XML element ${tag.name} exceeds ${limits.maxAttributesPerElement} attributes.`,
      );
    }
    visitor.openElement?.(tag, depth);
    depth += 1;
  });
  parser.on("closetag", (tag) => {
    depth -= 1;
    visitor.closeElement?.(tag, depth);
  });
  parser.on("text", (text) => {
    textCharacters += text.length;
    if (textCharacters > limits.maxTextCharacters) {
      throw new Error(`XML text exceeds ${limits.maxTextCharacters} characters.`);
    }
    visitor.text?.(text, depth);
  });
  parser.on("cdata", (text) => {
    textCharacters += text.length;
    if (textCharacters > limits.maxTextCharacters) {
      throw new Error(`XML text exceeds ${limits.maxTextCharacters} characters.`);
    }
    visitor.text?.(text, depth);
  });
  parser.on("error", (error) => {
    throw error;
  });
  parser.write(xml).close();
}

export function unqualifiedAttributes(
  tag: SaxesTagNS,
): ReadonlyMap<string, string> {
  const attributes = new Map<string, string>();
  for (const attribute of Object.values(tag.attributes)) {
    if (attribute.uri === XMLNS_NAMESPACE) {
      continue;
    }
    if (attribute.uri !== "") {
      throw new Error(`Attribute ${attribute.name} must not use a namespace.`);
    }
    attributes.set(attribute.local, attribute.value);
  }
  return attributes;
}

export function requireExactAttributes(
  tag: SaxesTagNS,
  names: readonly string[],
): Readonly<Record<string, string>> {
  const attributes = unqualifiedAttributes(tag);
  if (
    attributes.size !== names.length ||
    names.some((name) => !attributes.has(name))
  ) {
    throw new Error(
      `Element ${tag.name} must have exactly these attributes: ${names.join(", ")}.`,
    );
  }
  return Object.fromEntries(attributes);
}

function decodePackageXml(bytes: Uint8Array): string {
  if (startsWith(bytes, UTF8_BOM)) {
    return decode(bytes.subarray(3), "utf-8");
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return decode(bytes.subarray(2), "utf-16le");
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return decode(bytes.subarray(2), "utf-16be");
  }
  if (bytes[0] === 0x00 && bytes[1] === 0x3c) {
    return decode(bytes, "utf-16be");
  }
  if (bytes[0] === 0x3c && bytes[1] === 0x00) {
    return decode(bytes, "utf-16le");
  }
  return decode(bytes, "utf-8");
}

function decode(
  bytes: Uint8Array,
  encoding: "utf-8" | "utf-16be" | "utf-16le",
): string {
  return new TextDecoder(encoding, { fatal: true }).decode(bytes);
}

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return prefix.every((byte, index) => bytes[index] === byte);
}

export type { SaxesAttributeNS, SaxesTagNS };
