import { Encodings, FontNames } from "@pdf-lib/standard-fonts";
export const winAnsi = new Map<number, { unicode: string; glyph: string }>();
const glyphUnicode = new Map<string, string>();
for (const point of Encodings.WinAnsi.supportedCodePoints) {
  const encoded = Encodings.WinAnsi.encodeUnicodeCodePoint(point);
  winAnsi.set(encoded.code, { unicode: String.fromCodePoint(point), glyph: encoded.name });
  glyphUnicode.set(encoded.name, String.fromCodePoint(point));
}
for (const [glyph, unicode] of Object.entries({
  fi: "fi",
  fl: "fl",
  ff: "ff",
  ffi: "ffi",
  ffl: "ffl",
  Omega: "Ω",
  Delta: "Δ",
  minus: "−",
  fraction: "⁄",
  dotlessi: "ı",
  Lslash: "Ł",
  lslash: "ł",
  ".notdef": "",
}))
  glyphUnicode.set(glyph, unicode);

export function glyphText(glyph: string): string {
  const base = glyph.split(".")[0]!;
  if (glyphUnicode.has(base)) return glyphUnicode.get(base)!;
  if (base.includes("_")) return base.split("_").map(glyphText).join("");
  if (/^uni(?:[\da-f]{4})+$/i.test(base))
    return String.fromCharCode(
      ...(base.slice(3).match(/.{4}/g) ?? []).map((hex) => parseInt(hex, 16)),
    );
  if (/^u[\da-f]{4,6}$/i.test(base)) {
    const point = parseInt(base.slice(1), 16);
    if (point <= 0x10ffff) return String.fromCodePoint(point);
  }
  if (base.length === 1) return base;
  return "\ufffd";
}
export function standardName(base: string) {
  const stripped = base.replace(/^[A-Z]{6}\+/, "").replaceAll(",", "-");
  const exact = Object.values(FontNames).find((value) => value === stripped);
  if (exact) return exact;
  const bold = /bold/i.test(stripped),
    italic = /italic|oblique/i.test(stripped);
  if (/Arial|Helvetica/i.test(stripped))
    return bold
      ? italic
        ? FontNames.HelveticaBoldOblique
        : FontNames.HelveticaBold
      : italic
        ? FontNames.HelveticaOblique
        : FontNames.Helvetica;
  if (/Times/i.test(stripped))
    return bold
      ? italic
        ? FontNames.TimesRomanBoldItalic
        : FontNames.TimesRomanBold
      : italic
        ? FontNames.TimesRomanItalic
        : FontNames.TimesRoman;
  if (/Courier/i.test(stripped))
    return bold
      ? italic
        ? FontNames.CourierBoldOblique
        : FontNames.CourierBold
      : italic
        ? FontNames.CourierOblique
        : FontNames.Courier;
  return undefined;
}
