import { describe, expect, test } from "bun:test";
import { openWordArtifact } from "../src/index.ts";
import { buildWordDocumentFixture } from "./document-fixture.ts";

describe("WordprocessingML artefact host boundary", () => {
  test("opens and replaces immutable document revisions", () => {
    const firstBytes = buildWordDocumentFixture();
    const secondBytes = buildWordDocumentFixture({ documentXml: `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Updated</w:t></w:r></w:p></w:body></w:document>` });
    const first = openWordArtifact(firstBytes);
    expect(first.bytes()).toEqual(firstBytes);
    expect(first.replace(firstBytes)).toBe(first);
    const second = first.replace(secondBytes);
    expect(second).not.toBe(first);
    expect(second.document.blocks[0]?.kind).toBe("paragraph");
    expect(second.bytes()).toEqual(secondBytes);
  });
});
