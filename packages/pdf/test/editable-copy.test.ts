import { expect, test } from "bun:test";
import {
  createEditablePdfCopy,
  openPdfDocument,
  PdfInterpreter,
  PdfTextModel,
  importPdfText,
  PdfEditingFonts,
  exportEditedPdf,
} from "../src/index.ts";

for (const fixture of [
  "encrypted-rc4",
  "encrypted-aes128",
  "encrypted-aes256",
  "object-streams",
  "annotation",
  "shared-form",
])
  test(`${fixture}: editable copies reopen without a password and preserve page content`, async () => {
    const bytes = await Bun.file(new URL(`./fixtures/${fixture}.pdf`, import.meta.url)).bytes();
    const document = openPdfDocument(bytes, { password: "fixture-password" });
    const output = createEditablePdfCopy(document);
    const copy = openPdfDocument(output);
    expect(copy.source.encrypted).toBe(false);
    expect(copy.pages.length).toBe(document.pages.length);
    expect(copy.source.resolve(copy.source.trailer.get("Info"))).toEqual(
      document.source.resolve(document.source.trailer.get("Info")),
    );
    expect([...copy.source.catalog.keys()]).toEqual([...document.source.catalog.keys()]);
    for (const page of document.pages) {
      expect(copy.pages[page.index]!.mediaBox).toEqual(page.mediaBox);
      const before = new PdfInterpreter(document).page(page.index);
      const after = new PdfInterpreter(copy).page(page.index);
      expect(after.text).toBe(before.text);
      const geometry = (scene: typeof before) =>
        scene.elements.map((element) => ({
          kind: element.kind,
          transform: element.state.transform,
          clips: element.state.clips,
          ...(element.kind === "glyph"
            ? { text: element.glyph.unicode, path: element.glyph.path, width: element.glyph.width }
            : element.kind === "path"
              ? { path: element.path }
              : {}),
        }));
      expect(geometry(after)).toEqual(geometry(before));
    }
    expect(document.bytes()).toEqual(bytes);
    expect(copy.source.trailer.has("Prev")).toBe(false);
  });

test("an encrypted source model can export edits against its editable copy", async () => {
  const document = openPdfDocument(
    await Bun.file(new URL("./fixtures/encrypted-aes256.pdf", import.meta.url)).bytes(),
    { password: "fixture-password" },
  );
  const model = new PdfTextModel();
  model.initialize(importPdfText(document));
  const id = model.ids()[0]!;
  model.move(id, 10, 12);
  const copy = openPdfDocument(createEditablePdfCopy(document));
  const fonts = new PdfEditingFonts();
  fonts.add(
    "Sans-Regular",
    await Bun.file(
      new URL("./fixtures/editing-fonts/LiberationSans-Regular.ttf", import.meta.url),
    ).bytes(),
  );
  const edited = openPdfDocument(exportEditedPdf(copy, model, fonts));
  expect(edited.source.encrypted).toBe(false);
  expect(new PdfInterpreter(edited).page(0).text).toBe(new PdfInterpreter(document).page(0).text);
  model.doc.destroy();
});
