import { describe, expect, test } from "bun:test";
import { openWordEditingSession, wordParagraphText, type WordParagraph } from "../src/index.ts";
import { buildWordDocumentFixture } from "./document-fixture.ts";

const word = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

describe("Word editing sessions", () => {
  test("commits one operation per revision and traverses history", () => {
    const session = openWordEditingSession(fixture(`<w:p><w:r><w:t>Hello</w:t></w:r></w:p>`), { limit: 3 });
    const changes: string[] = [];
    session.subscribe((change) => changes.push(`${change.reason}:${change.revision}:${change.dirty}`));
    const paragraph = session.artifact.document.blocks[0] as WordParagraph;

    session.replaceText(selection(paragraph.elementId, 5), "!");
    expect(text(session)).toBe("Hello!");
    expect(session.canUndo).toBe(true);
    expect(session.dirty).toBe(true);

    session.undo();
    expect(text(session)).toBe("Hello");
    expect(session.dirty).toBe(false);
    session.redo();
    expect(text(session)).toBe("Hello!");
    session.markSaved();
    expect(session.dirty).toBe(false);
    expect(changes).toEqual(["edit:1:true", "undo:2:false", "redo:3:true", "save:4:false"]);
  });

  test("discards redo branches and resets history for external revisions", () => {
    const session = openWordEditingSession(fixture(`<w:p><w:r><w:t>A</w:t></w:r></w:p>`));
    const paragraph = session.artifact.document.blocks[0] as WordParagraph;
    session.replaceText(selection(paragraph.elementId, 1), "B");
    session.undo();
    session.replaceText(selection(paragraph.elementId, 1), "C");
    expect(session.canRedo).toBe(false);
    expect(text(session)).toBe("AC");

    session.replaceExternalRevision(fixture(`<w:p><w:r><w:t>Agent</w:t></w:r></w:p>`));
    expect(text(session)).toBe("Agent");
    expect(session.canUndo).toBe(false);
    expect(session.dirty).toBe(false);
  });

  test("commits typing text and its formatting as one history operation", () => {
    const session = openWordEditingSession(fixture(`<w:p/>`));
    const paragraph = session.artifact.document.blocks[0] as WordParagraph;
    session.replaceText(selection(paragraph.elementId, 0), "A", { text: { italic: { set: true } } });
    expect(text(session)).toBe("A");
    expect(session.canUndo).toBe(true);

    session.undo();
    expect(text(session)).toBe("");
    expect(session.canUndo).toBe(false);
  });
});

function selection(paragraphElementId: number, offset: number) {
  return { anchor: { paragraphElementId, offset }, focus: { paragraphElementId, offset } } as const;
}

function fixture(body: string): Uint8Array {
  return buildWordDocumentFixture({ documentXml: `<w:document xmlns:w="${word}"><w:body>${body}</w:body></w:document>` });
}

function text(session: ReturnType<typeof openWordEditingSession>): string {
  const paragraph = session.artifact.document.blocks[0] as WordParagraph;
  return wordParagraphText(session.artifact.document, paragraph);
}
