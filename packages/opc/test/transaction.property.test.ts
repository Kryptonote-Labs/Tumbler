import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import {
  beginPackageTransaction,
  ContentTypesError,
  openOpcPackage,
  type OpcPackage,
} from "../src/index.ts";
import { buildDeflatedZip } from "./zip-builder.ts";

const encoder = new TextEncoder();
const mainPartName = "/word/document.xml";
const customRelationshipType = "https://tumbler.test/relationships/custom-data";

describe("generated package transactions", () => {
  test("adds and removes generated relationship graphs without residual parts", () => {
    fc.assert(fc.property(
      fc.uniqueArray(
        fc.record({
          index: fc.integer({ min: 1, max: 10_000 }),
          data: fc.uint8Array({ maxLength: 4_096 }),
        }),
        { selector: (item) => item.index, maxLength: 10 },
      ),
      (items) => {
        const base = openOpcPackage(buildPackage());
        const adding = beginPackageTransaction(base);
        for (const item of items) {
          const name = `/custom/item-${item.index}.bin`;
          adding
            .addPart(name, "application/vnd.tumbler.test-data", item.data)
            .addRelationship(mainPartName, {
              id: `item${item.index}`,
              type: customRelationshipType,
              target: name,
            });
        }
        const addedBytes = adding.commit();
        const added = openOpcPackage(addedBytes);
        expectGraph(added, items);
        expect(beginPackageTransaction(added).commit()).toBe(addedBytes);

        const removing = beginPackageTransaction(added);
        for (const item of items) {
          removing
            .removeRelationship(mainPartName, `item${item.index}`)
            .removePart(`/custom/item-${item.index}.bin`);
        }
        const removed = openOpcPackage(removing.commit());
        for (const item of items) {
          expect(removed.getPart(`/custom/item-${item.index}.bin`)).toBeUndefined();
        }
        expect(removed.mainOfficeDocumentPart().name.value).toBe(mainPartName);
      },
    ), { numRuns: 100 });
  });

  test("serializes identical command histories deterministically", () => {
    fc.assert(fc.property(
      fc.uint8Array({ maxLength: 8_192 }),
      (data) => {
        const base = openOpcPackage(buildPackage());
        const run = () => beginPackageTransaction(base)
          .addPart("/custom/data.bin", "application/vnd.tumbler.test-data", data)
          .addRelationship(mainPartName, {
            id: "customData",
            type: customRelationshipType,
            target: "/custom/data.bin",
          })
          .commit();
        expect(run()).toEqual(run());
      },
    ), { numRuns: 100 });
  });

  test("limits a focused graph edit to its declared infrastructure and additions", () => {
    const base = openOpcPackage(buildPackage());
    const transaction = beginPackageTransaction(base);
    transaction
      .addPart("/custom/data.bin", "application/vnd.tumbler.test-data", encoder.encode("data"))
      .addRelationship(mainPartName, {
        id: "customData",
        type: customRelationshipType,
        target: "/custom/data.bin",
      });
    const edited = openOpcPackage(transaction.commit());

    for (const name of ["_rels/.rels", "word/document.xml", "docProps/core.xml"]) {
      expect(edited.archive.compressedBytes(edited.archive.get(name)!)).toEqual(
        base.archive.compressedBytes(base.archive.get(name)!),
      );
    }
  });

  test("leaves a transaction active after invalid content-type validation", () => {
    const base = openOpcPackage(buildPackage());
    const transaction = beginPackageTransaction(base);
    transaction.addPart("/custom/data.bin", "not a media type", new Uint8Array());
    expect(() => transaction.commit()).toThrow(ContentTypesError);
    expect(transaction.status).toBe("active");
    expect(base.getPart("/custom/data.bin")).toBeUndefined();
  });
});

function expectGraph(
  pkg: OpcPackage,
  items: ReadonlyArray<{ readonly index: number; readonly data: Uint8Array }>,
): void {
  if (items.length === 0) {
    return;
  }
  const relationships = pkg.relationships(pkg.mainOfficeDocumentPart().name);
  for (const item of items) {
    const part = pkg.getPart(`/custom/item-${item.index}.bin`);
    expect(part).toBeDefined();
    expect(pkg.readPart(part!)).toEqual(item.data);
    const relationship = relationships.get(`item${item.index}`);
    expect(relationship?.targetMode).toBe("Internal");
    if (relationship?.targetMode === "Internal") {
      expect(relationship.targetPartName.equals(part!.name)).toBeTrue();
    }
  }
}

function buildPackage(): Uint8Array {
  return buildDeflatedZip([
    {
      name: "[Content_Types].xml",
      data: encoder.encode(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
      </Types>`),
    },
    {
      name: "_rels/.rels",
      data: encoder.encode(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="main" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
      </Relationships>`),
    },
    { name: "word/document.xml", data: encoder.encode("<document>original</document>") },
    { name: "docProps/core.xml", data: encoder.encode("<core>untouched</core>") },
  ]);
}
