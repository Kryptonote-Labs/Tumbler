import { describe, expect, test } from "bun:test";
import { openWordArtifact } from "@tumblerjs/word";
import { sameWordTextSelection, wordInputEdit, wordDocumentParagraphs } from "../src/word-editing.ts";
import { buildWordDocumentFixture } from "../../word/test/document-fixture.ts";

const word = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

describe("Word browser input translation", () => {

  test("deduplicates browser selection updates without comparing caret affinity", () => {
    expect(sameWordTextSelection(
      { anchor: { paragraphElementId: 1, offset: 2 }, focus: { paragraphElementId: 1, offset: 4 } },
      { anchor: { paragraphElementId: 1, offset: 2, affinity: "before" }, focus: { paragraphElementId: 1, offset: 4, affinity: "after" } },
    )).toBe(true);
    expect(sameWordTextSelection(
      { anchor: { paragraphElementId: 1, offset: 2 }, focus: { paragraphElementId: 1, offset: 4 } },
      { anchor: { paragraphElementId: 1, offset: 2 }, focus: { paragraphElementId: 1, offset: 5 } },
    )).toBe(false);
  });

  test("inserts literal text at a logical selection", () => {
    const document = fixture("<w:p><w:r><w:t>Hello</w:t></w:r></w:p>");
    const paragraph = wordDocumentParagraphs(document)[0]!;
    const result = wordInputEdit(document, selection(paragraph.elementId, 2, 4), "insertText", "y");
    expect(result).toEqual({
      selection: selection(paragraph.elementId, 2, 4),
      value: "y",
      caret: { paragraphElementId: paragraph.elementId, offset: 3 },
    });
  });

  test("deletes whole grapheme clusters", () => {
    const document = fixture("<w:p><w:r><w:t>A👩‍💻B</w:t></w:r></w:p>");
    const paragraph = wordDocumentParagraphs(document)[0]!;
    const result = wordInputEdit(document, selection(paragraph.elementId, 6, 6), "deleteContentBackward", null);
    expect(result?.selection.anchor.offset).toBe(1);
    expect(result?.selection.focus.offset).toBe(6);
  });

  test("normalizes platform clipboard line endings before a native Word edit", () => {
    const document = fixture("<w:p><w:r><w:t>Hello</w:t></w:r></w:p>");
    const paragraph = wordDocumentParagraphs(document)[0]!;
    expect(wordInputEdit(document, selection(paragraph.elementId, 0, 0), "insertFromPaste", "one\r\ntwo\rthree")?.value).toBe("one\ntwo\nthree");
  });

  test("word deletion removes a word and cut produces a controlled edit", () => {
    const document = fixture("<w:p><w:r><w:t>Hello world</w:t></w:r></w:p>");
    const paragraph = wordDocumentParagraphs(document)[0]!;
    const backward = wordInputEdit(document, selection(paragraph.elementId, 11, 11), "deleteWordBackward", null);
    expect(backward?.selection).toEqual(selection(paragraph.elementId, 6, 11));
    const forward = wordInputEdit(document, selection(paragraph.elementId, 6, 6), "deleteWordForward", null);
    expect(forward?.selection).toEqual(selection(paragraph.elementId, 6, 11));
    const cut = wordInputEdit(document, selection(paragraph.elementId, 0, 5), "deleteByCut", null);
    expect(cut?.value).toBe("");
    expect(cut?.selection).toEqual(selection(paragraph.elementId, 0, 5));
    expect(wordInputEdit(document, selection(paragraph.elementId, 0, 0), "deleteByCut", null)).toBeUndefined();
  });

  test("word deletion works without Intl.Segmenter", () => {
    const descriptor = Object.getOwnPropertyDescriptor(Intl, "Segmenter")!;
    try {
      Object.defineProperty(Intl, "Segmenter", { value: undefined, configurable: true });
      const document = fixture("<w:p><w:r><w:t>Hello world</w:t></w:r></w:p>");
      const paragraph = wordDocumentParagraphs(document)[0]!;
      expect(wordInputEdit(document, selection(paragraph.elementId, 11, 11), "deleteWordBackward", null)?.selection).toEqual(selection(paragraph.elementId, 6, 11));
    } finally {
      Object.defineProperty(Intl, "Segmenter", descriptor);
    }
  });

  test("turns boundary deletion into a cross-paragraph join", () => {
    const document = fixture("<w:p><w:r><w:t>One</w:t></w:r></w:p><w:p><w:r><w:t>Two</w:t></w:r></w:p>");
    const [first, second] = wordDocumentParagraphs(document);
    const result = wordInputEdit(document, selection(second!.elementId, 0, 0), "deleteContentBackward", null);
    expect(result?.selection).toEqual({
      anchor: { paragraphElementId: first!.elementId, offset: 3 },
      focus: { paragraphElementId: second!.elementId, offset: 0 },
    });
  });
});

function fixture(body: string) {
  return openWordArtifact(buildWordDocumentFixture({
    documentXml: `<w:document xmlns:w="${word}"><w:body>${body}</w:body></w:document>`,
  })).document;
}

function selection(paragraphElementId: number, anchor: number, focus: number) {
  return { anchor: { paragraphElementId, offset: anchor }, focus: { paragraphElementId, offset: focus } } as const;
}
