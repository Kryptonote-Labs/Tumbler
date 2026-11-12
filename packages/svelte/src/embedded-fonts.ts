import { cssFontFamily } from "./font-family.ts";
export interface EmbeddedFontContext {
  family: (name: string) => string;
  /** Settles when this document's faces have loaded or failed. */
  readonly ready?: Promise<void>;
}
export interface EmbeddedFont {
  readonly family: string;
  readonly bold: boolean;
  readonly italic: boolean;
  readonly bytes: Uint8Array;
}
/** A face-level outcome; failures include malformed and empty font data. */
export type EmbeddedFontLoadResult =
  | { readonly font: EmbeddedFont; readonly status: "loaded" }
  | { readonly font: EmbeddedFont; readonly status: "failed"; readonly error: unknown };
interface LoadedFonts extends EmbeddedFontContext {
  ready: Promise<void>;
  results: Promise<readonly EmbeddedFontLoadResult[]>;
  references: number;
  faces: FontFace[];
}
const documents = new WeakMap<Document, WeakMap<readonly EmbeddedFont[], LoadedFonts>>();
let serial = 0;
/** Share document-scoped font faces with private family names; never install document fonts globally. */
export function loadEmbeddedFonts(fonts: readonly EmbeddedFont[]) {
  const owner = document;
  let cache = documents.get(owner);
  if (!cache) {
    cache = new WeakMap();
    documents.set(owner, cache);
  }
  let loaded = cache.get(fonts);
  if (!loaded) {
    const families = new Map<string, string>();
    const faces: FontFace[] = [];
    const results = Promise.all(fonts.map(async (font): Promise<EmbeddedFontLoadResult> => {
      try {
        if (font.bytes.length === 0) throw new Error("Empty embedded font data");
        const name = families.get(font.family.toLowerCase()) ?? `TumblerEmbedded${++serial}`;
        const face = new FontFace(name, Uint8Array.from(font.bytes).buffer, {
          weight: font.bold ? "700" : "400",
          style: font.italic ? "italic" : "normal",
        });
        owner.fonts.add(face);
        faces.push(face);
        families.set(font.family.toLowerCase(), name);
        await face.load();
        return { font, status: "loaded" };
      } catch (error) {
        return { font, status: "failed", error };
      }
    }));
    loaded = {
      references: 0,
      ready: results.then(() => {}),
      results,
      faces,
      family: (name) =>
        families.has(name.toLowerCase())
          ? `"${families.get(name.toLowerCase())}", ${cssFontFamily(name)}`
          : cssFontFamily(name),
    };
    cache.set(fonts, loaded);
  }
  loaded.references++;
  const shared = loaded;
  let released = false;
  return {
    family: shared.family,
    ready: shared.ready,
    results: shared.results,
    destroy() {
      if (released) return;
      released = true;
      if (--shared.references === 0) {
        for (const face of shared.faces) owner.fonts.delete(face);
        cache.delete(fonts);
      }
    },
  };
}
