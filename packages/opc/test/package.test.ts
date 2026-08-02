import { describe, expect, test } from "bun:test";
import {
  ContentTypesError,
  openOpcPackage,
  OpcPackageError,
  PartName,
  type OpcPackageErrorCode,
} from "../src/index.ts";
import { buildStoredZip } from "./zip-builder.ts";

const contentTypesNamespace =
  "http://schemas.openxmlformats.org/package/2006/content-types";
const relationshipsNamespace =
  "http://schemas.openxmlformats.org/package/2006/relationships";
const officeDocumentType =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument";
const relationshipContentType =
  "application/vnd.openxmlformats-package.relationships+xml";

const formats = [
  {
    family: "word",
    main: "word/document.xml",
    contentType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
  },
  {
    family: "spreadsheet",
    main: "xl/workbook.xml",
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
  },
  {
    family: "presentation",
    main: "ppt/presentation.xml",
    contentType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml",
  },
] as const;

describe("OPC package", () => {
  for (const format of formats) {
    test(`discovers a ${format.family} main part from relationships`, () => {
      const pkg = openOpcPackage(buildOfficePackage(format.main, format.contentType));
      const main = pkg.mainOfficeDocumentPart();
      expect(main.name.value).toBe(`/${format.main}`);
      expect(main.family).toBe(format.family);
      expect(pkg.readPart(main)).toEqual(new TextEncoder().encode("<main/>"));
      expect(pkg.getPart(main.name)?.entry).toBe(main.entry);
      expect(pkg.getPart(main.name.value.toUpperCase())?.entry).toBe(main.entry);
    });
  }

  test("validates internal relationship targets when traversed", () => {
    const pkg = openOpcPackage(buildOfficePackage("word/missing.xml", formats[0].contentType, {
      includeMain: false,
    }));
    expectPackageError(() => pkg.relationships(null), "missing_internal_target");
  });

  test("rejects logical part names that differ only by ASCII case", () => {
    const bytes = buildPackage([
      { name: "word/document.xml" },
      { name: "WORD/DOCUMENT.XML" },
    ], `
      <Default Extension="rels" ContentType="${relationshipContentType}"/>
      <Default Extension="xml" ContentType="application/xml"/>
    `);
    expectPackageError(() => openOpcPackage(bytes), "duplicate_part");
  });

  test("requires every physical part to have a content type", () => {
    const bytes = buildPackage([{ name: "data.unknown" }], "");
    expect(() => openOpcPackage(bytes)).toThrow(ContentTypesError);
  });

  test("rejects physical item names that are not valid OPC part names", () => {
    const bytes = buildPackage([{ name: "bad name.xml" }],
      `<Default Extension="xml" ContentType="application/xml"/>`,
    );
    expectPackageError(() => openOpcPackage(bytes), "invalid_part_name");
  });

  test("requires exactly one supported internal office-document relationship", () => {
    const none = buildPackage([
      { name: "_rels/.rels", data: relationshipsXml("") },
    ], `<Default Extension="rels" ContentType="${relationshipContentType}"/>`);
    expectPackageError(() => openOpcPackage(none).mainOfficeDocumentPart(), "missing_main_part");

    const multiple = buildPackage([
      { name: "_rels/.rels", data: relationshipsXml(`
        ${relationship("one", "word/document.xml")}
        ${relationship("two", "xl/workbook.xml")}
      `) },
      { name: "word/document.xml" },
      { name: "xl/workbook.xml" },
    ], `
      <Default Extension="rels" ContentType="${relationshipContentType}"/>
      <Default Extension="xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
    `);
    expectPackageError(() => openOpcPackage(multiple).mainOfficeDocumentPart(), "multiple_main_parts");
  });

  test("does not accept an arbitrary XML part as an Office main part", () => {
    const bytes = buildOfficePackage("custom/main.xml", "application/xml");
    expectPackageError(() => openOpcPackage(bytes).mainOfficeDocumentPart(), "unsupported_main_part");
  });

  test("rejects parts from another package", () => {
    const first = openOpcPackage(buildOfficePackage(formats[0].main, formats[0].contentType));
    const second = openOpcPackage(buildOfficePackage(formats[0].main, formats[0].contentType));
    expect(() => first.readPart(second.mainOfficeDocumentPart())).toThrow(TypeError);
  });

  test("allows callers to address parts with validated names", () => {
    const pkg = openOpcPackage(buildOfficePackage(formats[0].main, formats[0].contentType));
    expect(pkg.getPart(PartName.parse("/word/document.xml"))?.contentType).toBe(formats[0].contentType);
  });
});

function buildOfficePackage(
  main: string,
  contentType: string,
  options: { includeMain?: boolean } = {},
): Uint8Array {
  return buildPackage([
    { name: "_rels/.rels", data: relationshipsXml(relationship("main", main)) },
    ...(options.includeMain === false
      ? []
      : [{ name: main, data: new TextEncoder().encode("<main/>") }]),
  ], `
    <Default Extension="rels" ContentType="${relationshipContentType}"/>
    <Default Extension="xml" ContentType="application/xml"/>
    <Override PartName="/${main}" ContentType="${contentType}"/>
  `);
}

function buildPackage(
  entries: ReadonlyArray<{ readonly name: string; readonly data?: Uint8Array }>,
  contentTypeEntries: string,
): Uint8Array {
  return buildStoredZip([
    {
      name: "[Content_Types].xml",
      data: new TextEncoder().encode(
        `<Types xmlns="${contentTypesNamespace}">${contentTypeEntries}</Types>`,
      ),
    },
    ...entries,
  ]);
}

function relationshipsXml(children: string): Uint8Array {
  return new TextEncoder().encode(
    `<Relationships xmlns="${relationshipsNamespace}">${children}</Relationships>`,
  );
}

function relationship(id: string, target: string): string {
  return `<Relationship Id="${id}" Type="${officeDocumentType}" Target="${target}"/>`;
}

function expectPackageError(action: () => unknown, code: OpcPackageErrorCode): void {
  try {
    action();
    throw new Error(`Expected OPC package error ${code}.`);
  } catch (error) {
    expect(error).toBeInstanceOf(OpcPackageError);
    expect((error as OpcPackageError).code).toBe(code);
  }
}
