import { expect, test } from "bun:test";
import { saveOpcPackage, beginPackageTransaction } from "@tumblerjs/opc";
import {
  createPresentation,
  openPresentationArtifact,
  applyPresentationCommand as run,
  slideTextValue,
  PresentationEditingSession,
  rebasePresentationCommands,
} from "../src/index.ts";
import { A, P, R, encoder, group, namespaces, type } from "../src/authoring-xml.ts";

// Purpose-built, original OOXML fixture with a custom master and multiple layouts.
function deck() {
  const base = createPresentation();
  const ns = encoder.encode.bind(encoder);
  const ph = (id: number, role: string, idx: number, x: number) =>
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Custom ${role}"/><p:cNvSpPr/><p:nvPr><p:ph type="${role}" idx="${idx}"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x * 9525}" y="190500"/><a:ext cx="3810000" cy="952500"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle><a:lvl1pPr><a:defRPr sz="3300"><a:solidFill><a:srgbClr val="123456"/></a:solidFill></a:defRPr></a:lvl1pPr></a:lstStyle><a:p><a:r><a:t>Layout prompt, not slide content</a:t></a:r></a:p></p:txBody></p:sp>`;
  const tx = beginPackageTransaction(base.document.package);
  tx.addPart(
    "/ppt/slideLayouts/custom.xml",
    type("slideLayout"),
    ns(
      `<p:sldLayout ${namespaces} type="cust"><p:cSld name="Custom"><p:bg><p:bgPr><a:solidFill><a:srgbClr val="112233"/></a:solidFill></p:bgPr></p:bg><p:spTree>${group}${ph(2, "title", 0, 75)}${ph(3, "obj", 7, 550)}${ph(4, "ftr", 9, 50)}</p:spTree></p:cSld></p:sldLayout>`,
    ),
  );
  tx.addRelationship("/ppt/slideLayouts/custom.xml", {
    id: "master",
    type: `${R}/slideMaster`,
    target: "/ppt/slideMasters/slideMaster1.xml",
  });
  tx.addRelationship("/ppt/slideMasters/slideMaster1.xml", {
    id: "custom",
    type: `${R}/slideLayout`,
    target: "/ppt/slideLayouts/custom.xml",
  });
  const master = new TextDecoder().decode(
    base.document.package.readPart(
      base.document.package.getPart("/ppt/slideMasters/slideMaster1.xml")!,
    ),
  );
  tx.replacePart(
    "/ppt/slideMasters/slideMaster1.xml",
    ns(
      master.replace(
        "</p:sldLayoutIdLst>",
        '<p:sldLayoutId id="2147483650" r:id="custom"/></p:sldLayoutIdLst>',
      ),
    ),
  );
  // Use the first layout as a title layout, with Custom as the next master layout.
  tx.replacePart(
    "/ppt/slideLayouts/slideLayout1.xml",
    ns(
      `<p:sldLayout ${namespaces} type="title"><p:cSld><p:spTree>${group}${ph(2, "ctrTitle", 0, 100)}</p:spTree></p:cSld></p:sldLayout>`,
    ),
  );
  return openPresentationArtifact(tx.commit());
}
const reopen = (a: ReturnType<typeof createPresentation>) => openPresentationArtifact(a.bytes());

test("new slide after title uses the next master layout with empty editable inherited placeholders", () => {
  const base = deck();
  const result = reopen(
    run(base, { name: "insert-slide", index: 1, layoutSourceId: base.document.slides[0]!.id }),
  );
  const slide = result.document.slides[1]!;
  const objects = slide.objects.filter((o) => o.layer === "slide");
  expect(objects.map((o) => o.placeholder)).toEqual(["title", "obj"]);
  expect(objects.every((o) => o.textEditable && slideTextValue(o) === "")).toBe(true);
  expect(objects.map((o) => o.transform.x)).toEqual([75, 550]);
  expect(objects[1]!.text!.paragraphs[0]!.endRun).toMatchObject({
    fontSize: 44,
    color: "rgba(18,52,86,1)",
  });
  expect(slide.background).toBe("rgba(17,34,51,1)");
  const changed = run(result, {
    name: "edit-text",
    slideId: slide.id,
    objectKey: objects[1]!.key,
    start: 0,
    end: 0,
    value: "Fresh content",
  });
  expect(
    slideTextValue(
      reopen(changed).document.slides[1]!.objects.find((o) => o.key === objects[1]!.key)!,
    ),
  ).toBe("Fresh content");
});

test("new slide uses the selected custom layout, while duplicate retains content", () => {
  let base = run(deck(), { name: "insert-slide", index: 1 });
  const source = base.document.slides[1]!;
  const title = source.objects.find((o) => o.placeholder === "title")!;
  base = run(base, {
    name: "edit-text",
    slideId: source.id,
    objectKey: title.key,
    start: 0,
    end: 0,
    value: "Original title",
  });
  const result = reopen(run(base, { name: "insert-slide", index: 0, layoutSourceId: source.id }));
  expect(
    result.document.slides[0]!.objects.filter((o) => o.layer === "slide").map((o) => o.transform.x),
  ).toEqual([75, 550]);
  expect(result.document.slides[0]!.objects.every((o) => slideTextValue(o) === "")).toBe(true);
  const duplicate = reopen(run(base, { name: "insert-slide", index: 2, sourceId: source.id }));
  expect(duplicate.document.slides[2]!.title).toBe("Original title");
  expect(() =>
    run(base, { name: "insert-slide", index: 2, sourceId: source.id, layoutSourceId: source.id }),
  ).toThrow();
});

test("locally authored layouts continue on a new slide without copying content", () => {
  for (const layout of ["blank", "title", "title-content", "two-content"] as const) {
    let base = createPresentation();
    const slideId = base.document.slides[0]!.id;
    base = run(base, { name: "layout", slideId, layout });
    const session = new PresentationEditingSession(base);
    session.execute({ name: "insert-slide", index: 1, layoutSourceId: slideId });
    const objects = reopen(session.artifact).document.slides[1]!.objects;
    expect(objects.filter((o) => o.layer === "slide")).toHaveLength(
      layout === "blank" ? 0 : layout === "two-content" ? 3 : 2,
    );
    expect(objects.every((o) => slideTextValue(o) === "")).toBe(true);
    expect(session.undo().bytes()).toEqual(base.bytes());
    expect(session.redo().document.slides).toHaveLength(2);
  }
});

test("layout source identities rebase and deleted layout sources conflict", () => {
  const base = deck();
  const slideId = base.document.slides[0]!.id;
  const commands = [
    { name: "insert-slide", index: 1, layoutSourceId: slideId },
    { name: "insert-slide", index: 2, layoutSourceId: "257" },
  ] as const;
  const remote = run(base, { name: "insert-slide", index: 1 });
  const result = rebasePresentationCommands(base, remote, commands, []);
  expect(result.artifact.document.slides).toHaveLength(4);
  expect(result.commands[1]).toMatchObject({ layoutSourceId: "258" });
  const deletion = { name: "delete-slide", slideId } as const;
  const removed = run(remote, deletion);
  expect(() => rebasePresentationCommands(remote, removed, [commands[0]], [deletion])).toThrow(
    "local edits are retained",
  );
});

test("new layout placeholders retain Strict namespaces through export", () => {
  const base = deck();
  const pkg = base.document.package;
  const changes = new Map<string, Uint8Array>();
  for (const part of pkg.parts) {
    if (!part.name.value.endsWith(".xml") && !part.name.value.endsWith(".rels")) continue;
    const value = new TextDecoder()
      .decode(pkg.readPart(part))
      .replaceAll(P, "http://purl.oclc.org/ooxml/presentationml/main")
      .replaceAll(A, "http://purl.oclc.org/ooxml/drawingml/main")
      .replaceAll(R, "http://purl.oclc.org/ooxml/officeDocument/relationships");
    changes.set(part.name.value, encoder.encode(value));
  }
  const strict = openPresentationArtifact(saveOpcPackage(pkg, changes));
  const result = reopen(run(strict, { name: "insert-slide", index: 1 }));
  expect(result.document.conformance).toBe("strict");
  expect(result.document.slides[1]!.objects.filter((o) => o.layer === "slide")).toHaveLength(2);
  expect(result.document.slides[1]!.objects[1]!.transform.x).toBe(550);
});

test("changing an imported slide layout controls subsequent slides and reuses the authored layout", () => {
  const base = run(deck(), { name: "insert-slide", index: 1 });
  const slideId = base.document.slides[1]!.id;
  const changed = run(base, { name: "layout", slideId, layout: "two-content" });
  const repeated = run(changed, { name: "layout", slideId, layout: "two-content" });
  expect(repeated.document.package.parts.length).toBe(changed.document.package.parts.length);
  const result = reopen(run(repeated, { name: "insert-slide", index: 2, layoutSourceId: slideId }));
  expect(
    result.document.slides[2]!.objects.filter((o) => o.layer === "slide").map((o) => o.placeholder),
  ).toEqual(["title", "obj", "obj"]);
  // Existing imported layout parts are preserved for other slides.
  const originalLayout = base.document.package.getPart("/ppt/slideLayouts/custom.xml")!;
  expect(
    result.document.package.readPart(result.document.package.getPart(originalLayout.name)!),
  ).toEqual(base.document.package.readPart(originalLayout));
});

test("new slides respect an explicit Blank layout while preserving the source title", () => {
  let base = createPresentation();
  const slideId = base.document.slides[0]!.id;
  base = run(base, { name: "layout", slideId, layout: "title-content" });
  const title = base.document.slides[0]!.objects.find((o) => o.placeholder === "title")!;
  base = run(base, {
    name: "edit-text",
    slideId,
    objectKey: title.key,
    start: 0,
    end: 0,
    value: "Keep this title",
  });
  base = reopen(run(base, { name: "layout", slideId, layout: "blank" }));
  const result = reopen(run(base, { name: "insert-slide", index: 1, layoutSourceId: slideId }));
  expect(result.document.slides[0]!.title).toBe("Keep this title");
  expect(result.document.slides[1]!.objects.filter((o) => o.layer === "slide")).toHaveLength(0);
});
