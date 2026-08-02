import { describe, expect, test } from "bun:test";
import {
  beginLosslessXmlEdit,
  encodeXmlSource,
  parseLosslessXml,
  XmlEditError,
} from "../src/index.ts";

const encoder = new TextEncoder();

describe("lossless XML edits", () => {
  test("returns the original bytes and document for a no-op", () => {
    const bytes = encoder.encode(`<root a='1'/>`);
    const document = parseLosslessXml(bytes);
    const result = beginLosslessXmlEdit(document).commit();
    expect(result.bytes).toBe(bytes);
    expect(result.document).toBe(document);
  });

  test("changes only an element's content source range", () => {
    const source = `<root><!--before--><known>old &amp; value</known><x:unknown xmlns:x="urn:x" keep='yes'/><!--after--></root>`;
    const document = parseLosslessXml(encoder.encode(source));
    const known = document.elements("", "known")[0]!;
    const result = beginLosslessXmlEdit(document).setText(known, `new <value> & data`).commit();
    const expected = `<root><!--before--><known>new &lt;value> &amp; data</known><x:unknown xmlns:x="urn:x" keep='yes'/><!--after--></root>`;
    expect(new TextDecoder().decode(result.bytes)).toBe(expected);
    expect(result.document.textContent(result.document.elements("", "known")[0]!)).toBe(
      `new <value> & data`,
    );
    expect(expected.slice(expected.indexOf("<x:unknown"))).toBe(
      source.slice(source.indexOf("<x:unknown")),
    );
  });

  test("turns a self-closing element into a text element", () => {
    const document = parseLosslessXml(encoder.encode(`<root><empty a="1" /></root>`));
    const empty = document.elements("", "empty")[0]!;
    const result = beginLosslessXmlEdit(document).setText(empty, "now populated").commit();
    expect(new TextDecoder().decode(result.bytes)).toBe(
      `<root><empty a="1" >now populated</empty></root>`,
    );
  });

  test("sets, inserts, and removes attributes without reordering neighbors", () => {
    const document = parseLosslessXml(encoder.encode(`<root first='1' change = "old" last='3'/>`));
    const [first, change] = document.root.attributes;
    const result = beginLosslessXmlEdit(document)
      .removeAttribute(first!)
      .setAttribute(change!, `new "quoted" & value`)
      .insertAttribute(document.root, "added", "yes")
      .commit();
    expect(new TextDecoder().decode(result.bytes)).toBe(
      `<root  change = "new &quot;quoted&quot; &amp; value" last='3' added="yes"/>`,
    );
  });

  test("appends and removes elements while preserving unknown siblings", () => {
    const document = parseLosslessXml(encoder.encode(`<root><unknown keep="yes"/><remove>gone</remove></root>`));
    const remove = document.elements("", "remove")[0]!;
    const result = beginLosslessXmlEdit(document)
      .removeElement(remove)
      .appendElement(document.root, "added", `new & safe`, [{ qualifiedName: "kind", value: "test" }])
      .commit();
    expect(new TextDecoder().decode(result.bytes)).toBe(
      `<root><unknown keep="yes"/><added kind="test">new &amp; safe</added></root>`,
    );
  });

  test("keeps the staging order of multiple insertions at one boundary", () => {
    const document = parseLosslessXml(encoder.encode(`<root></root>`));
    const result = beginLosslessXmlEdit(document)
      .appendElement(document.root, "first", "1")
      .appendElement(document.root, "second", "2")
      .commit();
    expect(new TextDecoder().decode(result.bytes)).toBe(
      `<root><first>1</first><second>2</second></root>`,
    );
  });

  for (const encoding of ["utf-8", "utf-16le", "utf-16be"] as const) {
    test(`retains ${encoding} and its BOM during edits`, () => {
      const declared = encoding.toUpperCase();
      const bytes = encodeXmlSource(
        `<?xml version="1.0" encoding="${declared}"?><root><value>old</value></root>`,
        encoding,
        true,
      );
      const document = parseLosslessXml(bytes);
      const result = beginLosslessXmlEdit(document)
        .setText(document.elements("", "value")[0]!, "é𝄞")
        .commit();
      expect(result.document.encoding).toBe(encoding);
      expect(result.document.hasByteOrderMark).toBeTrue();
      expect(result.document.textContent(result.document.elements("", "value")[0]!)).toBe("é𝄞");
    });
  }

  test("detects overlapping edits atomically", () => {
    const bytes = encoder.encode(`<root><parent><child>text</child></parent></root>`);
    const document = parseLosslessXml(bytes);
    const parent = document.elements("", "parent")[0]!;
    const child = document.elements("", "child")[0]!;
    const editor = beginLosslessXmlEdit(document).setText(parent, "replacement").removeElement(child);
    expect(() => editor.commit()).toThrow(XmlEditError);
    expect(editor.status).toBe("active");
    expect(document.originalBytes()).toBe(bytes);
  });

  test("failed reparsing leaves the editor active", () => {
    const document = parseLosslessXml(encoder.encode(`<root/>`));
    const editor = beginLosslessXmlEdit(document).insertAttribute(document.root, "missing:prefix", "x");
    expect(() => editor.commit()).toThrow();
    expect(editor.status).toBe("active");
  });

  test("rejects foreign nodes and edits after rollback", () => {
    const first = parseLosslessXml(encoder.encode(`<root/>`));
    const second = parseLosslessXml(encoder.encode(`<root/>`));
    const editor = beginLosslessXmlEdit(first);
    expect(() => editor.setText(second.root, "no")).toThrow(XmlEditError);
    editor.rollback();
    expect(() => editor.setText(first.root, "no")).toThrow(XmlEditError);
  });
});
