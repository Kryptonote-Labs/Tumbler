import { describe, expect, test } from "bun:test";
import { openOpcPackage } from "@tumblerjs/opc";
import { openWordDocument, WordError } from "../src/index.ts";
import { buildWordDocumentFixture } from "./document-fixture.ts";

const word = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const relationships = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const drawing = "http://schemas.openxmlformats.org/drawingml/2006/main";

describe("WordprocessingML style cascade", () => {
  test("keeps specified styles separate while resolving defaults, basedOn, character styles, theme values, and direct formatting", () => {
    const document = openWordDocument(openOpcPackage(buildWordDocumentFixture({
      relationships: [
        { id: "styles", type: `${relationships}/styles`, target: "styles.xml" },
        { id: "theme", type: `${relationships}/theme`, target: "theme/theme1.xml" },
      ],
      parts: [
        {
          itemName: "word/styles.xml",
          contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml",
          xml: `<w:styles xmlns:w="${word}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:asciiTheme="minorHAnsi"/><w:sz w:val="20"/><w:color w:val="222222"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
            <w:style w:type="paragraph" w:styleId="Normal" w:default="1"><w:name w:val="Normal"/><w:pPr><w:widowControl/><w:jc w:val="left"/></w:pPr></w:style>
            <w:style w:type="paragraph" w:styleId="Heading"><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="240"/></w:pPr><w:rPr><w:b/><w:color w:themeColor="accent1"/></w:rPr></w:style>
            <w:style w:type="character" w:styleId="DefaultChar" w:default="1"><w:rPr><w:i/></w:rPr></w:style>
            <w:style w:type="character" w:styleId="Emphasis"><w:basedOn w:val="DefaultChar"/><w:rPr><w:u w:val="double"/></w:rPr></w:style>
          </w:styles>`,
        },
        {
          itemName: "word/theme/theme1.xml",
          contentType: "application/vnd.openxmlformats-officedocument.theme+xml",
          xml: theme(),
        },
      ],
      documentXml: `<w:document xmlns:w="${word}"><w:body><w:p><w:pPr><w:pStyle w:val="Heading"/><w:jc w:val="right"/><w:ind w:start="120" w:firstLine="240"/><w:tabs><w:tab w:val="decimal" w:pos="1440" w:leader="dot"/></w:tabs></w:pPr><w:r><w:rPr><w:rStyle w:val="Emphasis"/><w:sz w:val="28"/><w:b w:val="0"/></w:rPr><w:t>Hello</w:t></w:r></w:p></w:body></w:document>`,
    })));
    const paragraph = document.blocks[0];
    if (paragraph?.kind !== "paragraph") throw new Error("Expected paragraph.");
    const run = paragraph.inlines[0];
    if (run?.kind !== "run") throw new Error("Expected run.");

    expect(document.styles.style("Heading")?.run).toEqual({ bold: true, color: { type: "theme", slot: "accent1" } });
    expect(document.styles.paragraphFormat(document, paragraph)).toEqual({
      styleId: "Heading",
      alignment: "end",
      spacingBeforeTwips: 240,
      spacingAfterTwips: 120,
      lineSpacing: { rule: "auto", value: 240 },
      indentStartTwips: 120,
      indentEndTwips: 0,
      firstLineTwips: 240,
      hangingTwips: 0,
      keepNext: true,
      keepLines: false,
      pageBreakBefore: false,
      widowControl: true,
      contextualSpacing: false,
      rightToLeft: false,
      tabs: [{ positionTwips: 1440, alignment: "decimal", leader: "dot" }],
    });
    expect(document.styles.runFormat(document, paragraph, run)).toEqual({
      fontFamily: "Aptos",
      fontSizePoints: 14,
      bold: false,
      italic: true,
      underline: "double",
      strike: false,
      color: "#4472C4",
      highlight: undefined,
      verticalAlign: "baseline",
      rightToLeft: false,
    });
  });

  test("rejects duplicate ids and basedOn cycles when the cycle is resolved", () => {
    const duplicate = fixtureWithStyles(`<w:style w:type="paragraph" w:styleId="A"/><w:style w:type="paragraph" w:styleId="A"/>`);
    expect(() => openWordDocument(openOpcPackage(duplicate))).toThrow(WordError);

    const cyclic = openWordDocument(openOpcPackage(fixtureWithStyles(`<w:style w:type="paragraph" w:styleId="A"><w:basedOn w:val="B"/></w:style><w:style w:type="paragraph" w:styleId="B"><w:basedOn w:val="A"/></w:style>`, "A")));
    const paragraph = cyclic.blocks[0];
    if (paragraph?.kind !== "paragraph") throw new Error("Expected paragraph.");
    expect(() => cyclic.styles.paragraphFormat(cyclic, paragraph)).toThrow(WordError);
  });
});

function fixtureWithStyles(styles: string, styleId?: string): Uint8Array {
  return buildWordDocumentFixture({
    relationships: [{ id: "styles", type: `${relationships}/styles`, target: "styles.xml" }],
    parts: [{
      itemName: "word/styles.xml",
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml",
      xml: `<w:styles xmlns:w="${word}">${styles}</w:styles>`,
    }],
    documentXml: `<w:document xmlns:w="${word}"><w:body><w:p>${styleId === undefined ? "" : `<w:pPr><w:pStyle w:val="${styleId}"/></w:pPr>`}</w:p></w:body></w:document>`,
  });
}

function theme(): string {
  const slots = ["dk1", "lt1", "dk2", "lt2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink"];
  return `<a:theme xmlns:a="${drawing}" name="Test"><a:themeElements><a:clrScheme name="Test">${slots.map((slot, index) => `<a:${slot}><a:srgbClr val="${slot === "accent1" ? "4472C4" : index % 2 === 0 ? "000000" : "FFFFFF"}"/></a:${slot}>`).join("")}</a:clrScheme><a:fontScheme name="Test"><a:majorFont><a:latin typeface="Cambria"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Test"/></a:themeElements></a:theme>`;
}
