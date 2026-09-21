import { expect, test, spyOn } from "bun:test";
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

test("moving objects does not copy media into a new archive until export", async () => {
  const session = openPresentationEditingSession(await fixture());
  const document = session.artifact.document;
  const archive = document.package.archive;
  const reads = spyOn(archive, "compressedBytes");
  try {
    const slide = document.slides.find((s) =>
      s.objects.some((o) => o.kind === "picture"),
    )!;
    const picture = slide.objects.find((o) => o.kind === "picture")!;
    for (let step = 1; step <= 5; step++)
      session.updateObject({
        slideId: slide.id,
        objectKey: picture.key,
        ...picture.transform,
        x: picture.transform.x + step,
      });
    const mediaRead = () =>
      reads.mock.calls.some(([entry]) => entry.name.startsWith("ppt/media/"));
    expect(mediaRead()).toBe(false);
    const final = session.artifact;
    const bytes = final.bytes();
    expect(mediaRead()).toBe(true);
    expect(final.bytes()).toBe(bytes);
    const reopened = openPresentationArtifact(bytes);
    const result = reopened.document.slides
      .find((s) => s.id === slide.id)!
      .objects.find((o) => o.key === picture.key)!;
    expect(result.transform.x).toBeCloseTo(picture.transform.x + 5);
    expect(
      session
        .undo()
        .document.slides.find((s) => s.id === slide.id)!
        .objects.find((o) => o.key === picture.key)!.transform.x,
    ).toBeCloseTo(picture.transform.x + 4);
  } finally {
    reads.mockRestore();
  }
});

test("incremental text edits still enforce the whole-document text limit", async () => {
  const bytes = await fixture();
  const initial = openPresentationArtifact(bytes);
  const characters = initial.document.slides
    .flatMap((s) => s.objects)
    .reduce(
      (sum, o) =>
        sum +
        (o.text?.paragraphs.reduce(
          (n, p) => n + p.runs.reduce((m, r) => m + r.text.length, 0),
          0,
        ) ?? 0),
      0,
    );
  const artifact = openPresentationArtifact(bytes, {
    maxTextCharacters: characters + 8,
  });
  const slide = artifact.document.slides[0]!;
  const text = slide.objects.find((o) => o.textEditable)!;
  expect(() =>
    artifact.editText({
      slideId: slide.id,
      objectKey: text.key,
      start: 0,
      end: 0,
      value: "This exceeds the remaining budget",
    }),
  ).toThrow("Too much presentation text.");
  expect(artifact.bytes()).toBe(bytes);
});
