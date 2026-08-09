import { describe, expect, test } from "bun:test";
import { openOpcPackage } from "@tumblerjs/opc";
import { openWordDocument, WordError } from "../src/index.ts";
import { buildWordDocumentFixture } from "./document-fixture.ts";

const profiles = {
  strict: {
    word: "http://purl.oclc.org/ooxml/wordprocessingml/main",
    relationships: "http://purl.oclc.org/ooxml/officeDocument/relationships",
  },
  transitional: {
    word: "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    relationships: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
  },
} as const;

describe("WordprocessingML document model", () => {
  for (const conformance of ["strict", "transitional"] as const) {
    test(`discovers and models a ${conformance} document without changing bytes`, () => {
      const profile = profiles[conformance];
      const bytes = buildWordDocumentFixture({
        conformance,
        documentItemName: "documents/main.xml",
        relationships: [{
          id: "link",
          type: `${profile.relationships}/hyperlink`,
          target: "https://example.com/path?hello=world",
          targetMode: "External",
        }],
        documentXml: `<w:document xmlns:w="${profile.word}" xmlns:r="${profile.relationships}"><w:body>
          <w:p><w:pPr><w:sectPr><w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/><w:pgMar w:top="720" w:right="900" w:bottom="-10" w:left="900"/><w:cols w:num="2" w:space="360"/></w:sectPr></w:pPr>
            <w:bookmarkStart w:id="1" w:name="Start"/>
            <w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve"> Hello </w:t><w:tab/><w:br w:type="page"/></w:r>
            <w:hyperlink r:id="link"><w:r><w:t>world</w:t></w:r></w:hyperlink>
            <w:ins><w:r><w:t>!</w:t></w:r></w:ins><w:bookmarkEnd w:id="1"/>
          </w:p>
          <w:tbl><w:tr><w:tc><w:p><w:r><w:t>Cell</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
          <w:customXml/>
          <w:sectPr><w:pgMar w:header="600" w:footer="640" w:gutter="120"/></w:sectPr>
        </w:body></w:document>`,
      });
      const document = openWordDocument(openOpcPackage(bytes));

      expect(document.conformance).toBe(conformance);
      expect(document.part.name.value).toBe("/documents/main.xml");
      expect(document.bytes()).toEqual(bytes);
      expect(document.blocks.map((block) => block.kind)).toEqual(["paragraph", "table", "unsupported"]);
      const paragraph = document.blocks[0];
      expect(paragraph?.kind).toBe("paragraph");
      if (paragraph?.kind !== "paragraph") throw new Error("Expected paragraph.");
      expect(paragraph.section).toMatchObject({
        pageWidthTwips: 15_840,
        pageHeightTwips: 12_240,
        orientation: "landscape",
        marginTopTwips: 720,
        marginBottomTwips: -10,
        columnCount: 2,
        columnSpaceTwips: 360,
      });
      expect(paragraph.inlines.map((inline) => inline.kind)).toEqual([
        "bookmark-start", "run", "hyperlink", "insertion", "bookmark-end",
      ]);
      const run = paragraph.inlines[1];
      expect(run?.kind).toBe("run");
      if (run?.kind !== "run") throw new Error("Expected run.");
      expect(run.contents).toEqual([
        expect.objectContaining({ kind: "text", value: " Hello ", preserveSpace: true }),
        expect.objectContaining({ kind: "tab" }),
        expect.objectContaining({ kind: "break", breakType: "page" }),
      ]);
      const hyperlink = paragraph.inlines[2];
      expect(hyperlink?.kind).toBe("hyperlink");
      if (hyperlink?.kind !== "hyperlink") throw new Error("Expected hyperlink.");
      expect(hyperlink.target).toBe("https://example.com/path?hello=world");
      expect(document.finalSection).toMatchObject({
        pageWidthTwips: 12_240,
        pageHeightTwips: 15_840,
        headerDistanceTwips: 600,
        footerDistanceTwips: 640,
        gutterTwips: 120,
      });
    });
  }

  test("bounds semantic model work independently of XML parsing", () => {
    const word = profiles.transitional.word;
    const bytes = buildWordDocumentFixture({
      documentXml: `<w:document xmlns:w="${word}"><w:body><w:p><w:r><w:t>hello</w:t></w:r></w:p><w:p/></w:body></w:document>`,
    });
    const pkg = openOpcPackage(bytes);
    expect(() => openWordDocument(pkg, { maxBlocks: 1 })).toThrow(WordError);
    expect(() => openWordDocument(pkg, { maxInlineItems: 1 })).toThrow(WordError);
    expect(() => openWordDocument(pkg, { maxTextCharacters: 4 })).toThrow(WordError);
  });

  test("rejects repeated required containers and invalid section values", () => {
    const word = profiles.transitional.word;
    const repeatedBody = buildWordDocumentFixture({
      documentXml: `<w:document xmlns:w="${word}"><w:body/><w:body/></w:document>`,
    });
    expect(() => openWordDocument(openOpcPackage(repeatedBody))).toThrow(WordError);

    const invalidSection = buildWordDocumentFixture({
      documentXml: `<w:document xmlns:w="${word}"><w:body><w:sectPr><w:cols w:num="46"/></w:sectPr></w:body></w:document>`,
    });
    expect(() => openWordDocument(openOpcPackage(invalidSection))).toThrow(WordError);
  });
});
