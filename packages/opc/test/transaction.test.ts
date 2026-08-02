import { describe, expect, test } from "bun:test";
import {
  beginPackageTransaction,
  openOpcPackage,
  PackageTransactionError,
} from "../src/index.ts";
import { buildDeflatedZip } from "./zip-builder.ts";

const encoder = new TextEncoder();
const source = buildPackage();

describe("package transactions", () => {
  test("stages replacements without mutating the open package", () => {
    const pkg = openOpcPackage(source);
    const original = pkg.readPart(pkg.mainOfficeDocumentPart());
    const replacement = encoder.encode("<document>edited</document>");
    const transaction = beginPackageTransaction(pkg);

    transaction.replacePart("/word/document.xml", replacement);
    replacement.fill(0);

    expect(transaction.status).toBe("active");
    expect(transaction.hasChanges).toBeTrue();
    expect(pkg.readPart(pkg.mainOfficeDocumentPart())).toEqual(original);

    const reopened = openOpcPackage(transaction.commit());
    expect(reopened.readPart(reopened.mainOfficeDocumentPart())).toEqual(
      encoder.encode("<document>edited</document>"),
    );
    expect(transaction.status).toBe("committed");
  });

  test("uses last-write-wins within one atomic transaction", () => {
    const transaction = beginPackageTransaction(openOpcPackage(source));
    transaction
      .replacePart("/word/document.xml", encoder.encode("first"))
      .replacePart("/WORD/DOCUMENT.XML", encoder.encode("second"));

    const reopened = openOpcPackage(transaction.commit());
    expect(reopened.readPart(reopened.mainOfficeDocumentPart())).toEqual(
      encoder.encode("second"),
    );
  });

  test("rolls back without producing or retaining changes", () => {
    const transaction = beginPackageTransaction(openOpcPackage(source));
    transaction.replacePart("/word/document.xml", encoder.encode("discard me"));
    transaction.rollback();
    expect(transaction.status).toBe("rolled_back");
    expect(transaction.hasChanges).toBeFalse();
    expect(() => transaction.commit()).toThrow(PackageTransactionError);
    expect(() => transaction.replacePart("/word/document.xml", new Uint8Array())).toThrow(
      PackageTransactionError,
    );
  });

  test("returns the exact source bytes for an empty transaction", () => {
    const transaction = beginPackageTransaction(openOpcPackage(source));
    expect(transaction.commit()).toBe(source);
  });

  test("rejects missing parts before staging any state", () => {
    const transaction = beginPackageTransaction(openOpcPackage(source));
    expect(() => transaction.replacePart("/word/missing.xml", new Uint8Array())).toThrow(
      PackageTransactionError,
    );
    expect(transaction.hasChanges).toBeFalse();
    expect(transaction.status).toBe("active");
  });

  test("cannot be committed or rolled back more than once", () => {
    const committed = beginPackageTransaction(openOpcPackage(source));
    committed.commit();
    expect(() => committed.commit()).toThrow(PackageTransactionError);
    expect(() => committed.rollback()).toThrow(PackageTransactionError);

    const rolledBack = beginPackageTransaction(openOpcPackage(source));
    rolledBack.rollback();
    expect(() => rolledBack.rollback()).toThrow(PackageTransactionError);
  });

  test("adds an unreferenced part and an exact content-type override", () => {
    const transaction = beginPackageTransaction(openOpcPackage(source));
    transaction.addPart(
      "/custom/data.bin",
      "application/vnd.tumbler.test-data",
      encoder.encode("custom payload"),
    );
    const reopened = openOpcPackage(transaction.commit());
    const part = reopened.getPart("/custom/data.bin");
    expect(part?.contentType).toBe("application/vnd.tumbler.test-data");
    expect(reopened.readPart(part!)).toEqual(encoder.encode("custom payload"));
    expect(reopened.contentTypes.overrides.some(
      (override) => override.partName.equals(part!.name),
    )).toBeTrue();
  });

  test("reuses a matching extension default without adding an override", () => {
    const transaction = beginPackageTransaction(openOpcPackage(source));
    transaction.addPart("/custom/data.xml", "application/xml", encoder.encode("<data/>"));
    const reopened = openOpcPackage(transaction.commit());
    expect(reopened.getPart("/custom/data.xml")?.contentType).toBe("application/xml");
    expect(reopened.contentTypes.overrides.some(
      (override) => override.partName.equals(reopened.getPart("/custom/data.xml")!.name),
    )).toBeFalse();
  });

  test("removing a staged addition cancels it", () => {
    const transaction = beginPackageTransaction(openOpcPackage(source));
    transaction
      .addPart("/custom/data.xml", "application/xml", encoder.encode("<data/>"))
      .removePart("/custom/data.xml");
    expect(transaction.hasChanges).toBeFalse();
    expect(transaction.commit()).toBe(source);
  });

  test("removes an unreferenced part and its stale override", () => {
    const withCustom = beginPackageTransaction(openOpcPackage(source));
    withCustom.addPart(
      "/custom/data.bin",
      "application/vnd.tumbler.test-data",
      encoder.encode("custom payload"),
    );
    const added = withCustom.commit();
    const removing = beginPackageTransaction(openOpcPackage(added));
    removing.removePart("/custom/data.bin");
    const reopened = openOpcPackage(removing.commit());
    expect(reopened.getPart("/custom/data.bin")).toBeUndefined();
    expect(reopened.contentTypes.overrides.some(
      (override) => override.partName.value === "/custom/data.bin",
    )).toBeFalse();
  });

  test("refuses to remove a part with an incoming relationship", () => {
    const transaction = beginPackageTransaction(openOpcPackage(source));
    transaction.removePart("/word/document.xml");
    expect(() => transaction.commit()).toThrow(PackageTransactionError);
    expect(transaction.status).toBe("active");
  });

  test("copies bytes supplied for additions", () => {
    const bytes = encoder.encode("original addition");
    const transaction = beginPackageTransaction(openOpcPackage(source));
    transaction.addPart("/custom/data.xml", "application/xml", bytes);
    bytes.fill(0);
    const reopened = openOpcPackage(transaction.commit());
    expect(reopened.readPart(reopened.getPart("/custom/data.xml")!)).toEqual(
      encoder.encode("original addition"),
    );
  });

  test("adds a relationship from a part to a newly added part", () => {
    const transaction = beginPackageTransaction(openOpcPackage(source));
    transaction
      .addPart("/word/styles.xml", "application/xml", encoder.encode("<styles/>"))
      .addRelationship("/word/document.xml", {
        id: "styles",
        type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles",
        target: "/word/styles.xml",
      });

    const reopened = openOpcPackage(transaction.commit());
    const relationships = reopened.relationships(
      reopened.mainOfficeDocumentPart().name,
    );
    const relationship = relationships.get("styles");
    expect(relationship?.target).toBe("styles.xml");
    expect(relationship?.targetMode).toBe("Internal");
    expect(reopened.archive.get("word/_rels/document.xml.rels")).toBeDefined();
  });

  test("adds external relationships as opaque targets", () => {
    const transaction = beginPackageTransaction(openOpcPackage(source));
    transaction.addRelationship("/word/document.xml", {
      id: "website",
      type: "https://example.test/hyperlink",
      target: "https://example.com/?a=1&b=2",
      targetMode: "External",
    });
    const reopened = openOpcPackage(transaction.commit());
    expect(reopened.relationships(reopened.mainOfficeDocumentPart().name).get("website")).toEqual({
      id: "website",
      type: "https://example.test/hyperlink",
      target: "https://example.com/?a=1&b=2",
      targetMode: "External",
    });
  });

  test("removes a relationship before deleting its former target", () => {
    const transaction = beginPackageTransaction(openOpcPackage(source));
    transaction.removeRelationship(null, "main").removePart("/word/document.xml");
    const reopened = openOpcPackage(transaction.commit());
    expect(reopened.getPart("/word/document.xml")).toBeUndefined();
    expect(reopened.archive.get("_rels/.rels")).toBeUndefined();
  });

  test("removing the last part relationship removes its relationship part", () => {
    const adding = beginPackageTransaction(openOpcPackage(source));
    adding.addRelationship("/word/document.xml", {
      id: "website",
      type: "https://example.test/hyperlink",
      target: "https://example.com/",
      targetMode: "External",
    });
    const withRelationship = adding.commit();
    const removing = beginPackageTransaction(openOpcPackage(withRelationship));
    removing.removeRelationship("/word/document.xml", "website");
    const reopened = openOpcPackage(removing.commit());
    expect(reopened.archive.get("word/_rels/document.xml.rels")).toBeUndefined();
  });

  test("rejects duplicate, missing, and source-less relationship edits", () => {
    const transaction = beginPackageTransaction(openOpcPackage(source));
    expect(() => transaction.addRelationship(null, {
      id: "main",
      type: "https://example.test/duplicate",
      target: "/word/document.xml",
    })).toThrow(PackageTransactionError);
    expect(() => transaction.removeRelationship(null, "missing")).toThrow(
      PackageTransactionError,
    );
    expect(() => transaction.addRelationship("/word/missing.xml", {
      id: "one",
      type: "https://example.test/one",
      target: "/word/document.xml",
    })).toThrow(PackageTransactionError);
    expect(transaction.hasChanges).toBeFalse();
  });

  test("keeps a failed dangling-target commit active and the base unchanged", () => {
    const pkg = openOpcPackage(source);
    const transaction = beginPackageTransaction(pkg);
    transaction.addRelationship("/word/document.xml", {
      id: "missing",
      type: "https://example.test/missing",
      target: "/word/missing.xml",
    });
    expect(() => transaction.commit()).toThrow();
    expect(transaction.status).toBe("active");
    expect(pkg.archive.get("word/_rels/document.xml.rels")).toBeUndefined();
  });

  test("does not rewrite content types for an existing relationship-part edit", () => {
    const pkg = openOpcPackage(source);
    const beforeEntry = pkg.archive.get("[Content_Types].xml")!;
    const transaction = beginPackageTransaction(pkg);
    transaction.addRelationship(null, {
      id: "web",
      type: "https://example.test/web",
      target: "https://example.com/",
      targetMode: "External",
    });
    const reopened = openOpcPackage(transaction.commit());
    expect(reopened.archive.compressedBytes(reopened.archive.get("[Content_Types].xml")!)).toEqual(
      pkg.archive.compressedBytes(beforeEntry),
    );
  });
});

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
  ]);
}
