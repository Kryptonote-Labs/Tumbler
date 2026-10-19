import { expect, test } from "bun:test";
import * as Y from "yjs";
import { prepareWordOperation, wordOperations, wordOperation } from "../src/operations/index.ts";
import { createWordCommands } from "../src/collaboration/commands.ts";
import { tableParagraphs } from "../src/collaboration/tables.ts";
const commands = createWordCommands();
function document(value = "First paragraph\nSecond paragraph\n") {
  const doc = new Y.Doc();
  const text = doc.getText("body");
  text.insert(0, value);
  return text;
}
test("every advertised example validates", () => {
  for (const operation of Object.values(wordOperations))
    expect(wordOperation.parse({ name: operation.name, input: operation.example }).name).toBe(
      operation.name,
    );
});
test("preparation is isolated and commits formatting without removing structure", () => {
  const text = document();
  const edit = prepareWordOperation(
    text,
    { start: 0, end: 5 },
    { name: "format", input: { strike: true, highlight: "yellow" } },
  );
  expect(commands.wordFormats(text, { start: 0, end: 5 }).strike).not.toBe(true);
  text.applyDelta(edit.delta);
  expect(commands.wordFormats(text, { start: 0, end: 5 }).strike).toBe(true);
  expect(text.toString()).toBe("First paragraph\nSecond paragraph\n");
});
test("replace-all is literal and restricted to the selected range", () => {
  const text = document("draft draft\ndraft\n");
  text.applyDelta(
    prepareWordOperation(
      text,
      { start: 0, end: 11 },
      { name: "replace-all", input: { query: "draft", value: "final" } },
    ).delta,
  );
  expect(text.toString()).toBe("final final\ndraft\n");
});
test("list operations apply to each selected paragraph", () => {
  const text = document();
  const range = { start: 0, end: 32 };
  text.applyDelta(
    prepareWordOperation(text, range, { name: "list", input: { kind: "decimal", start: 3 } }).delta,
  );
  text.applyDelta(
    prepareWordOperation(text, range, { name: "indent-list", input: { amount: 1 } }).delta,
  );
  for (const at of [0, 16])
    expect(commands.wordFormats(text, { start: at, end: at }).list?.level).toBe(1);
});
test("tables are actual table structure and rejected edits do not mutate", () => {
  const text = document();
  text.applyDelta(
    prepareWordOperation(
      text,
      { start: 0, end: 0 },
      {
        name: "insert-table",
        input: {
          rows: [
            ["A", "B"],
            ["C", "D"],
          ],
        },
      },
    ).delta,
  );
  expect(tableParagraphs(text).filter((p) => p.table)).toHaveLength(4);
  const before = text.toDelta();
  expect(() =>
    prepareWordOperation(
      text,
      { start: 0, end: 0 },
      { name: "edit-table", input: { cellId: "missing", action: "merge-right" } },
    ),
  ).toThrow();
  expect(text.toDelta()).toEqual(before);
});
test("grapheme boundaries are checked before structural edits", () => {
  const text = document("👩‍💻 hello\n");
  expect(() =>
    prepareWordOperation(text, { start: 1, end: 2 }, { name: "break", input: { type: "page" } }),
  ).toThrow();
});

test("DOCX sessions preserve text, lists, tables and clear inherited formatting on export", async () => {
  const { createWordArtifact, importWordContent } = await import("../src/index.ts");
  const { openWordOperationDocument } = await import("../src/operations/index.ts");
  const source = createWordArtifact({
    paragraphs: [{ runs: [{ text: "Title", format: { strike: true, fontSizePoints: 34 } }] }],
  });
  const session = openWordOperationDocument(source);
  try {
    session.text.applyDelta(
      prepareWordOperation(
        session.text,
        { start: 0, end: 5 },
        { name: "style", input: { styleId: "Heading1" } },
      ).delta,
    );
    expect(importWordContent(session.artifact())[0]).toMatchObject({
      styleId: "Heading1",
      runs: [{ text: "Title", format: { fontSizePoints: 20 } }],
    });
    session.text.applyDelta(
      prepareWordOperation(
        session.text,
        { start: 0, end: 0 },
        {
          name: "insert-table",
          input: {
            rows: [
              ["a", "b"],
              ["c", "d"],
            ],
          },
        },
      ).delta,
    );
    const output = session.artifact();
    expect(importWordContent(output).some((b) => b.kind === "table" && b.rows.length === 2)).toBe(
      true,
    );
    const reopened = openWordOperationDocument(output);
    expect(reopened.text.toString()).toBe(session.text.toString());
    reopened.destroy();
  } finally {
    session.destroy();
  }
});

test("DOCX sessions preserve embedded images and resolve newly inserted images", async () => {
  const { createWordArtifact } = await import("../src/index.ts");
  const { openWordOperationDocument } = await import("../src/operations/index.ts");
  const png = Uint8Array.from(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
      "base64",
    ),
  );
  const source = createWordArtifact({
    blocks: [
      {
        kind: "image",
        bytes: png,
        contentType: "image/png",
        width: 80,
        height: 40,
        alt: "Original",
      },
    ],
  });
  const session = openWordOperationDocument(source, () => png);
  try {
    session.text.applyDelta(
      prepareWordOperation(
        session.text,
        { start: 0, end: 0 },
        {
          name: "insert-image",
          input: { image: { id: "new", type: "image/png", width: 20, height: 10, alt: "New" } },
        },
      ).delta,
    );
    const images = [...session.artifact().document.drawings.values()].filter(
      (d) => d.kind === "image",
    );
    expect(images.map((d) => d.altText)).toEqual(["New", "Original"]);
    expect(images.map((d) => d.widthPoints)).toEqual([20, 80]);
  } finally {
    session.destroy();
  }
});

test("objects can be resized, moved and inspected without changing neighboring text", async () => {
  const { inspectWordObjects } = await import("../src/operations/index.ts");
  const text = document("before after\n");
  text.applyDelta(
    prepareWordOperation(
      text,
      { start: 7, end: 7 },
      {
        name: "insert-shape",
        input: {
          shape: {
            preset: "rect",
            width: 100,
            height: 60,
            fill: "#ffffff",
            outline: "#000000",
            outlineWidth: 1,
            text: "Label",
          },
        },
      },
    ).delta,
  );
  text.applyDelta(
    prepareWordOperation(
      text,
      { start: 7, end: 8 },
      {
        name: "edit-object",
        input: {
          shape: {
            preset: "rect",
            width: 200,
            height: 80,
            fill: "#ffffff",
            outline: "#000000",
            outlineWidth: 1,
            text: "Updated",
          },
        },
      },
    ).delta,
  );
  text.applyDelta(
    prepareWordOperation(
      text,
      { start: 7, end: 8 },
      { name: "move-object", input: { destination: 0 } },
    ).delta,
  );
  expect(text.toString()).toBe("\uFFFCbefore after\n");
  expect(inspectWordObjects(text, undefined).objects[0]).toMatchObject({
    start: 0,
    attributes: { shape: { width: 200, text: "Updated" } },
  });
  expect(() =>
    prepareWordOperation(
      text,
      { start: 1, end: 2 },
      { name: "edit-object", input: { drawing: { width: 10, height: 10 } } },
    ),
  ).toThrow("one inspected object");
});

test("fit-table uses host geometry and preserves proportions", () => {
  const text = document();
  text.applyDelta(
    prepareWordOperation(
      text,
      { start: 0, end: 0 },
      { name: "insert-table", input: { rows: [["A", "B"]] } },
    ).delta,
  );
  const cells = tableParagraphs(text).filter((p) => p.table),
    cell = cells[0]!.table!;
  const range = { start: cells[0]!.start, end: cells.at(-1)!.end };
  const operation = {
    name: "fit-table" as const,
    input: { cellId: cell.cell, fraction: 0.8, columnWeights: [1, 3] },
  };
  expect(() => prepareWordOperation(text, range, operation)).toThrow("containing width");
  text.applyDelta(
    prepareWordOperation(text, range, operation, { availableWidthPoints: 500 }).delta,
  );
  expect(tableParagraphs(text).find((p) => p.table)?.table?.widths).toEqual([100, 300]);
});

test("native ink created through operations survives DOCX export", async () => {
  const { createWordArtifact } = await import("../src/index.ts");
  const { openWordOperationDocument } = await import("../src/operations/index.ts");
  const session = openWordOperationDocument(createWordArtifact());
  try {
    session.text.applyDelta(
      prepareWordOperation(
        session.text,
        { start: 0, end: 0 },
        {
          name: "insert-ink",
          input: {
            ink: {
              width: 100,
              height: 30,
              size: 2,
              color: "#202020",
              points: [
                [0, 0, 1],
                [100, 30, 0.5],
              ],
            },
          },
        },
      ).delta,
    );
    const drawings = [...session.artifact().document.drawings.values()];
    expect(drawings.some((d) => d.kind === "image" && d.ink)).toBe(true);
  } finally {
    session.destroy();
  }
});
