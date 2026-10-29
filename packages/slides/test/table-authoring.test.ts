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

async function imported(transform: (xml: string) => string) {
  const { beginPackageTransaction } = await import("@tumblerjs/opc");
  const { a, slideId, objectKey } = fixture();
  const slide = a.document.slides[0]!,
    pkg = a.document.package,
    part = pkg.getPart(slide.part)!;
  const tx = beginPackageTransaction(pkg);
  tx.replacePart(
    part.name,
    new TextEncoder().encode(transform(new TextDecoder().decode(pkg.readPart(part)))),
  );
  return { a: openPresentationArtifact(tx.commit()), slideId, objectKey };
}
test("structural edits support valid blank cells without text bodies", async () => {
  const { a, slideId, objectKey } = await imported((xml) =>
    xml.replace(/<a:txBody>.*?<\/a:txBody>/g, ""),
  );
  for (const action of ["insert-row", "insert-column", "merge"] as const) {
    const result = run(a, {
      name: "edit-table",
      slideId,
      objectKey,
      action,
      row: 0,
      column: 0,
      ...(action === "merge" ? { endRow: 1, endColumn: 1 } : {}),
    });
    expect(reopen(result).document.slides[0]!.objects[0]!.table!.cells.length).toBeGreaterThan(0);
  }
});
test("merge preserves donor list defaults and untouched column identifiers", async () => {
  let cell = 0;
  const { a, slideId, objectKey } = await imported((xml) =>
    xml
      .replace(
        /<a:lstStyle\/>/g,
        () =>
          `<a:lstStyle><a:lvl1pPr><a:defRPr sz="${++cell === 2 ? "3600" : "1800"}" b="${cell === 2 ? "1" : "0"}"/></a:lvl1pPr></a:lstStyle>`,
      )
      .replace(/<a:rPr[^>]*\/>/g, "")
      .replace(
        /<a:gridCol w="(\d+)"\/>/g,
        (_, width) =>
          `<a:gridCol w="${width}"><a:extLst><a:ext uri="{DEL-TEST}"><a16:colId xmlns:a16="http://schemas.microsoft.com/office/drawing/2014/main" val="123"/></a:ext></a:extLst></a:gridCol>`,
      ),
  );
  const before = a.document.slides[0]!.objects[0]!.table!.cells.flatMap((c) =>
    c.text!.paragraphs.flatMap((p) => p.runs),
  );
  const b = run(a, {
    name: "edit-table",
    slideId,
    objectKey,
    action: "merge",
    row: 0,
    column: 0,
    endRow: 0,
    endColumn: 1,
  });
  const merged = reopen(
    b,
  ).document.slides[0]!.objects[0]!.table!.cells[0]!.text!.paragraphs.flatMap((p) => p.runs);
  expect(merged.map((r) => [r.text, r.fontSize, r.bold])).toEqual(
    before.slice(0, 2).map((r) => [r.text, r.fontSize, r.bold]),
  );
  const part = b.document.package.getPart(b.document.slides[0]!.part)!;
  expect(
    new TextDecoder().decode(b.document.package.readPart(part)).match(/a16:colId/g),
  ).toHaveLength(2);
});

test("merge retains generic paragraph defaults from each source cell", async () => {
  const { a, slideId, objectKey } = await imported((xml) =>
    xml.replace(/<a:lstStyle\/>/g, '<a:lstStyle><a:defPPr marR="12700"/></a:lstStyle>'),
  );
  const result = run(a, {
    name: "edit-table",
    slideId,
    objectKey,
    action: "merge",
    row: 0,
    column: 0,
    endColumn: 1,
  });
  const part = result.document.package.getPart(result.document.slides[0]!.part)!;
  expect(
    new TextDecoder()
      .decode(result.document.package.readPart(part))
      .match(/<a:pPr[^>]*marR="12700"/g),
  ).toHaveLength(2);
});
