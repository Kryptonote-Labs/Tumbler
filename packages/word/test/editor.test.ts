import { describe, expect, test } from "bun:test";
import { openWordArtifact, wordParagraphText, WordError } from "../src/index.ts";
import { buildWordDocumentFixture } from "./document-fixture.ts";

const word = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

describe("WordprocessingML logical text editing", () => {
  test("replaces text across producer-split runs without damaging structural markers", () => {
    const artifact = open(`<w:p><w:bookmarkStart w:id="1" w:name="mark"/><w:r><w:rPr><w:b/></w:rPr><w:t>Hello </w:t></w:r><w:bookmarkEnd w:id="1"/><w:r><w:t>world</w:t></w:r></w:p>`);
    const paragraph = firstParagraph(artifact);
    const edited = artifact.replaceText(selection(paragraph.elementId, 3, 7), "p, W");
    const reopened = firstParagraph(edited);

    expect(wordParagraphText(edited.document, reopened)).toBe("Help, World");
    expect(edited.document.source.elements(word, "bookmarkStart")).toHaveLength(1);
    expect(edited.document.source.elements(word, "bookmarkEnd")).toHaveLength(1);
    expect(edited.document.source.elements(word, "rPr")).toHaveLength(1);
  });

  test("deletes atomic tabs and breaks while retaining adjacent text", () => {
    const artifact = open(`<w:p><w:r><w:t>A</w:t><w:tab/><w:t>B</w:t><w:br/><w:t>C</w:t></w:r></w:p>`);
    const paragraph = firstParagraph(artifact);
    const edited = artifact.replaceText(selection(paragraph.elementId, 1, 4), "-");
    const reopened = firstParagraph(edited);

    expect(wordParagraphText(edited.document, reopened)).toBe("A-C");
    expect(edited.document.source.elements(word, "tab")).toHaveLength(0);
    expect(edited.document.source.elements(word, "br")).toHaveLength(0);
  });

  test("inserts into empty and self-closing paragraphs with preserved whitespace", () => {
    const artifact = open(`<w:p/>`);
    const paragraph = firstParagraph(artifact);
    const edited = artifact.replaceText(selection(paragraph.elementId, 0, 0), " hello ");
    const reopened = firstParagraph(edited);

    expect(wordParagraphText(edited.document, reopened)).toBe(" hello ");
    const text = edited.document.source.elements(word, "t")[0]!;
    expect(text.attributes.find((attribute) => attribute.localName === "space")?.value).toBe("preserve");
  });

  test("returns the original artefact for semantic no-ops", () => {
    const artifact = open(`<w:p><w:r><w:t>Hello</w:t></w:r></w:p>`);
    const paragraph = firstParagraph(artifact);
    expect(artifact.replaceText(selection(paragraph.elementId, 0, 5), "Hello")).toBe(artifact);
    expect(artifact.replaceText(selection(paragraph.elementId, 2, 2), "")).toBe(artifact);
  });

  test("splits a paragraph and preserves its paragraph properties", () => {
    const artifact = open(`<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Hello world</w:t></w:r></w:p>`);
    const paragraph = firstParagraph(artifact);
    const edited = artifact.replaceText(selection(paragraph.elementId, 5, 6), "\n");
    const paragraphs = edited.document.blocks.filter((block) => block.kind === "paragraph");
    expect(paragraphs.map((item) => wordParagraphText(edited.document, item))).toEqual(["Hello", "world"]);
    expect(edited.document.source.elements(word, "jc")).toHaveLength(2);
    expect(edited.document.source.elements(word, "b")).toHaveLength(2);
  });

  test("joins paragraphs while preserving the trailing run formatting", () => {
    const artifact = open(`<w:p><w:r><w:t>One</w:t></w:r></w:p><w:p><w:r><w:rPr><w:i/></w:rPr><w:t>Two</w:t></w:r></w:p>`);
    const [first, second] = artifact.document.blocks;
    if (first?.kind !== "paragraph" || second?.kind !== "paragraph") throw new Error("Expected paragraphs.");
    const edited = artifact.replaceText({ anchor: { paragraphElementId: first.elementId, offset: 3 }, focus: { paragraphElementId: second.elementId, offset: 0 } }, "");
    const paragraph = firstParagraph(edited);
    expect(wordParagraphText(edited.document, paragraph)).toBe("OneTwo");
    expect(edited.document.source.elements(word, "p")).toHaveLength(1);
    expect(edited.document.source.elements(word, "i")).toHaveLength(1);
  });

  test("replaces several paragraphs with several paragraphs", () => {
    const artifact = open(`<w:p><w:r><w:t>Alpha</w:t></w:r></w:p><w:p><w:r><w:t>Middle</w:t></w:r></w:p><w:p><w:r><w:t>Omega</w:t></w:r></w:p>`);
    const [first, , third] = artifact.document.blocks;
    if (first?.kind !== "paragraph" || third?.kind !== "paragraph") throw new Error("Expected paragraphs.");
    const edited = artifact.replaceText({ anchor: { paragraphElementId: first.elementId, offset: 2 }, focus: { paragraphElementId: third.elementId, offset: 3 } }, "1\n2\n3");
    const text = edited.document.blocks.filter((block) => block.kind === "paragraph").map((paragraph) => wordParagraphText(edited.document, paragraph));
    expect(text).toEqual(["Al1", "2", "3ga"]);
  });

  test("rejects container-crossing and grapheme-splitting edits", () => {
    const artifact = open(`<w:p><w:r><w:t>👩‍💻</w:t></w:r></w:p><w:p/>`);
    const [first, second] = artifact.document.blocks;
    if (first?.kind !== "paragraph" || second?.kind !== "paragraph") throw new Error("Expected paragraphs.");
    expect(() => artifact.replaceText(selection(first.elementId, 0, 0), "a\rb")).toThrow(WordError);
    expect(() => artifact.replaceText(selection(first.elementId, 1, 1), "x")).toThrow(RangeError);
  });

  test("blocks structural edits through fields and bookmarks", () => {
    const field = open(`<w:p><w:r><w:fldChar w:fldCharType="begin"/><w:instrText> DATE </w:instrText><w:fldChar w:fldCharType="separate"/><w:t>Today</w:t><w:fldChar w:fldCharType="end"/></w:r></w:p>`);
    expect(() => field.replaceText(selection(firstParagraph(field).elementId, 2, 2), "\n")).toThrow("fields, links, revisions");
    const bookmark = open(`<w:p><w:bookmarkStart w:id="1" w:name="mark"/><w:r><w:t>Text</w:t></w:r><w:bookmarkEnd w:id="1"/></w:p>`);
    expect(() => bookmark.replaceText(selection(firstParagraph(bookmark).elementId, 2, 2), "\n")).toThrow("structural markers");
  });
});

function open(body: string) {
  return openWordArtifact(buildWordDocumentFixture({
    documentXml: `<w:document xmlns:w="${word}"><w:body>${body}</w:body></w:document>`,
  }));
}

function firstParagraph(artifact: ReturnType<typeof openWordArtifact>) {
  const paragraph = artifact.document.blocks[0];
  if (paragraph?.kind !== "paragraph") throw new Error("Expected paragraph.");
  return paragraph;
}

function selection(paragraphElementId: number, anchor: number, focus: number) {
  return { anchor: { paragraphElementId, offset: anchor }, focus: { paragraphElementId, offset: focus } } as const;
}
