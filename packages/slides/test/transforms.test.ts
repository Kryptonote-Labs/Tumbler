import { expect, test } from "bun:test";
import {
  openPresentationEditingSession,
  openPresentationArtifact,
  resizeSlideTransform,
  shapeMatrix,
  transformPoint,
} from "../src/index.ts";
const fixture = () =>
  Bun.file(
    new URL(
      "../../../apps/docs/static/samples/shapes-and-pictures.pptx",
      import.meta.url,
    ),
  ).bytes();
test("resizing rotated and flipped shapes fixes the opposite corner or edge", () => {
  for (const rotation of [0, 18, 90, 179, 270])
    for (const flipH of [false, true])
      for (const flipV of [false, true])
        for (const x of [-1, 0, 1] as const)
          for (const y of [-1, 0, 1] as const) {
            if (x === 0 && y === 0) continue;
            const original = {
              x: 100,
              y: 150,
              width: 180,
              height: 100,
              rotation,
              flipH,
              flipV,
            };
            const resized = resizeSlideTransform(original, { x, y }, 40, 25);
            const before = transformPoint(
              shapeMatrix(original),
              ((1 - x) * original.width) / 2,
              ((1 - y) * original.height) / 2,
            );
            const after = transformPoint(
              shapeMatrix(resized),
              ((1 - x) * resized.width) / 2,
              ((1 - y) * resized.height) / 2,
            );
            expect(after.x).toBeCloseTo(before.x, 8);
            expect(after.y).toBeCloseTo(before.y, 8);
            expect(resized.rotation).toBe(rotation);
            expect(resized.flipH).toBe(flipH);
            expect(resized.flipV).toBe(flipV);
          }
});
test("rotation and rotated resizing survive reopening and undo without touching other parts", async () => {
  const original = await fixture(),
    session = openPresentationEditingSession(original);
  const slide = session.artifact.document.slides[0]!,
    object = slide.objects.find((o) => o.transform.rotation === 18)!;
  expect(object.movable).toBe(true);
  const target = { slideId: slide.id, objectKey: object.key };
  const rotated = session.updateObject({
    ...target,
    ...object.transform,
    rotation: 63,
  });
  let current = rotated.document.slides[0]!.objects.find(
    (o) => o.key === object.key,
  )!;
  expect(current.transform.rotation).toBe(63);
  expect(current.transform.x).toBe(object.transform.x);
  expect(current.transform.y).toBe(object.transform.y);
  const resized = resizeSlideTransform(
    current.transform,
    { x: 1, y: 1 },
    50,
    30,
  );
  const result = session.updateObject({ ...target, ...resized });
  const reopened = openPresentationArtifact(result.bytes());
  current = reopened.document.slides[0]!.objects.find(
    (o) => o.key === object.key,
  )!;
  expect(current.transform.width).toBeCloseTo(resized.width, 3);
  expect(current.transform.rotation).toBe(63);
  const originalPackage = openPresentationArtifact(original).document.package;
  for (const part of reopened.document.package.parts)
    if (part.name.value !== slide.part)
      expect(reopened.document.package.readPart(part)).toEqual(
        originalPackage.readPart(originalPackage.getPart(part.name)!),
      );
  expect(session.undo().bytes()).toEqual(rotated.bytes());
  expect(session.undo().bytes()).toEqual(original);
  expect(session.redo().bytes()).toEqual(rotated.bytes());
  expect(() =>
    session.updateObject({ ...target, ...resized, rotation: NaN }),
  ).toThrow("finite");
  const ordinary = session.artifact.document.slides[0]!.objects.find(
    (o) => o.movable && o.transform.rotation === 0,
  )!;
  const changed = session.updateObject({
    slideId: slide.id,
    objectKey: ordinary.key,
    ...ordinary.transform,
    rotation: -45,
  });
  expect(
    changed.document.slides[0]!.objects.find((o) => o.key === ordinary.key)!
      .transform.rotation,
  ).toBe(315);
  const moved = session.updateObject({
    slideId: slide.id,
    objectKey: ordinary.key,
    x: ordinary.transform.x + 5,
    y: ordinary.transform.y,
    width: ordinary.transform.width,
    height: ordinary.transform.height,
  });
  expect(
    moved.document.slides[0]!.objects.find((o) => o.key === ordinary.key)!
      .transform.rotation,
  ).toBe(315);
});

test("group children retain their parent transform and siblings across edits", async () => {
  const artifact = openPresentationArtifact(
    await Bun.file(
      new URL(
        "../../../apps/docs/static/samples/compatibility-deck.pptx",
        import.meta.url,
      ),
    ).bytes(),
  );
  const slide = artifact.document.slides[1]!;
  const object = slide.objects.find((o) => o.name === "Grouped rectangle")!;
  const before = transformPoint(object.matrix, 0, 0);
  const moved = artifact.updateObject({
    slideId: slide.id,
    objectKey: object.key,
    ...object.transform,
    x: object.transform.x + 20,
  });
  const after = moved.document.slides[1]!.objects.find(
    (o) => o.key === object.key,
  )!;
  expect(after.parentMatrix).toEqual(object.parentMatrix);
  expect(transformPoint(after.matrix, 0, 0).x - before.x).toBeCloseTo(
    20 * object.parentMatrix![0],
  );
  for (const other of slide.objects.filter((o) => o.key !== object.key))
    expect(
      moved.document.slides[1]!.objects.find((o) => o.key === other.key)!
        .matrix,
    ).toEqual(other.matrix);
  const rotated = moved.updateObject({
    slideId: slide.id,
    objectKey: object.key,
    ...after.transform,
    rotation: 35,
  });
  expect(
    openPresentationArtifact(rotated.bytes()).document.slides[1]!.objects.find(
      (o) => o.key === object.key,
    )!.transform.rotation,
  ).toBe(35);
});

test("moving and resizing ink updates its native bounds and padded picture fallback", async () => {
  const { beginPackageTransaction } = await import("@tumblerjs/opc");
  const base = openPresentationArtifact(await fixture());
  const slide = base.document.slides.find((s) =>
    s.objects.some((o) => o.kind === "picture"),
  )!;
  const index = base.document.slides.indexOf(slide);
  const picture = slide.objects.find((o) => o.kind === "picture")!;
  const source = base.document.sources.get(slide.part)!;
  const element = source.element(picture.elementId)!;
  const original = source.source.slice(element.span.start, element.span.end);
  const t = picture.transform,
    emu = (v: number) => Math.round(v * 9525);
  const ink = `<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main"><mc:Choice Requires="p14"><p:contentPart r:id="ink"><p14:xfrm><a:off x="${emu(t.x + 5)}" y="${emu(t.y + 5)}"/><a:ext cx="${emu(t.width - 10)}" cy="${emu(t.height - 10)}"/></p14:xfrm></p:contentPart></mc:Choice><mc:Fallback>${original}</mc:Fallback></mc:AlternateContent>`;
  const tx = beginPackageTransaction(base.document.package);
  tx.replacePart(
    slide.part,
    new TextEncoder().encode(
      source.source.slice(0, element.span.start) +
        ink +
        source.source.slice(element.span.end),
    ),
  );
  const artifact = openPresentationArtifact(tx.commit());
  const o = artifact.document.slides[index]!.objects.find(
    (o) => o.key === picture.key,
  )!;
  expect(o.movable).toBe(true);
  const edited = artifact.updateObject({
    slideId: slide.id,
    objectKey: o.key,
    ...t,
    x: t.x + 30,
    width: t.width * 2,
  });
  const xml = edited.document.sources.get(slide.part)!;
  const native = xml.elements(
    "http://schemas.microsoft.com/office/powerpoint/2010/main",
    "xfrm",
  )[0]!;
  const attrs = native.children
    .filter((n) => n.kind === "element")
    .flatMap((n) => n.attributes);
  expect(Number(attrs.find((a) => a.localName === "x")!.value)).toBe(
    emu(t.x + 40),
  );
  expect(Number(attrs.find((a) => a.localName === "cx")!.value)).toBe(
    emu((t.width - 10) * 2),
  );
  expect(xml.source).toContain('r:id="ink"');
});
