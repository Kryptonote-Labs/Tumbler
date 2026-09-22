import { expect, test } from "bun:test";
import {
  openPresentationArtifact,
  openPresentationEditingSession,
  presentationTextTarget,
  slideTextValue,
} from "../src/index.ts";
import { beginPackageTransaction, openOpcPackage } from "@tumblerjs/opc";
const fixture = (name = "standards-features") =>
  Bun.file(
    new URL(`../../../apps/docs/static/samples/${name}.pptx`, import.meta.url),
  ).bytes();
test("cell editing preserves table styling and other cells, with formatting and undo", async () => {
  const original = await fixture(),
    session = openPresentationEditingSession(original);
  const slide = session.artifact.document.slides[2]!,
    table = slide.objects.find((o) => o.table)!;
  const target = {
    slideId: slide.id,
    objectKey: table.key,
    cell: { row: 1, column: 1 },
  };
  expect(table.movable).toBe(true);
  const edited = session.editText({
    ...target,
    start: 0,
    end: 6,
    value: "Product team",
  });
  let current = edited.document.slides[2]!.objects.find(
    (o) => o.key === table.key,
  )!;
  expect(slideTextValue(presentationTextTarget(current, target.cell))).toBe(
    "Product team",
  );
  for (const cell of table.table!.cells) {
    const next = current.table!.cells.find(
      (c) => c.row === cell.row && c.column === cell.column,
    )!;
    expect(next.fill).toBe(cell.fill);
    expect(next.borders).toEqual(cell.borders);
    if (cell.row !== 1 || cell.column !== 1)
      expect(next.text).toEqual(cell.text);
  }
  const formatted = session.formatText({
    ...target,
    start: 0,
    end: 7,
    patch: {
      text: {
        bold: { set: true },
        color: { set: { type: "rgb", value: "#AA2233" } },
      },
      block: { horizontalAlignment: { set: "center" } },
    },
  });
  current = formatted.document.slides[2]!.objects.find(
    (o) => o.key === table.key,
  )!;
  const text = presentationTextTarget(current, target.cell).text!;
  expect(text.paragraphs[0]!.align).toBe("center");
  expect(text.paragraphs[0]!.runs[0]).toMatchObject({
    text: "Product",
    bold: true,
    color: "rgba(170,34,51,1)",
  });
  expect(session.undo().bytes()).toEqual(edited.bytes());
  expect(session.redo().bytes()).toEqual(formatted.bytes());
  const before = openOpcPackage(original);
  for (const part of formatted.document.package.parts)
    if (part.name.value !== slide.part)
      expect(formatted.document.package.readPart(part)).toEqual(
        before.readPart(before.getPart(part.name)!),
      );
  expect(() =>
    session.editText({
      ...target,
      cell: { row: 999, column: 1 },
      start: 0,
      end: 0,
      value: "x",
    }),
  ).toThrow("cell");
});
test("table resizing updates row heights and column widths without scaling the font", async () => {
  const artifact = openPresentationArtifact(await fixture());
  const slide = artifact.document.slides[2]!,
    table = slide.objects.find((o) => o.table)!;
  const resized = artifact.updateObject({
    slideId: slide.id,
    objectKey: table.key,
    ...table.transform,
    width: table.transform.width * 1.5,
    height: table.transform.height * 1.2,
  });
  const current = openPresentationArtifact(
    resized.bytes(),
  ).document.slides[2]!.objects.find((o) => o.key === table.key)!;
  expect(current.table!.width).toBeCloseTo(current.transform.width, 4);
  expect(current.table!.height).toBeCloseTo(current.transform.height, 4);
  expect(current.table!.cells[0]!.width).toBeCloseTo(
    table.table!.cells[0]!.width * 1.5,
    3,
  );
  expect(current.table!.cells[0]!.text).toEqual(table.table!.cells[0]!.text);
});
test("merged cell anchors edit without changing merge flags; covered cells reject edits", async () => {
  const pkg = openOpcPackage(await fixture("compatibility-deck")),
    part = pkg.getPart("/ppt/slides/slide1.xml")!,
    transaction = beginPackageTransaction(pkg);
  let count = 0;
  const xml = new TextDecoder()
    .decode(pkg.readPart(part))
    .replace(/<a:tc>/g, (match) =>
      ++count === 1
        ? '<a:tc gridSpan="2">'
        : count === 2
          ? '<a:tc hMerge="1">'
          : match,
    );
  transaction.replacePart(part.name, new TextEncoder().encode(xml));
  const a = openPresentationArtifact(transaction.commit()),
    slide = a.document.slides[0]!,
    table = slide.objects.find((o) => o.table)!,
    target = {
      slideId: slide.id,
      objectKey: table.key,
      cell: { row: 0, column: 0 },
    };
  const updated = a.editText({
    ...target,
    start: 0,
    end: 9,
    value: "Combined header",
  });
  const cell = updated.document.slides[0]!.objects.find(
    (o) => o.key === table.key,
  )!.table!.cells[0]!;
  expect(cell.columnSpan).toBe(2);
  expect(cell.text!.paragraphs[0]!.runs[0]!.text).toBe("Combined header");
  expect(() =>
    a.editText({
      ...target,
      cell: { row: 0, column: 1 },
      start: 0,
      end: 0,
      value: "x",
    }),
  ).toThrow("merged cell");
  const moved = updated.updateObject({
    slideId: slide.id,
    objectKey: table.key,
    ...table.transform,
    x: table.transform.x + 10,
  });
  expect(
    moved.document.slides[0]!.objects.find((o) => o.key === table.key)!.table,
  ).toEqual(
    updated.document.slides[0]!.objects.find((o) => o.key === table.key)!.table,
  );
});
test("table edits refresh Office modification IDs and unknown extensions are preserved", async () => {
  const bytes = await fixture();
  const artifact = openPresentationArtifact(bytes);
  const slide = artifact.document.slides[2]!;
  const table = slide.objects.find((o) => o.table)!;
  const edited = artifact.editText({
    slideId: slide.id,
    objectKey: table.key,
    cell: { row: 1, column: 1 },
    start: 0,
    end: 6,
    value: "Team",
  });
  const xml = (a: typeof artifact) =>
    new TextDecoder().decode(
      a.document.package.readPart(a.document.package.getPart(slide.part)!),
    );
  const ids = (text: string) =>
    [...text.matchAll(/<p14:modId\b[^>]*\bval="(\d+)"/g)].map(
      (match) => match[1],
    );
  expect(ids(xml(artifact)).length).toBeGreaterThan(0);
  expect(ids(xml(edited))).not.toEqual(ids(xml(artifact)));
  const tx = beginPackageTransaction(artifact.document.package);
  tx.replacePart(
    slide.part,
    new TextEncoder().encode(
      xml(artifact).replaceAll(
        "{D42A27DB-BD31-4B8C-83A1-F6EECF244321}",
        "{UNKNOWN-EXTENSION}",
      ),
    ),
  );
  const restricted = openPresentationArtifact(
    tx.commit(),
  ).document.slides[2]!.objects.find((o) => o.table)!;
  expect(restricted.movable).toBe(true);
  expect(
    presentationTextTarget(restricted, { row: 1, column: 1 }).textEditable,
  ).toBe(true);
});
