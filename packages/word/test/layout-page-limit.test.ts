import { expect, test } from "bun:test";
import { createWordArtifact, layoutWordDocument, openWordArtifact, type WordContentBlock } from "../src/index.ts";

const measure = { measure: (text: string) => ({ width: text.length * 6, ascent: 9, descent: 3 }) };
const paragraph = (text: string): WordContentBlock => ({ kind: "paragraph", runs: [{ text }] });
const document = (blocks: WordContentBlock[]) => openWordArtifact(createWordArtifact({ blocks }).bytes()).document;
const long = document(Array.from({ length: 160 }, (_, index) => paragraph(`Paragraph ${index} `.repeat(12 + (index % 5)))));

test("pageLimit returns the same leading pages as a full layout", () => {
  const full = layoutWordDocument(long, measure);
  expect(full.pages.length).toBeGreaterThan(3);
  for (const pageLimit of [1, 2]) {
    const preview = layoutWordDocument(long, measure, { pageLimit });
    expect(preview.truncated).toBe(true);
    expect(preview.pages).toEqual(full.pages.slice(0, pageLimit));
  }
  expect(full.truncated).toBeUndefined();
});

test("pageLimit leaves documents that fit untouched", () => {
  const short = document([paragraph("One page")]);
  const layout = layoutWordDocument(short, measure, { pageLimit: 1 });
  expect(layout.truncated).toBeUndefined();
  expect(layout.pages).toHaveLength(1);
  expect(() => layoutWordDocument(long, measure, { maxPages: 1 })).toThrow("Layout exceeds 1 pages.");
});
