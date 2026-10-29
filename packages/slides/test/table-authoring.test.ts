import { expect, test } from "bun:test";
import {
  applyPresentationCommand as run,
  createPresentation,
  openPresentationArtifact,
} from "../src/index.ts";
function fixture() {
  let a = createPresentation();
  const slideId = a.document.slides[0]!.id;
  a = run(a, {
    name: "insert-object",
    slideId,
    bounds: { x: 50, y: 70, width: 600, height: 240 },
    object: { kind: "table", rows: 2, columns: 2 },
  });
  const objectKey = a.document.slides[0]!.objects[0]!.key;
  for (const [row, column, value] of [
    [0, 0, "A"],
    [0, 1, "B"],
    [1, 0, "C"],
    [1, 1, "D"],
  ] as const)
    a = run(a, {
      name: "edit-text",
      slideId,
      objectKey,
      cell: { row, column },
      start: 0,
      end: 0,
      value,
    });
  return { a, slideId, objectKey };
}
const values = (a: ReturnType<typeof createPresentation>) =>
  a.document.slides[0]!.objects[0]!.table!.cells.map((c) =>
    c.text?.paragraphs.map((p) => p.runs.map((r) => r.text).join("")).join("\n"),
  );
const reopen = (a: ReturnType<typeof createPresentation>) => openPresentationArtifact(a.bytes());
test("table row and column insertion preserve existing contents and expand geometry", () => {
  const { a, slideId, objectKey } = fixture();
  let b = run(a, {
    name: "edit-table",
    slideId,
    objectKey,
    action: "insert-row",
    row: 1,
    column: 0,
  });
  expect(values(b)).toEqual(["A", "B", "", "", "C", "D"]);
  expect(b.document.slides[0]!.objects[0]!.transform.height).toBe(360);
  b = run(b, {
    name: "edit-table",
    slideId,
    objectKey,
    action: "insert-column",
    row: 0,
    column: 1,
  });
  expect(values(reopen(b))).toEqual(["A", "", "B", "", "", "", "C", "", "D"]);
  expect(b.document.slides[0]!.objects[0]!.transform.width).toBe(900);
});
test("deleting a table row or column only removes that row or column", () => {
  const { a, slideId, objectKey } = fixture();
  let b = run(a, {
    name: "edit-table",
    slideId,
    objectKey,
    action: "delete-column",
    row: 0,
    column: 0,
  });
  expect(values(b)).toEqual(["B", "D"]);
  b = run(b, { name: "edit-table", slideId, objectKey, action: "delete-row", row: 0, column: 0 });
  expect(values(reopen(b))).toEqual(["D"]);
  expect(() =>
    run(b, { name: "edit-table", slideId, objectKey, action: "delete-row", row: 0, column: 0 }),
  ).toThrow();
});
test("merged cells retain all visible text and split without duplicating it", () => {
  const { a, slideId, objectKey } = fixture();
  let b = run(a, {
    name: "edit-table",
    slideId,
    objectKey,
    action: "merge",
    row: 0,
    column: 0,
    endRow: 1,
    endColumn: 1,
  });
  expect(values(b)).toEqual(["A\nB\nC\nD"]);
  expect(b.document.slides[0]!.objects[0]!.table!.cells[0]).toMatchObject({
    rowSpan: 2,
    columnSpan: 2,
  });
  b = run(b, { name: "edit-table", slideId, objectKey, action: "split", row: 0, column: 0 });
  expect(values(reopen(b))).toEqual(["A\nB\nC\nD", "", "", ""]);
});
test("inserting through a merge expands it, and removing its anchor row retains its text", () => {
  const { a, slideId, objectKey } = fixture();
  let b = run(a, {
    name: "edit-table",
    slideId,
    objectKey,
    action: "merge",
    row: 0,
    column: 0,
    endRow: 1,
    endColumn: 0,
  });
  b = run(b, { name: "edit-table", slideId, objectKey, action: "insert-row", row: 1, column: 0 });
  expect(b.document.slides[0]!.objects[0]!.table!.cells[0]).toMatchObject({ rowSpan: 3 });
  b = run(b, { name: "edit-table", slideId, objectKey, action: "delete-row", row: 0, column: 0 });
  expect(values(reopen(b))[0]).toBe("A\nC");
  expect(b.document.slides[0]!.objects[0]!.table!.cells[0]).toMatchObject({ rowSpan: 2 });
});
