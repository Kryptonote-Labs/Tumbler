import { describe, expect, test } from "bun:test";
import { openOpcPackage } from "@tumblerjs/opc";
import {
  layoutWordDocument,
  openWordDocument,
  WordError,
  type ComputedWordTextFormat,
  type WordTextMeasurer,
} from "../src/index.ts";
import { buildWordDocumentFixture } from "./document-fixture.ts";

const word = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const measurer: WordTextMeasurer = {
  measure(text: string, format: ComputedWordTextFormat) {
    return { width: [...text].length * format.fontSizePoints / 2, ascent: format.fontSizePoints * 0.8, descent: format.fontSizePoints * 0.2 };
  },
};

describe("WordprocessingML page layout", () => {
  test("wraps logical text across arbitrarily split runs with stable source offsets", () => {
    const document = open(`<w:p><w:r><w:t>Hello </w:t></w:r><w:r><w:t>world and </w:t></w:r><w:r><w:t>friends</w:t></w:r></w:p>`, section({ width: 2_400, height: 3_000, margin: 200 }));
    const layout = layoutWordDocument(document, measurer);
    const lines = layout.pages[0]!.columns[0]!.lines;

    expect(lines.length).toBe(2);
    expect(lines.map((line) => line.fragments.map((fragment) => fragment.text).join(""))).toEqual(["Hello world and", "friends"]);
    expect(lines[0]!.startOffset).toBe(0);
    expect(lines.at(-1)!.endOffset).toBe("Hello world and friends".length);
    expect(layout.fragmentCount).toBe(3);
  });

  test("honours page, column, and section breaks with explicit page geometry", () => {
    const body = `
      <w:p><w:r><w:t>First</w:t><w:br w:type="column"/><w:t>Second</w:t><w:br w:type="page"/><w:t>Third</w:t></w:r></w:p>
      <w:p><w:pPr><w:sectPr><w:type w:val="nextPage"/><w:pgSz w:w="4000" w:h="5000"/><w:pgMar w:top="200" w:right="200" w:bottom="200" w:left="200"/><w:cols w:num="2" w:space="200"/></w:sectPr></w:pPr><w:r><w:t>End first section</w:t></w:r></w:p>
      <w:p><w:r><w:t>Next section</w:t></w:r></w:p>`;
    const document = open(body, section({ width: 6_000, height: 7_000, margin: 300 }));
    const layout = layoutWordDocument(document, measurer);

    expect(layout.pages.length).toBeGreaterThanOrEqual(3);
    expect(layout.pages[0]!.columns).toHaveLength(2);
    expect(layout.pages[0]!.columns[0]!.lines[0]!.fragments[0]!.text).toBe("First");
    expect(layout.pages[0]!.columns[1]!.lines[0]!.fragments[0]!.text).toBe("Second");
    expect(layout.pages.some((page) => page.columns.some((column) => column.lines.some((line) =>
      line.fragments.some((fragment) => fragment.text === "Next section")
    )))).toBe(true);
    expect(layout.pages.at(-1)).toMatchObject({ width: 300, height: 350 });
  });

  test("places tab content at authored and default tab stops", () => {
    const document = open(`<w:p><w:pPr><w:tabs><w:tab w:val="left" w:pos="1440"/></w:tabs></w:pPr><w:r><w:t>A</w:t><w:tab/><w:t>B</w:t><w:tab/><w:t>C</w:t></w:r></w:p>`, section({ width: 6_000, height: 5_000, margin: 200 }));
    const fragments = layoutWordDocument(document, measurer).pages[0]!.columns[0]!.lines[0]!.fragments;
    expect(fragments.map((fragment) => fragment.kind)).toEqual(["text", "tab", "text", "tab", "text"]);
    expect(fragments[1]!.x + fragments[1]!.width).toBeCloseTo(82, 5);
    expect(fragments[3]!.width).toBeGreaterThan(0);
  });

  test("keeps field instructions and deleted revision text out of the visible result", () => {
    const document = open(`<w:p>
      <w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> DATE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>August 9</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>
      <w:del><w:r><w:delText>old</w:delText></w:r></w:del><w:ins><w:r><w:t> new</w:t></w:r></w:ins>
    </w:p>`, section({ width: 6_000, height: 5_000, margin: 200 }));
    const text = layoutWordDocument(document, measurer).pages[0]!.columns[0]!.lines.flatMap((line) => line.fragments).map((fragment) => fragment.text).join("");
    expect(text).toBe("August 9 new");
  });

  test("bounds pages, fragments, and invalid measurements", () => {
    const document = open(`<w:p><w:r><w:t>hello world</w:t></w:r></w:p>`, section({ width: 1_000, height: 700, margin: 200 }));
    expect(() => layoutWordDocument(document, measurer, { maxFragments: 1 })).toThrow(WordError);
    expect(() => layoutWordDocument(document, { measure: () => ({ width: Number.NaN, ascent: 1, descent: 1 }) })).toThrow(TypeError);
  });
});

function open(body: string, finalSection: string) {
  return openWordDocument(openOpcPackage(buildWordDocumentFixture({
    documentXml: `<w:document xmlns:w="${word}"><w:body>${body}${finalSection}</w:body></w:document>`,
  })));
}

function section(input: { width: number; height: number; margin: number }): string {
  return `<w:sectPr><w:pgSz w:w="${input.width}" w:h="${input.height}"/><w:pgMar w:top="${input.margin}" w:right="${input.margin}" w:bottom="${input.margin}" w:left="${input.margin}"/></w:sectPr>`;
}
