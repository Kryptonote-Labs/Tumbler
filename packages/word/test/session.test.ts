import { describe, expect, spyOn, test } from "bun:test";
import { openWordEditingSession, wordParagraphText, type WordParagraph } from "../src/index.ts";
import { buildWordDocumentFixture } from "./document-fixture.ts";

const word = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

describe("Word editing sessions", () => {
  test("isolates listener failures after commit", () => {
    const session = openWordEditingSession(fixture(`<w:p><w:r><w:t>A</w:t></w:r></w:p>`));
    const received: number[] = [];
    session.subscribe(() => { throw new Error("subscriber failed"); });
    session.subscribe(change => received.push(change.revision));
    const paragraph = session.artifact.document.blocks[0] as WordParagraph;
    expect(() => session.replaceText(selection(paragraph.elementId, 1), "B")).not.toThrow();
    expect(received).toEqual([1]);
    expect(text(session)).toBe("AB");
    expect(session.canUndo).toBe(true);
    expect(session.dirty).toBe(true);
  });

  test("delivers reentrant undo after the edit to every subscriber", () => {
    const session = openWordEditingSession(fixture(`<w:p><w:r><w:t>A</w:t></w:r></w:p>`));
    const received: string[] = [];
    session.subscribe(change => { if (change.reason === "edit") session.undo(); });
    session.subscribe(change => {
      const paragraph = change.artifact.document.blocks[0] as WordParagraph;
      received.push(`${change.reason}:${change.revision}:${wordParagraphText(change.artifact.document, paragraph)}:${change.dirty}`);
    });
    const paragraph = session.artifact.document.blocks[0] as WordParagraph;
    session.replaceText(selection(paragraph.elementId, 1), "B");
    expect(received).toEqual(["edit:1:AB:true", "undo:2:A:false"]);
    expect(text(session)).toBe("A");
    expect(session.revision).toBe(2);
    expect(session.canRedo).toBe(true);
  });

  test("reports listener errors and isolates a throwing reporter", () => {
    const reported: unknown[] = [];
    const log = spyOn(console, "error").mockImplementation(() => {});
    const failure = new Error("listener");
    const reporterFailure = new Error("reporter");
    try {
      const session = openWordEditingSession(fixture(`<w:p><w:r><w:t>A</w:t></w:r></w:p>`), {
        onListenerError(error, change) {
          reported.push(error, change.revision);
          if (change.reason === "edit") session.markSaved();
          throw reporterFailure;
        },
      });
      const received: string[] = [];
      session.subscribe(() => { throw failure; });
      session.subscribe(change => received.push(`${change.reason}:${change.revision}:${change.dirty}`));
      const paragraph = session.artifact.document.blocks[0] as WordParagraph;
      expect(() => session.replaceText(selection(paragraph.elementId, 1), "B")).not.toThrow();
      expect(reported).toEqual([failure, 1, failure, 2]);
      expect(received).toEqual(["edit:1:true", "save:2:false"]);
      expect(log).toHaveBeenCalledTimes(4);
      expect(log).toHaveBeenCalledWith("Word session listener failed", failure);
      expect(log).toHaveBeenCalledWith("Word session listener failed", reporterFailure);
      expect(session.dirty).toBe(false);
      session.undo();
      expect(session.dirty).toBe(true);
      session.redo();
      expect(session.dirty).toBe(false);
    } finally { log.mockRestore(); }
  });

  test("snapshots subscriptions at commit time and queues reentrant edits and saves", () => {
    const session = openWordEditingSession(fixture(`<w:p><w:r><w:t>A</w:t></w:r></w:p>`));
    const paragraph = session.artifact.document.blocks[0] as WordParagraph;
    const received: string[] = [];
    const late = (change: { revision: number }) => { received.push(`late:${change.revision}`); };
    session.subscribe(change => {
      received.push(`first:${change.revision}`);
      if (change.revision !== 1) return;
      session.markSaved(); // Already queued events retain their subscribers.
      unsubscribe();
      session.subscribe(late);
      session.subscribe(late); // Set semantics deduplicate the same callback.
      session.replaceText(selection(paragraph.elementId, 2), "C");
    });
    const unsubscribe = session.subscribe(change => { received.push(`second:${change.revision}`); });
    session.replaceText(selection(paragraph.elementId, 1), "B");
    expect(received).toEqual(["first:1", "second:1", "first:2", "second:2", "first:3", "late:3"]);
    expect(text(session)).toBe("ABC");
    expect(session.dirty).toBe(true);
    unsubscribe();
    session.undo();
    expect(text(session)).toBe("AB");
    expect(session.dirty).toBe(false);
  });

  test("drains long reentrant history chains without recursive dispatch", () => {
    const session = openWordEditingSession(fixture(`<w:p><w:r><w:t>A</w:t></w:r></w:p>`));
    const revisions: number[] = [];
    session.subscribe(change => {
      if (change.revision >= 10_000) return;
      if (change.reason === "undo") session.redo();
      else session.undo();
    });
    session.subscribe(change => revisions.push(change.revision));
    const paragraph = session.artifact.document.blocks[0] as WordParagraph;
    session.replaceText(selection(paragraph.elementId, 1), "B");
    expect(revisions).toEqual(Array.from({ length: 10_000 }, (_, index) => index + 1));
    expect(text(session)).toBe("A");
    expect(session.canRedo).toBe(true);
  });

  test("queues external revisions and leaves rejected edits and no-ops silent", () => {
    const session = openWordEditingSession(fixture(`<w:p><w:r><w:t>A</w:t></w:r></w:p>`));
    const external = fixture(`<w:p><w:r><w:t>External</w:t></w:r></w:p>`);
    const received: string[] = [];
    session.subscribe(change => {
      if (change.reason === "edit") session.replaceExternalRevision(external);
    });
    session.subscribe(change => received.push(`${change.reason}:${change.revision}:${change.dirty}`));
    session.undo();
    session.redo();
    session.markSaved();
    expect(() => session.replaceText(selection(-1, 0), "bad")).toThrow();
    expect(received).toEqual([]);
    const paragraph = session.artifact.document.blocks[0] as WordParagraph;
    session.replaceText(selection(paragraph.elementId, 1), "B");
    expect(received).toEqual(["edit:1:true", "external-revision:2:false"]);
    expect(text(session)).toBe("External");
    expect(session.canUndo).toBe(false);
    expect(session.canRedo).toBe(false);
    session.replaceExternalRevision(external);
    expect(session.revision).toBe(2);
  });

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

  test("commits multiline typing text and its formatting as one history operation", () => {
    const session = openWordEditingSession(fixture(`<w:p/>`));
    const paragraph = session.artifact.document.blocks[0] as WordParagraph;
    session.replaceText(selection(paragraph.elementId, 0), "A\nB", { text: { italic: { set: true } } });
    const paragraphs = session.artifact.document.blocks.filter((block) => block.kind === "paragraph");
    expect(paragraphs.map((p) => wordParagraphText(session.artifact.document, p))).toEqual(["A", "B"]);
    expect(session.artifact.formattingState({
      anchor: { paragraphElementId: paragraphs[0]!.elementId, offset: 0 },
      focus: { paragraphElementId: paragraphs[1]!.elementId, offset: 1 },
    }).text.italic).toEqual({ state: "value", value: true });
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
