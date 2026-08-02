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
