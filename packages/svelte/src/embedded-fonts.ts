import { cssFontFamily } from "./font-family.ts";
export interface EmbeddedFontContext {
  family: (name: string) => string;
}
export interface EmbeddedFont {
  readonly family: string;
  readonly bold: boolean;
  readonly italic: boolean;
  readonly bytes: Uint8Array;
}
interface LoadedFonts extends EmbeddedFontContext {
  ready: Promise<void>;
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
    const faces = fonts.map((font) => {
      const name = families.get(font.family.toLowerCase()) ?? `TumblerEmbedded${++serial}`;
      families.set(font.family.toLowerCase(), name);
      const face = new FontFace(name, Uint8Array.from(font.bytes).buffer, {
        weight: font.bold ? "700" : "400",
        style: font.italic ? "italic" : "normal",
      });
      owner.fonts.add(face);
      return face;
    });
    loaded = {
      references: 0,
      ready: Promise.allSettled(faces.map((face) => face.load())).then(() => {}),
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
