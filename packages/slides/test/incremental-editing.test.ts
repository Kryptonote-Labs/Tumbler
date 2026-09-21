import { expect, test } from "bun:test";
import {
  openPresentationArtifact,
  openPresentationEditingSession,
  slideTextValue,
} from "../src/index.ts";

const fixture = () =>
  Bun.file(
    new URL(
      "../../../apps/docs/static/samples/shapes-and-pictures.pptx",
      import.meta.url,
    ),
  ).bytes();

test("edits share untouched slides and assets while exported scenes match a full reopen", async () => {
  const session = openPresentationEditingSession(await fixture());
  const original = session.artifact.document;
  const index = original.slides.findIndex((s) =>
    s.objects.some((o) => o.kind === "picture"),
  );
  const slide = original.slides[index]!;
  const picture = slide.objects.find((o) => o.kind === "picture")!;
  const target = { slideId: slide.id, objectKey: picture.key };
  const moved = session.updateObject({
    ...target,
    ...picture.transform,
    x: picture.transform.x + 20,
  });
  expect(moved.document.embeddedFonts).toBe(original.embeddedFonts);
  for (let i = 0; i < original.slides.length; i++)
    if (i !== index) expect(moved.document.slides[i]).toBe(original.slides[i]);
  const current = moved.document.slides[index]!.objects.find(
    (o) => o.key === picture.key,
  )!;
  expect(current.image!.bytes).toBe(picture.image!.bytes);
  expect(
    original.slides[index]!.objects.find((o) => o.key === picture.key)!
      .transform.x,
  ).toBe(picture.transform.x);
  expect(moved.document.slides).toEqual(
    openPresentationArtifact(moved.bytes()).document.slides,
  );
  const text = moved.document.slides[0]!.objects.find((o) => o.textEditable)!;
  const before = slideTextValue(text);
  const typed = session.editText({
    slideId: original.slides[0]!.id,
    objectKey: text.key,
    start: 0,
    end: 0,
    value: "Edited ",
  });
  expect(
    slideTextValue(
      typed.document.slides[0]!.objects.find((o) => o.key === text.key)!,
    ),
  ).toBe("Edited " + before);
  expect(typed.document.slides).toEqual(
    openPresentationArtifact(typed.bytes()).document.slides,
  );
  expect(session.undo()).toBe(moved);
  const branch = session.updateObject({
    ...target,
    ...current.transform,
    y: current.transform.y + 12,
  });
  expect(branch.document.slides).toEqual(
    openPresentationArtifact(branch.bytes()).document.slides,
  );
  expect(session.canRedo).toBe(false);
});
