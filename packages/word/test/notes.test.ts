import { describe, expect, test } from "bun:test";
import { layoutWordDocument, openWordArtifact, wordParagraphText } from "../src/index.ts";
import { buildWordDocumentFixture } from "./document-fixture.ts";

const word = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const rels = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

describe("WordprocessingML notes", () => {
  test("keeps footnotes and endnotes in separate stories and lays them out at their references", () => {
    const artifact = openWordArtifact(buildWordDocumentFixture({
      documentXml: `<w:document xmlns:w="${word}"><w:body><w:p><w:r><w:t>Page one</w:t><w:footnoteReference w:id="2"/><w:br w:type="page"/></w:r></w:p><w:p><w:r><w:t>Page two</w:t><w:footnoteReference w:id="3"/><w:endnoteReference w:id="4"/></w:r></w:p></w:body></w:document>`,
      relationships: [
        { id: "footnotes", type: `${rels}/footnotes`, target: "footnotes.xml" },
        { id: "endnotes", type: `${rels}/endnotes`, target: "endnotes.xml" },
      ],
      parts: [
        { itemName: "word/footnotes.xml", contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml", xml: `<w:footnotes xmlns:w="${word}"><w:footnote w:id="-1" w:type="separator"><w:p><w:r><w:separator/></w:r></w:p></w:footnote><w:footnote w:id="2"><w:p><w:r><w:footnoteRef/><w:t>First note</w:t></w:r></w:p></w:footnote><w:footnote w:id="3"><w:p><w:r><w:footnoteRef/><w:t>Second note</w:t></w:r></w:p></w:footnote></w:footnotes>` },
        { itemName: "word/endnotes.xml", contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.endnotes+xml", xml: `<w:endnotes xmlns:w="${word}"><w:endnote w:id="4"><w:p><w:r><w:endnoteRef/><w:t>Final note</w:t></w:r></w:p></w:endnote></w:endnotes>` },
      ],
    }));
    expect(artifact.document.notes).toHaveLength(4);
    expect(artifact.document.notes.find((note) => note.id === -1)?.type).toBe("separator");
    const firstBody = artifact.document.blocks[0];
    if (firstBody?.kind !== "paragraph") throw new Error("Expected paragraph.");
    expect(wordParagraphText(artifact.document, firstBody)).toBe("Page one\uFFFC\n");

    const layout = layoutWordDocument(artifact.document, { measure: (text) => ({ width: text.length * 5, ascent: 8, descent: 2 }) });
    expect(layout.pages).toHaveLength(2);
    expect(layout.pages[0]?.noteLines.flatMap((line) => line.fragments.map((fragment) => fragment.text))).toContain("First note");
    expect(layout.pages[1]?.noteLines.flatMap((line) => line.fragments.map((fragment) => fragment.text))).toEqual(expect.arrayContaining(["Second note", "Final note"]));
    expect(layout.pages[0]?.noteLines[0]?.marker?.text).toBe("2");
    expect(layout.pages[1]?.noteSeparatorY).toBeDefined();
  });

  test("rejects note references without signed integer ids", () => {
    expect(() => openWordArtifact(buildWordDocumentFixture({ documentXml: `<w:document xmlns:w="${word}"><w:body><w:p><w:r><w:footnoteReference w:id="bad"/></w:r></w:p></w:body></w:document>` }))).toThrow("signed integer id");
  });
});
