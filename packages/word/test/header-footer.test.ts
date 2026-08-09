import { describe, expect, test } from "bun:test";
import { layoutWordDocument, openWordArtifact } from "../src/index.ts";
import { buildWordDocumentFixture } from "./document-fixture.ts";

const word = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const rels = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const contentType = (kind: "header" | "footer") => `application/vnd.openxmlformats-officedocument.wordprocessingml.${kind}+xml`;

describe("WordprocessingML headers and footers", () => {
  test("resolves first, even, and default page stories through relationships", () => {
    const body = `<w:p><w:r><w:t>One</w:t><w:br w:type="page"/></w:r></w:p><w:p><w:r><w:t>Two</w:t><w:br w:type="page"/></w:r></w:p><w:p><w:r><w:t>Three</w:t></w:r></w:p><w:sectPr><w:titlePg/><w:headerReference w:type="first" r:id="first"/><w:headerReference w:type="even" r:id="even"/><w:headerReference w:type="default" r:id="default"/><w:footerReference w:type="default" r:id="footer"/></w:sectPr>`;
    const artifact = openWordArtifact(buildWordDocumentFixture({
      documentXml: `<w:document xmlns:w="${word}" xmlns:r="${rels}"><w:body>${body}</w:body></w:document>`,
      relationships: [
        { id: "first", type: `${rels}/header`, target: "header-first.xml" },
        { id: "even", type: `${rels}/header`, target: "header-even.xml" },
        { id: "default", type: `${rels}/header`, target: "header-default.xml" },
        { id: "footer", type: `${rels}/footer`, target: "footer.xml" },
      ],
      parts: [
        story("word/header-first.xml", "header", "First"),
        story("word/header-even.xml", "header", "Even"),
        story("word/header-default.xml", "header", "Default"),
        story("word/footer.xml", "footer", "Footer"),
      ],
    }));
    expect(artifact.document.headerFooters).toHaveLength(4);
    const layout = layoutWordDocument(artifact.document, { measure: (text) => ({ width: text.length * 5, ascent: 8, descent: 2 }) });
    expect(layout.pages).toHaveLength(3);
    expect(layout.pages.map((page) => page.headerLines[0]?.fragments[0]?.text)).toEqual(["First", "Even", "Default"]);
    expect(layout.pages.map((page) => page.footerLines[0]?.fragments[0]?.text)).toEqual(["Footer", "Footer", "Footer"]);
    expect(layout.pages[0]?.headerLines[0]?.y).toBeLessThan(layout.pages[0]?.columns[0]?.y ?? 0);
    expect(layout.pages[0]?.footerLines[0]?.y).toBeGreaterThan(layout.pages[0]?.columns[0]?.y ?? 0);
  });

  test("rejects external story references", () => {
    expect(() => openWordArtifact(buildWordDocumentFixture({
      documentXml: `<w:document xmlns:w="${word}" xmlns:r="${rels}"><w:body><w:sectPr><w:headerReference r:id="bad"/></w:sectPr></w:body></w:document>`,
      relationships: [{ id: "bad", type: `${rels}/header`, target: "https://example.test/header", targetMode: "External" }],
    }))).toThrow("internal header relationship");
  });
});

function story(itemName: string, kind: "header" | "footer", text: string) {
  const root = kind === "header" ? "hdr" : "ftr";
  return { itemName, contentType: contentType(kind), xml: `<w:${root} xmlns:w="${word}"><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:${root}>` };
}
