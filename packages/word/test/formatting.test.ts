import { describe, expect, test } from "bun:test";
import { openWordArtifact, wordParagraphText, type WordParagraph } from "../src/index.ts";
import { buildWordDocumentFixture } from "./document-fixture.ts";

const word = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

describe("WordprocessingML direct formatting", () => {
  test("formats only the selected substring while retaining unknown run properties", () => {
    const artifact = open(`<w:p><w:r><w:rPr><w:lang w:val="en-GB"/></w:rPr><w:t>Hello world</w:t></w:r></w:p>`);
    const paragraph = first(artifact);
    const edited = artifact.applyFormatting(selection(paragraph.elementId, 6, 11), {
      text: { bold: { set: true }, fontFamily: { set: "Aptos" }, fontSize: { set: 14 }, color: { set: { type: "rgb", value: "#123abc" } } },
    });
    const reopened = first(edited);
    expect(wordParagraphText(edited.document, reopened)).toBe("Hello world");
    expect(reopened.inlines.filter((inline) => inline.kind === "run")).toHaveLength(2);
    const runs = reopened.inlines.filter((inline) => inline.kind === "run");
    expect(edited.document.styles.runFormat(edited.document, reopened, runs[0]!).bold).toBe(false);
    expect(edited.document.styles.runFormat(edited.document, reopened, runs[1]!).bold).toBe(true);
    expect(edited.document.styles.runFormat(edited.document, reopened, runs[1]!).fontFamily).toBe("Aptos");
    expect(edited.document.styles.runFormat(edited.document, reopened, runs[1]!).fontSizePoints).toBe(14);
    expect(edited.document.styles.runFormat(edited.document, reopened, runs[1]!).color).toBe("#123ABC");
    expect(edited.document.source.elements(word, "lang")).toHaveLength(2);
  });

  test("reports mixed and inherited state and removes direct properties", () => {
    const artifact = open(`<w:p><w:r><w:t>A</w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>B</w:t></w:r></w:p>`);
    const paragraph = first(artifact);
    expect(artifact.formattingState(selection(paragraph.elementId, 0, 2)).text.bold.state).toBe("mixed");
    const edited = artifact.applyFormatting(selection(paragraph.elementId, 1, 2), { text: { bold: { inherit: true } } });
    expect(edited.formattingState(selection(first(edited).elementId, 0, 2)).text.bold).toEqual({ state: "inherited", value: false });
  });

  test("sets and inherits paragraph alignment without disturbing paragraph style", () => {
    const artifact = open(`<w:p><w:pPr><w:pStyle w:val="Body"/></w:pPr><w:r><w:t>Text</w:t></w:r></w:p>`);
    const paragraph = first(artifact);
    const centered = artifact.applyFormatting(selection(paragraph.elementId, 0, 4), { block: { horizontalAlignment: { set: "center" } } });
    const centeredParagraph = first(centered);
    expect(centered.document.styles.paragraphFormat(centered.document, centeredParagraph).alignment).toBe("center");
    expect(centered.document.source.elements(word, "pStyle")).toHaveLength(1);
    const inherited = centered.applyFormatting(selection(centeredParagraph.elementId, 0, 4), { block: { horizontalAlignment: { inherit: true } } });
    expect(inherited.document.styles.paragraphFormat(inherited.document, first(inherited)).alignment).toBe("start");
  });

  test("handles self-closing properties and empty formatting patches", () => {
    const artifact = open(`<w:p><w:pPr/><w:r><w:rPr w:rsidRPr="1"/><w:t>Text</w:t></w:r></w:p>`);
    const paragraph = first(artifact);
    expect(artifact.applyFormatting(selection(paragraph.elementId, 0, 4), { text: {} })).toBe(artifact);
    const edited = artifact.applyFormatting(selection(paragraph.elementId, 0, 4), {
      text: { italic: { set: true } },
      block: { horizontalAlignment: { set: "end" } },
    });
    expect(edited.document.source.elements(word, "rPr")[0]?.attributes.some((attribute) => attribute.localName === "rsidRPr")).toBe(true);
    expect(edited.document.styles.paragraphFormat(edited.document, first(edited)).alignment).toBe("end");
  });

  test("formats a selection spanning paragraphs and reports mixed block state", () => {
    const artifact = open(`<w:p><w:pPr><w:jc w:val="left"/></w:pPr><w:r><w:t>First</w:t></w:r></w:p><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:t>Second</w:t></w:r></w:p>`);
    const [firstParagraph, secondParagraph] = artifact.document.blocks;
    if (firstParagraph?.kind !== "paragraph" || secondParagraph?.kind !== "paragraph") throw new Error("Expected paragraphs.");
    const target = { anchor: { paragraphElementId: firstParagraph.elementId, offset: 2 }, focus: { paragraphElementId: secondParagraph.elementId, offset: 3 } } as const;
    expect(artifact.formattingState(target).block.horizontalAlignment.state).toBe("mixed");
    const edited = artifact.applyFormatting(target, { text: { italic: { set: true } }, block: { horizontalAlignment: { set: "center" } } });
    const paragraphs = edited.document.blocks.filter((block) => block.kind === "paragraph");
    expect(paragraphs.map((paragraph) => edited.document.styles.paragraphFormat(edited.document, paragraph).alignment)).toEqual(["center", "center"]);
    expect(edited.document.source.elements(word, "i")).toHaveLength(2);
    expect(wordParagraphText(edited.document, paragraphs[0]!)).toBe("First");
    expect(wordParagraphText(edited.document, paragraphs[1]!)).toBe("Second");
  });
});

function open(body: string) {
  return openWordArtifact(buildWordDocumentFixture({ documentXml: `<w:document xmlns:w="${word}"><w:body>${body}</w:body></w:document>` }));
}

function first(artifact: ReturnType<typeof openWordArtifact>): WordParagraph {
  const paragraph = artifact.document.blocks[0];
  if (paragraph?.kind !== "paragraph") throw new Error("Expected paragraph.");
  return paragraph;
}

function selection(paragraphElementId: number, anchor: number, focus: number) {
  return { anchor: { paragraphElementId, offset: anchor }, focus: { paragraphElementId, offset: focus } } as const;
}
