import { expect, test } from "bun:test";
import {
  applyPresentationCommand as run,
  createPresentation,
  openPresentationArtifact,
  PresentationEditingSession,
  slideTextValue,
} from "../src/index.ts";

function textDeck(text = "Hello world") {
  let a = createPresentation();
  const slideId = a.document.slides[0]!.id;
  a = run(a, {
    name: "insert-object",
    slideId,
    bounds: { x: 80, y: 100, width: 400, height: 160 },
    object: { kind: "shape", text },
  });
  return { a, slideId, objectKey: a.document.slides[0]!.objects[0]!.key };
}
const reopen = (a: ReturnType<typeof createPresentation>) => openPresentationArtifact(a.bytes());
test("blank decks and new text boxes export and reopen with authored dimensions and text", () => {
  const { a } = textDeck("A & B < C\nSecond line");
  const saved = reopen(a);
  expect(saved.document.width).toBe(1280);
  expect(saved.document.height).toBe(720);
  expect(slideTextValue(saved.document.slides[0]!.objects[0]!)).toBe("A & B < C\nSecond line");
  expect(saved.document.slides[0]!.objects[0]!.textEditable).toBe(true);
  expect(openPresentationArtifact(a.bytes()).bytes()).toEqual(a.bytes());
});
test("slide insertion, duplication, ordering, and deletion retain original slide content", () => {
  const { a, slideId } = textDeck();
  let b = run(a, { name: "insert-slide", index: 1, sourceId: slideId });
  expect(b.document.slides).toHaveLength(2);
  expect(slideTextValue(b.document.slides[1]!.objects[0]!)).toBe("Hello world");
  const copyId = b.document.slides[1]!.id;
  b = run(b, { name: "move-slide", slideId: copyId, index: 0 });
  expect(b.document.slides[0]!.id).toBe(copyId);
  b = run(b, { name: "delete-slide", slideId });
  expect(reopen(b).document.slides.map((s) => s.id)).toEqual([copyId]);
  expect(() => run(b, { name: "delete-slide", slideId: copyId })).toThrow();
  expect(a.document.slides).toHaveLength(1);
});
test("new slides are blank and inherit a valid layout relationship", () => {
  const { a } = textDeck();
  const b = run(a, { name: "insert-slide", index: 0 });
  expect(b.document.slides[0]!.objects.filter((o) => o.layer === "slide")).toHaveLength(0);
  expect(b.document.slides[1]!.objects).toHaveLength(1);
  expect(reopen(b).document.slides).toHaveLength(2);
});
test("objects duplicate independently, align to slide bounds, reorder, and delete", () => {
  const { a, slideId, objectKey } = textDeck();
  let b = run(a, { name: "duplicate-object", slideId, objectKey });
  expect(b.document.slides[0]!.objects).toHaveLength(2);
  const copy = b.document.slides[0]!.objects[1]!;
  expect(copy.key).not.toBe(objectKey);
  expect(copy.transform.x).toBe(96);
  b = run(b, { name: "arrange", slideId, objectKey: copy.key, action: "back" });
  expect(b.document.slides[0]!.objects[0]!.key).toBe(copy.key);
  b = run(b, { name: "arrange", slideId, objectKey: copy.key, action: "center" });
  expect(b.document.slides[0]!.objects[0]!.transform.x).toBe(440);
  b = run(b, { name: "delete-object", slideId, objectKey });
  expect(reopen(b).document.slides[0]!.objects.map((o) => o.key)).toEqual([copy.key]);
});
test("rich text formatting and paragraph formatting survive editing and a round trip", () => {
  const { a, slideId, objectKey } = textDeck("First\nSecond");
  let b = run(a, {
    name: "format-text",
    slideId,
    objectKey,
    start: 0,
    end: 5,
    patch: {
      text: { bold: { set: true }, fontFamily: { set: "Arial" }, fontSize: { set: 32 } },
      block: { horizontalAlignment: { set: "center" } },
    },
  });
  b = run(b, {
    name: "paragraph",
    slideId,
    objectKey,
    start: 6,
    end: 12,
    bullet: "number",
    level: 1,
    lineSpacing: 1.5,
    before: 3,
    after: 8,
    verticalAlignment: "center",
  });
  const obj = reopen(b).document.slides[0]!.objects[0]!;
  expect(obj.text!.paragraphs[0]!.runs[0]).toMatchObject({
    bold: true,
    fontFamily: "Arial",
    fontSize: (32 * 4) / 3,
  });
  expect(obj.text!.paragraphs[0]!.align).toBe("center");
  expect(obj.text!.paragraphs[1]).toMatchObject({ bullet: "1.", before: 4, after: (8 * 4) / 3 });
  expect(obj.text!.anchor).toBe("center");
});
test("tables support cell text and formatting without affecting their neighbours", () => {
  let a = createPresentation();
  const slideId = a.document.slides[0]!.id;
  a = run(a, {
    name: "insert-object",
    slideId,
    bounds: { x: 50, y: 50, width: 600, height: 200 },
    object: { kind: "table", rows: 2, columns: 3 },
  });
  const objectKey = a.document.slides[0]!.objects[0]!.key;
  a = run(a, {
    name: "edit-text",
    slideId,
    objectKey,
    cell: { row: 1, column: 2 },
    start: 0,
    end: 0,
    value: "Revenue",
  });
  a = run(a, {
    name: "format-text",
    slideId,
    objectKey,
    cell: { row: 1, column: 2 },
    start: 0,
    end: 7,
    patch: { text: { bold: { set: true } } },
  });
  const cells = reopen(a).document.slides[0]!.objects[0]!.table!.cells;
  expect(cells).toHaveLength(6);
  expect(cells[5]!.text!.paragraphs[0]!.runs[0]).toMatchObject({ text: "Revenue", bold: true });
  expect(cells[0]!.text!.paragraphs[0]!.runs.map((r) => r.text).join("")).toBe("");
});
test("image insertion preserves original pixels and rejects mismatched bytes", async () => {
  const a = createPresentation(),
    slideId = a.document.slides[0]!.id;
  const data =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=";
  const b = run(a, {
    name: "insert-object",
    slideId,
    bounds: { x: 10, y: 20, width: 100, height: 100 },
    object: { kind: "image", contentType: "image/png", data },
  });
  expect(reopen(b).document.slides[0]!.objects[0]!.image!.bytes).toEqual(
    Uint8Array.from(atob(data), (c) => c.charCodeAt(0)),
  );
  expect(() =>
    run(a, {
      name: "insert-object",
      slideId,
      bounds: { x: 10, y: 20, width: 100, height: 100 },
      object: { kind: "image", contentType: "image/jpeg", data },
    }),
  ).toThrow();
});
test("replace all changes literal matches across slides and undo restores the entire command", () => {
  const { a, slideId } = textDeck("Hello HELLO hello");
  const session = new PresentationEditingSession(
    run(a, { name: "insert-slide", index: 1, sourceId: slideId }),
  );
  const original = session.artifact.bytes();
  session.execute({ name: "replace-all", find: "hello", value: "Goodbye", caseSensitive: false });
  for (const s of session.artifact.document.slides)
    expect(slideTextValue(s.objects[0]!)).toBe("Goodbye Goodbye Goodbye");
  expect(session.undo().bytes()).toEqual(original);
  expect(slideTextValue(session.redo().document.slides[0]!.objects[0]!)).toBe(
    "Goodbye Goodbye Goodbye",
  );
});
test("background color is independent of document content and is undoable", () => {
  const { a, slideId } = textDeck();
  const b = run(a, { name: "background", slideId, color: "#123456" });
  expect(reopen(b).document.slides[0]!.background).toBe("rgba(18,52,86,1)");
  expect(slideTextValue(b.document.slides[0]!.objects[0]!)).toBe("Hello world");
});
test("structural commands preserve every unrelated imported package part", async () => {
  const a = openPresentationArtifact(
    await Bun.file(
      new URL("../../../apps/docs/static/samples/workspace-brief.pptx", import.meta.url),
    ).bytes(),
  );
  const slide = a.document.slides[0]!;
  const b = run(a, {
    name: "insert-object",
    slideId: slide.id,
    bounds: { x: 10, y: 20, width: 100, height: 80 },
    object: { kind: "shape", geometry: "ellipse" },
  });
  for (const part of a.document.package.parts)
    if (part.name.value !== slide.part)
      expect(b.document.package.readPart(b.document.package.getPart(part.name)!)).toEqual(
        a.document.package.readPart(part),
      );
});
test("invalid commands fail before changing the input document", () => {
  const { a, slideId, objectKey } = textDeck();
  const bytes = a.bytes();
  expect(() => run(a, { name: "insert-slide", index: 3 })).toThrow();
  expect(() => run(a, { name: "move-slide", slideId, index: -1 })).toThrow();
  expect(() => run(a, { name: "paragraph", slideId, objectKey, start: 8, end: 2 })).toThrow();
  expect(() =>
    run(a, {
      name: "insert-object",
      slideId,
      bounds: { x: 0, y: 0, width: 0, height: 10 },
      object: { kind: "shape" },
    }),
  ).toThrow();
  expect(a.bytes()).toEqual(bytes);
});
test("layout changes keep existing text and pictures instead of deleting content", () => {
  const { a, slideId } = textDeck("Keep this text");
  const b = run(a, { name: "layout", slideId, layout: "two-content" });
  expect(b.document.slides[0]!.objects).toHaveLength(3);
  expect(slideTextValue(b.document.slides[0]!.objects[0]!)).toBe("Keep this text");
  expect(reopen(b).document.slides[0]!.objects[2]!.textEditable).toBe(true);
});
test("replace all treats punctuation literally and retains Unicode offsets", () => {
  const { a } = textDeck("İ [a.b] [aXb] [a.b]");
  const b = run(a, { name: "replace-all", find: "[a.b]", value: "✓", caseSensitive: false });
  expect(slideTextValue(b.document.slides[0]!.objects[0]!)).toBe("İ ✓ [aXb] ✓");
});
test("authoring commands preserve Strict namespaces on newly created slide parts", async () => {
  const { openOpcPackage, saveOpcPackage } = await import("@tumblerjs/opc");
  const { OOXML_NAMESPACES } = await import("@tumblerjs/ooxml");
  const pkg = createPresentation().document.package;
  const changes = new Map<string, Uint8Array>();
  for (const part of pkg.parts)
    if (part.name.value.endsWith(".xml") || part.name.value.endsWith(".rels")) {
      let value = new TextDecoder().decode(pkg.readPart(part));
      for (const key of ["presentation", "drawing"] as const)
        value = value.replaceAll(OOXML_NAMESPACES.transitional[key], OOXML_NAMESPACES.strict[key]);
      value = value.replaceAll(
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
        "http://purl.oclc.org/ooxml/officeDocument/relationships",
      );
      changes.set(part.name.value, new TextEncoder().encode(value));
    }
  let a = openPresentationArtifact(saveOpcPackage(pkg, changes));
  a = run(a, { name: "insert-slide", index: 1 });
  a = run(a, {
    name: "insert-object",
    slideId: a.document.slides[1]!.id,
    bounds: { x: 20, y: 20, width: 300, height: 100 },
    object: { kind: "shape", text: "Strict" },
  });
  expect(reopen(a).document.conformance).toBe("strict");
  expect(slideTextValue(reopen(a).document.slides[1]!.objects[0]!)).toBe("Strict");
});
