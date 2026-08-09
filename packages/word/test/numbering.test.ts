import { describe, expect, test } from "bun:test";
import { layoutWordDocument, openWordArtifact } from "../src/index.ts";
import { buildWordDocumentFixture } from "./document-fixture.ts";

const word = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const relationships = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

describe("WordprocessingML numbering", () => {
  test("resolves instances, levels, overrides, patterns, and list layout markers", () => {
    const paragraphs = [
      paragraph(0, "First"),
      paragraph(1, "Nested"),
      paragraph(0, "Second"),
    ].join("");
    const artifact = openWordArtifact(buildWordDocumentFixture({
      documentXml: `<w:document xmlns:w="${word}"><w:body>${paragraphs}</w:body></w:document>`,
      relationships: [{ id: "numbering", type: `${relationships}/numbering`, target: "numbering.xml" }],
      parts: [{
        itemName: "word/numbering.xml",
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml",
        xml: `<w:numbering xmlns:w="${word}"><w:abstractNum w:abstractNumId="2"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="upperRoman"/><w:lvlText w:val="%1."/><w:suff w:val="space"/><w:pPr><w:ind w:start="720" w:hanging="360"/></w:pPr></w:lvl><w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="lowerLetter"/><w:lvlText w:val="%1.%2)"/></w:lvl></w:abstractNum><w:num w:numId="5"><w:abstractNumId w:val="2"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="3"/></w:lvlOverride></w:num></w:numbering>`,
      }],
    }));
    const markers = artifact.document.numbering.markers(artifact.document);
    expect([...markers.values()].map((marker) => marker.text)).toEqual(["III.", "III.a)", "IV."]);
    const layout = layoutWordDocument(artifact.document, { measure: (text, format) => ({ width: text.length * format.fontSizePoints / 2, ascent: 8, descent: 2 }) });
    expect(layout.pages[0]?.columns[0]?.lines.map((line) => line.marker?.text)).toEqual(["III. ", "III.a)\t", "IV. "]);
    expect(layout.pages[0]?.columns[0]?.lines[0]?.x).toBeGreaterThan(layout.pages[0]?.columns[0]?.x ?? 0);
  });

  test("rejects duplicate definitions", () => {
    expect(() => openWordArtifact(buildWordDocumentFixture({
      documentXml: `<w:document xmlns:w="${word}"><w:body><w:p/></w:body></w:document>`,
      relationships: [{ id: "numbering", type: `${relationships}/numbering`, target: "numbering.xml" }],
      parts: [{ itemName: "word/numbering.xml", contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml", xml: `<w:numbering xmlns:w="${word}"><w:abstractNum w:abstractNumId="1"/><w:abstractNum w:abstractNumId="1"/></w:numbering>` }],
    }))).toThrow("duplicated");
  });
});

function paragraph(level: number, text: string): string {
  return `<w:p><w:pPr><w:numPr><w:ilvl w:val="${level}"/><w:numId w:val="5"/></w:numPr></w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;
}
