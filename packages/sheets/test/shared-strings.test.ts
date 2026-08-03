import { describe, expect, test } from "bun:test";
import { openOpcPackage } from "@tumblerjs/opc";
import { openSpreadsheet, readSharedStrings, SpreadsheetError } from "../src/index.ts";
import { buildWorkbookFixture } from "./workbook-fixture.ts";

describe("SpreadsheetML shared strings", () => {
  test.each(["strict", "transitional"] as const)("reads simple and rich %s strings without phonetic hints", (conformance) => {
    const namespace = conformance === "strict"
      ? "http://purl.oclc.org/ooxml/spreadsheetml/main"
      : "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
    const workbook = openSpreadsheet(openOpcPackage(buildWorkbookFixture({
      conformance,
      sharedStringsXml: `<sst xmlns="${namespace}" count="4" uniqueCount="3">
        <si><t xml:space="preserve"> plain </t></si>
        <si><r><rPr><b/></rPr><t>Rich</t></r><r><t> text</t></r></si>
        <si><t>東京</t><rPh sb="0" eb="2"><t>とうきょう</t></rPh></si>
      </sst>`,
    })));
    const strings = readSharedStrings(workbook)!;
    expect(strings.values).toEqual([" plain ", "Rich text", "東京"]);
    expect(strings.get(1)).toBe("Rich text");
    expect(strings.get(-1)).toBeUndefined();
  });

  test("returns undefined when the workbook has no Shared String Table", () => {
    const workbook = openSpreadsheet(openOpcPackage(buildWorkbookFixture()));
    expect(readSharedStrings(workbook)).toBeUndefined();
  });

  test.each([
    `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" uniqueCount="2"><si><t>one</t></si></sst>`,
    `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="wat"><si><t>one</t></si></sst>`,
  ])("rejects inconsistent table metadata", (sharedStringsXml) => {
    const workbook = openSpreadsheet(openOpcPackage(buildWorkbookFixture({ sharedStringsXml })));
    expect(() => readSharedStrings(workbook)).toThrow(SpreadsheetError);
  });
});
