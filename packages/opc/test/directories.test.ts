import { expect, test } from "bun:test";
import {
  openOpcPackage,
  openZipArchive,
  writeZipArchiveChanges,
} from "../src/index.ts";
import { buildStoredZip } from "./zip-builder.ts";
const utf8 = (text: string) => new TextEncoder().encode(text);
test("empty directory records are not parts and disappear only when writing changes", () => {
  const bytes = buildStoredZip([
    {
      name: "[Content_Types].xml",
      data: utf8(
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>',
      ),
    },
    { name: "ppt/" },
    { name: "ppt/slides/" },
    { name: "ppt/slides/slide1.xml", data: utf8("<slide/>") },
  ]);
  const pkg = openOpcPackage(bytes);
  expect(pkg.parts.map((part) => part.name.value)).toEqual([
    "/ppt/slides/slide1.xml",
  ]);
  expect(writeZipArchiveChanges(pkg.archive, {})).toBe(bytes);
  const edited = openZipArchive(
    writeZipArchiveChanges(pkg.archive, {
      replacements: new Map([["ppt/slides/slide1.xml", utf8("<edited/>")]]),
    }),
  );
  expect(edited.entries.some((entry) => entry.name.endsWith("/"))).toBe(false);
  expect(edited.read(edited.get("[Content_Types].xml")!)).toEqual(
    pkg.archive.read(pkg.archive.get("[Content_Types].xml")!),
  );
});
test("directory records with content are rejected", () => {
  expect(() =>
    openZipArchive(
      buildStoredZip([{ name: "ppt/", data: utf8("hidden content") }]),
    ),
  ).toThrow();
});
