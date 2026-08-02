import { describe, expect, test } from "bun:test";
import {
  OOXML_NAMESPACES,
  OoxmlThemeError,
  parseThemeColorScheme,
  THEME_COLOR_SLOTS,
} from "../src/index.ts";

const encoder = new TextEncoder();

describe("DrawingML theme colors", () => {
  test.each(["strict", "transitional"] as const)("reads %s sRGB and system fallbacks", (conformance) => {
    const namespace = OOXML_NAMESPACES[conformance].drawing;
    const scheme = parseThemeColorScheme(encoder.encode(theme(namespace)));

    expect(scheme.name).toBe("Office");
    expect(scheme.color("lt1")).toBe("FFFFFF");
    expect(scheme.color("dk1")).toBe("000000");
    expect(scheme.color("accent1")).toBe("4F81BD");
    expect(scheme.color("folHlink")).toBe("800080");
  });

  test("retains an unsupported color expression as unresolved", () => {
    const namespace = OOXML_NAMESPACES.transitional.drawing;
    const source = theme(namespace).replace(
      '<a:srgbClr val="4F81BD"/>',
      '<a:schemeClr val="accent1"/>',
    );
    expect(parseThemeColorScheme(encoder.encode(source)).color("accent1")).toBeUndefined();
  });

  test.each([
    `<theme/>`,
    theme(OOXML_NAMESPACES.transitional.drawing).replace("<a:accent6>", "<a:accent5>"),
    theme(OOXML_NAMESPACES.transitional.drawing).replace('val="4F81BD"', 'val="nope"'),
  ])("rejects malformed theme color schemes", (source) => {
    expect(() => parseThemeColorScheme(encoder.encode(source))).toThrow(OoxmlThemeError);
  });
});

function theme(namespace: string): string {
  const values: Record<(typeof THEME_COLOR_SLOTS)[number], string> = {
    lt1: '<a:sysClr val="window" lastClr="FFFFFF"/>',
    dk1: '<a:sysClr val="windowText" lastClr="000000"/>',
    lt2: '<a:srgbClr val="EEECE1"/>',
    dk2: '<a:srgbClr val="1F497D"/>',
    accent1: '<a:srgbClr val="4F81BD"/>',
    accent2: '<a:srgbClr val="C0504D"/>',
    accent3: '<a:srgbClr val="9BBB59"/>',
    accent4: '<a:srgbClr val="8064A2"/>',
    accent5: '<a:srgbClr val="4BACC6"/>',
    accent6: '<a:srgbClr val="F79646"/>',
    hlink: '<a:srgbClr val="0000FF"/>',
    folHlink: '<a:srgbClr val="800080"/>',
  };
  return `<a:theme xmlns:a="${namespace}" name="Office"><a:themeElements><a:clrScheme name="Office">${THEME_COLOR_SLOTS.map((slot) => `<a:${slot}>${values[slot]}</a:${slot}>`).join("")}</a:clrScheme><a:fontScheme name="Office"/><a:fmtScheme name="Office"/></a:themeElements></a:theme>`;
}
