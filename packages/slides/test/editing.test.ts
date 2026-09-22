import { expect, test } from "bun:test";
import {
  openPresentationArtifact,
  openPresentationEditingSession,
  presentationFormattingState,
  slideTextValue,
} from "../src/index.ts";
const bytes = () =>
  Bun.file(
    new URL(
      "../../../apps/docs/static/samples/workspace-brief.pptx",
      import.meta.url,
    ),
  ).bytes();
test("selected text formatting preserves surrounding runs and survives subsequent typing and undo", async () => {
  const session = openPresentationEditingSession(await bytes());
  const slide = session.artifact.document.slides[0]!;
  const object = slide.objects.find((o) => o.textEditable)!;
  const original = slideTextValue(object);
  const target = { slideId: slide.id, objectKey: object.key };
  const result = session.formatText({
    ...target,
    start: 2,
    end: 7,
    patch: {
      text: {
        bold: { set: false },
        italic: { set: true },
        fontSize: { set: 30 },
        color: { set: { type: "rgb", value: "#B02030" } },
      },
    },
  });
  const updated = result.document.slides[0]!.objects.find(
    (o) => o.key === object.key,
  )!;
  expect(slideTextValue(updated)).toBe(original);
  expect(updated.text!.paragraphs[0]!.runs.map((r) => r.text)).toEqual([
    original.slice(0, 2),
    original.slice(2, 7),
    original.slice(7),
  ]);
  expect(updated.text!.paragraphs[0]!.runs[1]).toMatchObject({
    italic: true,
    bold: false,
    fontSize: 40,
    color: "rgba(176,32,48,1)",
  });
  expect(presentationFormattingState(updated).text.italic.state).toBe("mixed");
  const typed = session.editText({ ...target, start: 3, end: 4, value: "XYZ" });
  expect(
    slideTextValue(
      typed.document.slides[0]!.objects.find((o) => o.key === object.key)!,
    ),
  ).toBe(original.slice(0, 3) + "XYZ" + original.slice(4));
  expect(session.undo().bytes()).toEqual(result.bytes());
  const originalPackage = openPresentationArtifact(await bytes()).document
    .package;
  for (const part of result.document.package.parts)
    if (part.name.value !== slide.part)
      expect(result.document.package.readPart(part)).toEqual(
        originalPackage.readPart(originalPackage.getPart(part.name)!),
      );
});
test("paragraph insertion and joining preserve text, alignment, and neighbouring styles", async () => {
  let artifact = openPresentationArtifact(await bytes());
  const slide = artifact.document.slides[0]!,
    object = slide.objects.find((o) => o.textEditable)!,
    target = { slideId: slide.id, objectKey: object.key };
  artifact = artifact.editText({
    ...target,
    start: 0,
    end: slideTextValue(object).length,
    value: "First\nSecond",
  });
  artifact = artifact.formatText({
    ...target,
    start: 6,
    end: 12,
    patch: { block: { horizontalAlignment: { set: "center" } } },
  });
  let current = artifact.document.slides[0]!.objects.find(
    (o) => o.key === object.key,
  )!;
  expect(current.text!.paragraphs.map((p) => p.align)).toEqual([
    "left",
    "center",
  ]);
  artifact = artifact.editText({ ...target, start: 5, end: 6, value: " " });
  current = artifact.document.slides[0]!.objects.find(
    (o) => o.key === object.key,
  )!;
  expect(slideTextValue(current)).toBe("First Second");
  expect(current.text!.paragraphs).toHaveLength(1);
  expect(() =>
    artifact.editText({ ...target, start: -1, end: 2, value: "" }),
  ).toThrow();
  artifact = artifact.editText({ ...target, start: 0, end: 12, value: "A👩‍💻B" });
  expect(() =>
    artifact.editText({ ...target, start: 2, end: 3, value: "" }),
  ).toThrow("grapheme");
});
test("shape colours and outline widths retain geometry and other package parts", async () => {
  const session = openPresentationEditingSession(await bytes());
  const slide = session.artifact.document.slides[0]!,
    object = slide.objects.find((o) => o.kind === "shape" && o.movable)!;
  const changed = session.styleShape({
    slideId: slide.id,
    objectKey: object.key,
    fill: "#123456",
    stroke: "#AB1234",
    strokeWidth: 3,
  });
  const updated = changed.document.slides[0]!.objects.find(
    (o) => o.key === object.key,
  )!;
  expect(updated.fill).toBe("rgba(18,52,86,1)");
  expect(updated.stroke).toBe("rgba(171,18,52,1)");
  expect(updated.strokeWidth).toBe(4);
  expect(updated.transform).toEqual(object.transform);
  const none = session.styleShape({
    slideId: slide.id,
    objectKey: object.key,
    fill: "none",
    stroke: "none",
  });
  expect(
    none.document.slides[0]!.objects.find((o) => o.key === object.key)!.fill,
  ).toBe("none");
  expect(session.undo().bytes()).toEqual(changed.bytes());
  expect(() =>
    session.styleShape({
      slideId: slide.id,
      objectKey: object.key,
      fill: "red",
    }),
  ).toThrow();
});

test("ordinary typing preserves a single run and explicit formatting on inserted text", async () => {
  let a = openPresentationArtifact(await bytes());
  const s = a.document.slides[0]!,
    o = s.objects.find((o) => o.textEditable)!,
    target = { slideId: s.id, objectKey: o.key };
  let end = slideTextValue(o).length;
  for (const value of " more text") {
    a = a.editText({ ...target, start: end, end, value });
    end++;
  }
  let current = a.document.slides[0]!.objects.find((n) => n.key === o.key)!;
  expect(current.text!.paragraphs[0]!.runs).toHaveLength(1);
  a = a.editText({
    ...target,
    start: end,
    end,
    value: "!",
    formatting: { text: { italic: { set: true } } },
  });
  current = a.document.slides[0]!.objects.find((n) => n.key === o.key)!;
  expect(current.text!.paragraphs[0]!.runs.at(-1)).toMatchObject({
    text: "!",
    italic: true,
  });
});

test("hyperlinks, soft breaks, autofit and Office extensions survive text edits", async () => {
  const { beginPackageTransaction } = await import("@tumblerjs/opc");
  const base = openPresentationArtifact(await bytes());
  const slide = base.document.slides[0]!;
  const source = base.document.sources.get(slide.part)!;
  const object = slide.objects.find((o) => o.textEditable)!;
  const shape = source.element(object.elementId)!;
  const markup = source.source
    .slice(shape.span.start, shape.span.end)
    .replace(/<a:noAutofit\s*\/>/, '<a:normAutofit fontScale="80000"/>')
    .replace(
      /<a:p>[\s\S]*?<\/a:p>/,
      '<a:p><a:r><a:rPr><a:hlinkClick action="ppaction://hlinkshowjump?jump=nextslide"/></a:rPr><a:t>Before</a:t></a:r><a:br/><a:r><a:t>After</a:t></a:r></a:p>',
    );
  const tx = beginPackageTransaction(base.document.package);
  tx.replacePart(
    slide.part,
    new TextEncoder().encode(
      source.source.slice(0, shape.span.start) +
        markup +
        source.source.slice(shape.span.end),
    ),
  );
  const artifact = openPresentationArtifact(tx.commit());
  const target = { slideId: slide.id, objectKey: object.key };
  expect(
    artifact.document.slides[0]!.objects.find((o) => o.key === object.key)!
      .textEditable,
  ).toBe(true);
  const formatted = artifact.formatText({
    ...target,
    start: 0,
    end: 12,
    patch: { text: { bold: { set: true } } },
  });
  expect(
    slideTextValue(
      formatted.document.slides[0]!.objects.find((o) => o.key === object.key)!,
    ),
  ).toBe("Before\nAfter");
  const edited = formatted.editText({
    ...target,
    start: 7,
    end: 12,
    value: "Changed",
  });
  const result = openPresentationArtifact(edited.bytes());
  expect(
    slideTextValue(
      result.document.slides[0]!.objects.find((o) => o.key === object.key)!,
    ),
  ).toBe("Before\nChanged");
  const xml = result.document.sources.get(slide.part)!.source;
  expect(xml).toContain("ppaction://hlinkshowjump?jump=nextslide");
  expect(xml).toContain("<a:br");
});
