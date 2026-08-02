import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import {
  beginLosslessXmlEdit,
  encodeXmlSource,
  LosslessXmlError,
  parseLosslessXml,
} from "../src/index.ts";

const safeText = fc.array(
  fc.constantFrom(..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 &<>\"'é日𝄞"),
  { maxLength: 256 },
).map((characters) => characters.join(""));

describe("lossless XML generated and hostile inputs", () => {
  test("round-trips generated lexical documents in every supported encoding", () => {
    fc.assert(fc.property(
      safeText,
      fc.constantFrom("utf-8", "utf-16le", "utf-16be"),
      fc.boolean(),
      (value, encoding, withBom) => {
        const escaped = escapeText(value);
        const source = `<?xml version="1.0" encoding="${encoding.toUpperCase()}"?><r:root xmlns:r="urn:r" a='keep'><!--c--><r:value>${escaped}</r:value><![CDATA[raw]]></r:root>`;
        const bytes = encodeXmlSource(source, encoding, withBom);
        const document = parseLosslessXml(bytes);
        expect(document.originalBytes()).toBe(bytes);
        expect(document.source).toBe(source);
        expect(document.textContent(document.elements("urn:r", "value")[0]!)).toBe(value);
      },
    ), { numRuns: 500 });
  });

  test("round-trips generated text edits and remains deterministic", () => {
    fc.assert(fc.property(safeText, (value) => {
      const bytes = new TextEncoder().encode(`<root><value>before</value><unknown keep='yes'/></root>`);
      const document = parseLosslessXml(bytes);
      const edit = () => beginLosslessXmlEdit(document)
        .setText(document.elements("", "value")[0]!, value)
        .commit().bytes;
      const first = edit();
      expect(first).toEqual(edit());
      const reparsed = parseLosslessXml(first);
      expect(reparsed.textContent(reparsed.elements("", "value")[0]!)).toBe(value);
      expect(reparsed.source).toContain(`<unknown keep='yes'/>`);
    }), { numRuns: 500 });
  });

  test("never leaks implementation exceptions for arbitrary bytes", () => {
    fc.assert(fc.property(fc.uint8Array({ maxLength: 8_192 }), (bytes) => {
      try {
        parseLosslessXml(bytes, {
          maxSourceCharacters: 16_384,
          maxElements: 128,
          maxDepth: 32,
          maxAttributesPerElement: 32,
          maxTextCharacters: 16_384,
        });
      } catch (error) {
        expect(error).toBeInstanceOf(LosslessXmlError);
      }
    }), { numRuns: 2_000 });
  });

  test("handles every single-byte mutation of a representative XML document", () => {
    const source = new TextEncoder().encode(
      `<?xml version="1.0"?><root xmlns:x="urn:x"><value a='1'>text &amp; more</value><!--comment--><x:extension><![CDATA[raw]]></x:extension></root>`,
    );
    for (let index = 0; index < source.length; index += 1) {
      const mutated = source.slice();
      mutated[index] = (mutated[index] ?? 0) ^ 0xff;
      try {
        parseLosslessXml(mutated);
      } catch (error) {
        expect(error).toBeInstanceOf(LosslessXmlError);
      }
    }
  });
});

function escapeText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll("]]>", "]]&gt;");
}
