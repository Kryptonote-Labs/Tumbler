import { expect, test } from "bun:test";
import {
  applyPresentationCommand as run,
  createPresentation,
  openPresentationArtifact,
  slideTextValue,
} from "../src/index.ts";
const encode = (a: ReturnType<typeof createPresentation>) =>
  Buffer.from(a.bytes()).toString("base64");
test("cut and paste between slides retains shape text, geometry, fill and outline", () => {
  let a = createPresentation();
  const sourceSlideId = a.document.slides[0]!.id;
  a = run(a, {
    name: "insert-object",
    slideId: sourceSlideId,
    bounds: { x: 70, y: 80, width: 300, height: 100 },
    object: {
      kind: "shape",
      geometry: "ellipse",
      text: "Keep & preserve",
      fill: "#123456",
      stroke: "#FF0000",
    },
  });
  const object = a.document.slides[0]!.objects[0]!,
    source = encode(a);
  a = run(a, { name: "delete-object", slideId: sourceSlideId, objectKey: object.key });
  a = run(a, { name: "insert-slide", index: 1 });
  const dest = a.document.slides[1]!.id;
  a = run(a, { name: "paste-object", slideId: dest, source, sourceSlideId, objectKey: object.key });
  const result = openPresentationArtifact(a.bytes()).document.slides[1]!.objects[0]!;
  expect(slideTextValue(result)).toBe("Keep & preserve");
  expect(result.transform).toEqual(object.transform);
  expect(result.fill).toBe(object.fill);
  expect(result.stroke).toBe(object.stroke);
  expect(result.geometry).toBe("ellipse");
  expect(a.document.slides[0]!.objects).toHaveLength(0);
});
test("pasting pictures copies original resources without depending on the source deck", () => {
  let a = createPresentation();
  const sourceSlideId = a.document.slides[0]!.id;
  const data =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=";
  a = run(a, {
    name: "insert-object",
    slideId: sourceSlideId,
    bounds: { x: 10, y: 10, width: 100, height: 100 },
    object: { kind: "image", contentType: "image/png", data },
  });
  let destination = createPresentation();
  const dest = destination.document.slides[0]!.id;
  for (let i = 0; i < 2; i++)
    destination = run(destination, {
      name: "paste-object",
      slideId: dest,
      source: encode(a),
      sourceSlideId,
      objectKey: a.document.slides[0]!.objects[0]!.key,
    });
  const objects = openPresentationArtifact(destination.bytes()).document.slides[0]!.objects;
  expect(objects).toHaveLength(2);
  expect(objects[0]!.image!.bytes).toEqual(a.document.slides[0]!.objects[0]!.image!.bytes);
  expect(objects[0]!.key).not.toBe(objects[1]!.key);
});
test("clipboard keeps source theme colors when the destination theme differs", async () => {
  const { beginPackageTransaction } = await import("@tumblerjs/opc");
  let a = createPresentation();
  const sourceSlideId = a.document.slides[0]!.id;
  a = run(a, {
    name: "insert-object",
    slideId: sourceSlideId,
    bounds: { x: 10, y: 20, width: 100, height: 100 },
    object: { kind: "shape", geometry: "rect", fill: "#123456" },
  });
  const pkg = a.document.package,
    theme = pkg.getPart("/ppt/theme/theme1.xml")!,
    part = pkg.getPart(a.document.slides[0]!.part)!;
  const tx = beginPackageTransaction(pkg);
  tx.replacePart(
    theme.name,
    new TextEncoder().encode(
      new TextDecoder()
        .decode(pkg.readPart(theme))
        .replace('<a:accent1><a:srgbClr val="156082"/>', '<a:accent1><a:srgbClr val="112233"/>'),
    ),
  );
  tx.replacePart(
    part.name,
    new TextEncoder().encode(
      new TextDecoder()
        .decode(pkg.readPart(part))
        .replace('<a:srgbClr val="123456"/>', '<a:schemeClr val="accent1"/>'),
    ),
  );
  a = openPresentationArtifact(tx.commit());
  let destination = createPresentation();
  destination = run(destination, {
    name: "paste-object",
    slideId: destination.document.slides[0]!.id,
    source: encode(a),
    sourceSlideId,
    objectKey: a.document.slides[0]!.objects[0]!.key,
  });
  expect(destination.document.slides[0]!.objects[0]!.fill).toBe(
    a.document.slides[0]!.objects[0]!.fill,
  );
});
test("pasting a layout-inherited text frame into a blank slide keeps its position and typography", async () => {
  let source = openPresentationArtifact(
    await Bun.file(
      new URL("../../../apps/docs/static/samples/workspace-brief.pptx", import.meta.url),
    ).bytes(),
  );
  const {beginPackageTransaction}=await import('@tumblerjs/opc');
  const pkg=source.document.package,part=pkg.getPart('/ppt/slides/slide1.xml')!,layout=pkg.getPart('/ppt/slideLayouts/slideLayout2.xml')!;
  const content=new TextDecoder().decode(pkg.readPart(part)),original=content.match(/<p:sp>[\s\S]*?<\/p:sp>/)![0];
  const placeholder=original.replace('<p:nvPr></p:nvPr>','<p:nvPr><p:ph type="title" idx="7"/></p:nvPr>');
  const inherited=placeholder.replace(/<p:cNvPr id="\d+"/,'<p:cNvPr id="99"').replace('<a:lstStyle/>','<a:lstStyle><a:lvl1pPr><a:defRPr sz="3600" b="1"/></a:lvl1pPr></a:lstStyle>');
  const local=placeholder.replace(/<a:xfrm[\s\S]*?<\/a:xfrm>/,'').replace(/ sz="\d+"/g,'');
  const tx=beginPackageTransaction(pkg).replacePart(part.name,new TextEncoder().encode(content.replace(original,local))).replacePart(layout.name,new TextEncoder().encode(new TextDecoder().decode(pkg.readPart(layout)).replace('</p:spTree>',inherited+'</p:spTree>')));
  source=openPresentationArtifact(tx.commit());
  const slide = source.document.slides[0]!,
    object = slide.objects.find((o) => o.layer === "slide" && o.textEditable)!;
  let destination = createPresentation();
  destination = run(destination, {
    name: "paste-object",
    slideId: destination.document.slides[0]!.id,
    source: encode(source),
    sourceSlideId: slide.id,
    objectKey: object.key,
  });
  const copy = destination.document.slides[0]!.objects[0]!;
  expect(copy.transform).toEqual(object.transform);
  expect(slideTextValue(copy)).toBe(slideTextValue(object));
  expect(
    copy.text!.paragraphs.flatMap((p) => p.runs).map((r) => [r.fontSize, r.fontFamily, r.color]),
  ).toEqual(
    object.text!.paragraphs.flatMap((p) => p.runs).map((r) => [r.fontSize, r.fontFamily, r.color]),
  );
});
