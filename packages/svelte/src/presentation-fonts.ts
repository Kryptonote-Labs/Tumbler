import type { PresentationEmbeddedFont } from "@tumblerjs/slides";
export const presentationFontContext = Symbol("presentation-fonts");
export interface PresentationFontContext {
  family: (name: string) => string;
}
interface LoadedFonts extends PresentationFontContext {
  references: number;
  faces: FontFace[];
}
const documents = new WeakMap<
  readonly PresentationEmbeddedFont[],
  LoadedFonts
>();
let serial = 0;
/** Share font faces across a document's main view and thumbnails, with private family names. */
export function loadPresentationFonts(
  fonts: readonly PresentationEmbeddedFont[],
) {
  let loaded = documents.get(fonts);
  if (!loaded) {
    const families = new Map<string, string>();
    const faces = fonts.map((font) => {
      const name = families.get(font.family) ?? `TumblerEmbedded${++serial}`;
      families.set(font.family, name);
      const face = new FontFace(name, Uint8Array.from(font.bytes).buffer, {
        weight: font.bold ? "700" : "400",
        style: font.italic ? "italic" : "normal",
      });
      document.fonts.add(face);
      void face.load().catch(() => {});
      return face;
    });
    loaded = {
      references: 0,
      faces,
      family: (name) =>
        families.has(name)
          ? `"${families.get(name)}", ${JSON.stringify(name)}`
          : JSON.stringify(name),
    };
    documents.set(fonts, loaded);
  }
  loaded.references++;
  const shared = loaded;
  let released = false;
  return {
    family: shared.family,
    destroy() {
      if (released) return;
      released = true;
      if (--shared.references === 0) {
        for (const face of shared.faces) document.fonts.delete(face);
        documents.delete(fonts);
      }
    },
  };
}
