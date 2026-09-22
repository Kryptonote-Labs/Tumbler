import { expect, test } from "bun:test";
import { loadPresentationFonts } from "../src/presentation-fonts.ts";

test("main view and thumbnails share font faces until their last consumer closes", () => {
  const originalDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    "document",
  );
  const originalFace = Object.getOwnPropertyDescriptor(globalThis, "FontFace");
  const faces = new Set<Face>();
  let loads = 0;
  class Face {
    constructor(readonly family: string) {}
    load() {
      loads++;
      return Promise.resolve(this);
    }
  }
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { fonts: faces },
  });
  Object.defineProperty(globalThis, "FontFace", {
    configurable: true,
    value: Face,
  });
  try {
    const fonts = [
      {
        family: "Example",
        bold: false,
        italic: false,
        bytes: new Uint8Array([1]),
      },
      {
        family: "Example",
        bold: true,
        italic: false,
        bytes: new Uint8Array([2]),
      },
    ];
    const main = loadPresentationFonts(fonts),
      thumbnails = Array.from({ length: 12 }, () =>
        loadPresentationFonts(fonts),
      );
    expect(faces.size).toBe(2);
    expect(loads).toBe(2);
    expect(
      thumbnails.every((t) => t.family("Example") === main.family("Example")),
    ).toBe(true);
    for (const thumbnail of thumbnails) thumbnail.destroy();
    expect(faces.size).toBe(2);
    const other = loadPresentationFonts([...fonts]);
    expect(other.family("Example")).not.toBe(main.family("Example"));
    main.destroy();
    main.destroy();
    expect(faces.size).toBe(2);
    other.destroy();
    expect(faces.size).toBe(0);
  } finally {
    if (originalDocument)
      Object.defineProperty(globalThis, "document", originalDocument);
    else Reflect.deleteProperty(globalThis, "document");
    if (originalFace)
      Object.defineProperty(globalThis, "FontFace", originalFace);
    else Reflect.deleteProperty(globalThis, "FontFace");
  }
});
