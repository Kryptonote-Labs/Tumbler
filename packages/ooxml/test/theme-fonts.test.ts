import { describe, expect, test } from "bun:test";
import { OOXML_NAMESPACES, OoxmlThemeError, parseThemeFontScheme } from "../src/index.ts";

const encoder = new TextEncoder();

describe("DrawingML theme fonts", () => {
  test.each(["strict", "transitional"] as const)("reads %s major and minor typefaces", (conformance) => {
    const scheme = parseThemeFontScheme(encoder.encode(theme(OOXML_NAMESPACES[conformance].drawing)));
    expect(scheme.name).toBe("Office");
    expect(scheme.typeface("major")).toBe("Aptos Display");
    expect(scheme.typeface("minor", "latin")).toBe("Aptos");
    expect(scheme.typeface("minor", "eastAsian")).toBeUndefined();
  });

  test.each([
    `<theme/>`,
    theme(OOXML_NAMESPACES.transitional.drawing).replace("<a:minorFont>", "<a:majorFont>"),
    theme(OOXML_NAMESPACES.transitional.drawing).replace('<a:latin typeface="Aptos"/>', "<a:latin/>"),
  ])("rejects malformed theme font schemes", (source) => {
    expect(() => parseThemeFontScheme(encoder.encode(source))).toThrow(OoxmlThemeError);
  });
});

function theme(namespace: string): string {
  return `<a:theme xmlns:a="${namespace}"><a:themeElements><a:clrScheme name="Office"/><a:fontScheme name="Office"><a:majorFont><a:latin typeface="Aptos Display"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"/></a:themeElements></a:theme>`;
}
