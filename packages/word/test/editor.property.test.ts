import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { openWordArtifact, wordParagraphText, type WordParagraph } from "../src/index.ts";
import { buildWordDocumentFixture } from "./document-fixture.ts";

const word = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const text = fc.array(fc.constantFrom("a", "Z", "0", " ", "&", "<", "é", "東", "🙂"), { maxLength: 24 })
  .map((characters) => characters.join(""));

describe("generated WordprocessingML edit histories", () => {
  test("matches a plain-text oracle across repeated logical edits", () => {
    fc.assert(fc.property(
      text,
      fc.array(fc.record({ start: fc.nat(), end: fc.nat(), value: text }), { minLength: 1, maxLength: 25 }),
      (initial, commands) => {
        let expected = initial;
        let artifact = open([initial]);
        for (const command of commands) {
          const paragraph = paragraphs(artifact)[0]!;
          const boundaries = scalarBoundaries(expected);
          const left = boundaries[command.start % boundaries.length]!;
          const right = boundaries[command.end % boundaries.length]!;
          const start = Math.min(left, right);
          const end = Math.max(left, right);
          artifact = artifact.replaceText(selection(paragraph.elementId, start, end), command.value);
          expected = expected.slice(0, start) + command.value + expected.slice(end);
          expect(wordParagraphText(artifact.document, paragraphs(artifact)[0]!)).toBe(expected);
        }
      },
    ), { numRuns: 150 });
  }, 30_000);

  test("matches paragraph-splice semantics in either selection direction", () => {
    fc.assert(fc.property(
      fc.array(text, { minLength: 1, maxLength: 8 }),
      text.map((value) => value.replaceAll("\n", "")),
      fc.boolean(),
      (values, replacement, reverse) => {
        const artifact = open(values);
        const source = paragraphs(artifact);
        const first = source[0]!;
        const last = source.at(-1)!;
        const forward = {
          anchor: { paragraphElementId: first.elementId, offset: 0 },
          focus: { paragraphElementId: last.elementId, offset: wordParagraphText(artifact.document, last).length },
        } as const;
        const edited = artifact.replaceText(reverse ? { anchor: forward.focus, focus: forward.anchor } : forward, replacement);
        expect(paragraphs(edited).map((paragraph) => wordParagraphText(edited.document, paragraph))).toEqual([replacement]);
      },
    ), { numRuns: 100 });
  }, 30_000);
});

function open(values: readonly string[]) {
  const body = values.map((value) => `<w:p><w:r><w:t xml:space="preserve">${escape(value)}</w:t></w:r></w:p>`).join("");
  return openWordArtifact(buildWordDocumentFixture({ documentXml: `<w:document xmlns:w="${word}"><w:body>${body}</w:body></w:document>` }));
}

function paragraphs(artifact: ReturnType<typeof openWordArtifact>): WordParagraph[] {
  return artifact.document.blocks.filter((block): block is WordParagraph => block.kind === "paragraph");
}

function selection(paragraphElementId: number, anchor: number, focus: number) {
  return { anchor: { paragraphElementId, offset: anchor }, focus: { paragraphElementId, offset: focus } } as const;
}

function scalarBoundaries(value: string): number[] {
  const result = [0];
  let offset = 0;
  for (const scalar of value) {
    offset += scalar.length;
    result.push(offset);
  }
  return result;
}

function escape(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll("]]>", "]]&gt;");
}
