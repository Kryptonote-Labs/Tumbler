import { describe, expect, test } from "bun:test";
import {
  encodeXmlSource,
  LosslessXmlError,
  parseLosslessXml,
  type XmlEncoding,
} from "../src/index.ts";

const encoder = new TextEncoder();

describe("lossless XML source documents", () => {
  test("retains lexical spans while exposing namespace-aware semantics", () => {
    const source = `<?xml version="1.0" encoding="UTF-8"?>\n<r:root xmlns:r="urn:root" xmlns:x="urn:extension" x:flag='yes'>\n  <!-- keep -->\n  <r:item code = "A&amp;B">before &lt; after<![CDATA[ + raw]]></r:item>\n  <?producer keep?>\n</r:root>`;
    const document = parseLosslessXml(encoder.encode(source));
    const item = document.elements("urn:root", "item")[0]!;

    expect(document.source).toBe(source);
    expect(document.root.qualified).toBe("r:root");
    expect(document.root.namespaceUri).toBe("urn:root");
    expect(document.root.attributes.map((attribute) => attribute.qualified)).toEqual([
      "xmlns:r",
      "xmlns:x",
      "x:flag",
    ]);
    expect(document.source.slice(item.span.start, item.span.end)).toBe(
      `<r:item code = "A&amp;B">before &lt; after<![CDATA[ + raw]]></r:item>`,
    );
    expect(item.attributes[0]?.value).toBe("A&B");
    expect(item.attributes[0]?.quote).toBe('"');
    expect(document.textContent(item)).toBe("before < after + raw");
    expect(document.originalBytes()).toEqual(encoder.encode(source));
  });

  for (const encoding of ["utf-8", "utf-16le", "utf-16be"] as const) {
    for (const withBom of [false, true]) {
      test(`recognizes ${encoding} with BOM=${withBom}`, () => {
        const declared = encoding === "utf-8" ? "UTF-8" : encoding.toUpperCase();
        const source = `<?xml version="1.0" encoding="${declared}"?><root>é𝄞</root>`;
        const bytes = encodeXmlSource(source, encoding, withBom);
        const document = parseLosslessXml(bytes);
        expect(document.encoding).toBe(encoding);
        expect(document.hasByteOrderMark).toBe(withBom);
        expect(document.textContent(document.root)).toBe("é𝄞");
        expect(document.originalBytes()).toBe(bytes);
      });
    }
  }

  test.each([
    `<root>`,
    `<root><child></root>`,
    `<root a=no/>`,
    `<p:root/>`,
    `<root>&unknown;</root>`,
  ])("rejects malformed XML", (source) => {
    expect(() => parseLosslessXml(encoder.encode(source))).toThrow(LosslessXmlError);
  });

  test("rejects DTDs", () => {
    expectLosslessError(
      () => parseLosslessXml(encoder.encode(`<!DOCTYPE root [<!ENTITY x "boom">]><root>&x;</root>`)),
      "doctype_forbidden",
    );
  });

  test("enforces structural and text limits", () => {
    expectLosslessError(
      () => parseLosslessXml(encoder.encode(`<a><b/></a>`), { maxDepth: 1 }),
      "limit_exceeded",
    );
    expectLosslessError(
      () => parseLosslessXml(encoder.encode(`<a x="1" y="2"/>`), { maxAttributesPerElement: 1 }),
      "limit_exceeded",
    );
    expectLosslessError(
      () => parseLosslessXml(encoder.encode(`<a>long</a>`), { maxTextCharacters: 3 }),
      "limit_exceeded",
    );
  });

  test("does not accept elements from another document", () => {
    const first = parseLosslessXml(encoder.encode(`<a/>`));
    const second = parseLosslessXml(encoder.encode(`<a/>`));
    expect(() => first.textContent(second.root)).toThrow(TypeError);
  });
});

function expectLosslessError(
  action: () => unknown,
  code: "doctype_forbidden" | "limit_exceeded",
): void {
  try {
    action();
    throw new Error(`Expected ${code}.`);
  } catch (error) {
    expect(error).toBeInstanceOf(LosslessXmlError);
    expect((error as LosslessXmlError).code).toBe(code);
  }
}
