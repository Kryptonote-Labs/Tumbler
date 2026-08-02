import { describe, expect, test } from "bun:test";
import {
  createMarkupCompatibilityView,
  identifyOoxmlNamespace,
  MarkupCompatibilityError,
  OOXML_NAMESPACES,
  parseLosslessXml,
} from "../src/index.ts";

const encoder = new TextEncoder();
const mc = OOXML_NAMESPACES.markupCompatibility;

describe("OOXML namespace profiles", () => {
  for (const conformance of ["strict", "transitional"] as const) {
    for (const vocabulary of [
      "wordprocessing",
      "spreadsheet",
      "presentation",
      "drawing",
    ] as const) {
      test(`identifies ${conformance} ${vocabulary}`, () => {
        expect(identifyOoxmlNamespace(OOXML_NAMESPACES[conformance][vocabulary])).toEqual({
          conformance,
          vocabulary,
        });
      });
    }
  }
  test("leaves vendor namespaces unidentified", () => {
    expect(identifyOoxmlNamespace("https://vendor.test/extension")).toBeUndefined();
  });
});

describe("markup compatibility view", () => {
  test("selects the first understood Choice without changing source", () => {
    const bytes = encoder.encode(`<root xmlns:mc="${mc}" xmlns:new="urn:new" xmlns:old="urn:old">
      <mc:AlternateContent>
        <mc:Choice Requires="new"><new:value>modern</new:value></mc:Choice>
        <mc:Choice Requires="old"><old:value>legacy</old:value></mc:Choice>
        <mc:Fallback><fallback>safe</fallback></mc:Fallback>
      </mc:AlternateContent>
    </root>`);
    const document = parseLosslessXml(bytes);
    const view = createMarkupCompatibilityView(document, {
      understoodNamespaces: new Set(["urn:new"]),
    });
    view.validate();
    expect(view.children(document.root).map((element) => element.namespaceUri)).toEqual(["urn:new"]);
    expect(document.originalBytes()).toBe(bytes);
  });

  test("uses Fallback when no Choice is understood", () => {
    const document = parse(`<root xmlns:mc="${mc}" xmlns:new="urn:new">
      <mc:AlternateContent>
        <mc:Choice Requires="new"><new:value/></mc:Choice>
        <mc:Fallback><fallback/></mc:Fallback>
      </mc:AlternateContent>
    </root>`);
    const view = createMarkupCompatibilityView(document, { understoodNamespaces: new Set() });
    expect(view.children(document.root).map((element) => element.localName)).toEqual(["fallback"]);
  });

  test("drops ignorable children and unwraps ProcessContent children", () => {
    const document = parse(`<root xmlns:mc="${mc}" xmlns:x="urn:x"
      mc:Ignorable="x" mc:ProcessContent="x:wrapper">
      <x:dropped><inside/></x:dropped>
      <x:wrapper><kept/></x:wrapper>
      <ordinary/>
    </root>`);
    const view = createMarkupCompatibilityView(document, { understoodNamespaces: new Set([""]) });
    expect(view.children(document.root).map((element) => element.localName)).toEqual([
      "kept",
      "ordinary",
    ]);
  });

  test("rejects unsupported MustUnderstand namespaces", () => {
    const document = parse(`<root xmlns:mc="${mc}" xmlns:x="urn:x" mc:MustUnderstand="x"/>`);
    const view = createMarkupCompatibilityView(document, { understoodNamespaces: new Set() });
    expect(() => view.validate()).toThrow(MarkupCompatibilityError);
  });

  test.each([
    `<root xmlns:mc="${mc}"><mc:AlternateContent><mc:Fallback/></mc:AlternateContent></root>`,
    `<root xmlns:mc="${mc}" xmlns:x="urn:x"><mc:AlternateContent><mc:Choice Requires="x"/><mc:Fallback/><mc:Choice Requires="x"/></mc:AlternateContent></root>`,
    `<root xmlns:mc="${mc}"><mc:AlternateContent><mc:Choice/></mc:AlternateContent></root>`,
  ])("rejects malformed AlternateContent", (source) => {
    const document = parse(source);
    const view = createMarkupCompatibilityView(document, { understoodNamespaces: new Set() });
    expect(() => view.validate()).toThrow(MarkupCompatibilityError);
  });
});

function parse(source: string) {
  return parseLosslessXml(encoder.encode(source));
}
