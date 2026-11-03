import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { openPdfDocument, PdfError, PdfReference } from "../src/index.ts";
import { PdfSyntax } from "../src/syntax.ts";
import { PdfName, PdfString, type PdfValue } from "../src/objects.ts";
import { decodePdfStream } from "../src/filters.ts";
import { zlibSync } from "fflate";

const fixture = (name: string) =>
  new Uint8Array(readFileSync(new URL(`./fixtures/${name}.pdf`, import.meta.url)));
const valid = [
  "basic-text",
  "escaped-strings",
  "compressed-content",
  "positioned-text",
  "inherited-page",
  "shared-form",
  "split-content-state",
  "graphics",
  "unicode-map",
  "tagged-order",
  "annotation",
  "image-only",
  "hidden-ocr",
  "inline-image",
  "incremental-revision",
  "page-sequence",
  "many-pages",
  "object-streams",
  "linearized",
  "encrypted-aes256",
  "reordered-deleted",
  "chromium-typography",
];

describe("source graph and page tree", () => {
  for (const name of valid)
    test(`${name}: untouched source reconstructs exactly and owns its input`, () => {
      const bytes = fixture(name),
        expected = bytes.slice(),
        document = openPdfDocument(
          bytes,
          name === "encrypted-aes256" ? { password: "fixture-password" } : {},
        );
      expect(document.pages.length).toBeGreaterThan(0);
      expect(document.bytes()).toEqual(expected);
      bytes.fill(0);
      expect(document.bytes()).toEqual(expected);
      const exported = document.bytes();
      exported.fill(0);
      expect(document.bytes()).toEqual(expected);
    });
  test("page properties inherit resources and apply crop and rotation", () => {
    const page = openPdfDocument(fixture("inherited-page")).pages[0]!;
    expect(page.cropBox).toEqual([20, 20, 260, 160]);
    expect([page.width, page.height, page.rotation]).toEqual([140, 240, 90]);
    expect(page.resources.has("Font")).toBe(true);
  });
  test("incremental revisions resolve the newest object without losing original bytes", () => {
    const document = openPdfDocument(fixture("incremental-revision"));
    expect(document.source.revisions.length).toBe(2);
    const content = new TextDecoder().decode(document.contents(document.pages[0]!));
    expect(content).toContain("CURRENT REVISION");
    expect(content).not.toContain("OLD REVISION");
    expect(new TextDecoder().decode(document.bytes())).toContain("OLD REVISION");
  });
  test("object-stream references resolve catalog and compressed page dictionaries", () => {
    const document = openPdfDocument(fixture("object-streams"));
    expect(new TextDecoder().decode(document.contents(document.pages[0]!))).toContain("Hello Alex");
    expect(document.source.object(new PdfReference(999999))).toBeNull();
    expect(
      document.source.object(new PdfReference(document.pages[0]!.reference.object, 1)),
    ).toBeNull();
  });
  for (const name of ["broken-xref", "truncated"])
    test(`${name}: refuses implicit repair`, () => {
      expect(() => openPdfDocument(fixture(name))).toThrow(PdfError);
    });
});

test("standard AES-256 handler authenticates user and owner passwords before decoding content", () => {
  const bytes = fixture("encrypted-aes256");
  expect(() => openPdfDocument(bytes)).toThrow("requires a password");
  expect(() => openPdfDocument(bytes, { password: "wrong" })).toThrow("incorrect");
  for (const password of ["fixture-password", "fixture-owner"]) {
    const document = openPdfDocument(bytes, { password });
    expect(new TextDecoder().decode(document.contents(document.pages[0]!))).toContain("Hello Alex");
  }
});
for (const name of ["encrypted-rc4", "encrypted-aes128"])
  test(`${name}: legacy security handlers decode user and owner access`, () => {
    const bytes = fixture(name);
    expect(() => openPdfDocument(bytes)).toThrow("requires a password");
    expect(() => openPdfDocument(bytes, { password: "wrong" })).toThrow("incorrect");
    for (const password of ["fixture-password", "fixture-owner"]) {
      const document = openPdfDocument(bytes, { password });
      expect(new TextDecoder().decode(document.contents(document.pages[0]!))).toContain(
        "Hello Alex",
      );
      expect(document.bytes()).toEqual(bytes);
    }
  });

test("byte syntax preserves escapes, binary strings and typed references", () => {
  const syntax = new PdfSyntax(
    new TextEncoder().encode("/A#20B (a\\(b\\)\\053\r\nc) <4142F> [12 4 R true null -.25]"),
  );
  expect(syntax.value()).toEqual(new PdfName("A B"));
  expect(syntax.value()).toEqual(new PdfString(new TextEncoder().encode("a(b)+\nc")));
  expect(syntax.value()).toEqual(new PdfString(Uint8Array.of(65, 66, 240)));
  expect(syntax.value()).toEqual([new PdfReference(12, 4), true, null, -0.25]);
});
test("invalid and truncated lexical forms reject instead of fabricating values", () => {
  for (const value of ["(unfinished", "<xz>", "<</A 1 /A 2>>", "[true", "/Bad#zz"])
    expect(() => new PdfSyntax(new TextEncoder().encode(value)).value()).toThrow(PdfError);
});
test("Flate and PNG predictor decoding restores sample bytes exactly", () => {
  const raw = Uint8Array.of(1, 10, 10, 10, 2, 5, 5, 5);
  const options = new Map([
    ["Predictor", 15],
    ["Colors", 1],
    ["Columns", 3],
  ]);
  const info = new Map<string, PdfValue>([
    ["Filter", new PdfName("FlateDecode")],
    ["DecodeParms", options],
  ]);
  expect(decodePdfStream(zlibSync(raw), info)).toEqual(Uint8Array.of(10, 20, 30, 15, 25, 35));
});
