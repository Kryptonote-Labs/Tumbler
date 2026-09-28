import { describe, expect, test } from "bun:test";
import { openWordArtifact, wordParagraphText } from "../src/index.ts";
import { buildWordDocumentFixture } from "./document-fixture.ts";

describe("WordprocessingML artefact host boundary", () => {
  test("opens and replaces immutable document revisions", () => {
    const firstBytes = buildWordDocumentFixture();
    const secondBytes = buildWordDocumentFixture({ documentXml: `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Updated</w:t></w:r></w:p></w:body></w:document>` });
    const first = openWordArtifact(firstBytes);
    expect(first.bytes()).toEqual(firstBytes);
    expect(first.replace(firstBytes)).toBe(first);
    const second = first.replace(secondBytes);
    expect(second).not.toBe(first);
    expect(second.document.blocks[0]?.kind).toBe("paragraph");
    expect(second.bytes()).toEqual(secondBytes);
  });
});


for (const value of ["One\nTwo", "\nOne\n\nTwo\n", "\n"]) {
  test(`typing formatting applies only to inserted text in ${JSON.stringify(value)}`, () => {
    const original = openWordArtifact(buildWordDocumentFixture({
      documentXml: `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/></w:rPr><w:t>BeforeAfter</w:t></w:r></w:p></w:body></w:document>`,
    }));
    const paragraph = original.document.blocks.find((block) => block.kind === "paragraph")!;
    const position = { paragraphElementId: paragraph.elementId, offset: 6 };
    const edited = original.replaceText({ anchor: position, focus: position }, value, {
      text: { fontFamily: { set: "Arial" }, bold: { set: true } },
    });
    const reopened = openWordArtifact(edited.bytes());
    const paragraphs = reopened.document.blocks.filter((block) => block.kind === "paragraph");
    expect(paragraphs.map((p) => wordParagraphText(reopened.document, p)).join("\n")).toBe(`Before${value}After`);
    for (const [index, p] of paragraphs.entries()) {
      const text = wordParagraphText(reopened.document, p);
      for (let offset = 0; offset < text.length; offset++) {
        const surrounding = index === 0 && offset < 6 || index === paragraphs.length - 1 && offset >= text.length - 5;
        const state = reopened.formattingState({
          anchor: { paragraphElementId: p.elementId, offset },
          focus: { paragraphElementId: p.elementId, offset: offset + 1 },
        });
        expect(state.text.fontFamily).toEqual({ state: "value", value: surrounding ? "Georgia" : "Arial" });
        expect("value" in state.text.bold && state.text.bold.value).toBe(!surrounding);
      }
    }
  });
}

for (const reversed of [false, true]) {
  test(`typing formatting survives ${reversed ? "backward" : "forward"} paragraph replacement`, () => {
    const original = openWordArtifact(buildWordDocumentFixture({
      documentXml: `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Before old</w:t></w:r></w:p><w:p><w:r><w:t>old After</w:t></w:r></w:p></w:body></w:document>`,
    }));
    const paragraphs = original.document.blocks.filter((block) => block.kind === "paragraph");
    const start = { paragraphElementId: paragraphs[0]!.elementId, offset: 7 };
    const end = { paragraphElementId: paragraphs[1]!.elementId, offset: 3 };
    const edited = original.replaceText(reversed ? { anchor: end, focus: start } : { anchor: start, focus: end }, "New\nText", {
      text: { fontFamily: { set: "Arial" } },
    });
    const reopened = openWordArtifact(edited.bytes());
    const updated = reopened.document.blocks.filter((block) => block.kind === "paragraph");
    expect(updated.map((p) => wordParagraphText(reopened.document, p))).toEqual(["Before New", "Text After"]);
    expect(reopened.formattingState({
      anchor: { paragraphElementId: updated[0]!.elementId, offset: 7 },
      focus: { paragraphElementId: updated[1]!.elementId, offset: 4 },
    }).text.fontFamily).toEqual({ state: "value", value: "Arial" });
  });
}
