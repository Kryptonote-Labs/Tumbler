import { expect, test } from "bun:test";
import { beginPackageTransaction, openOpcPackage } from "@tumblerjs/opc";
import { openPresentationDocument } from "../src/index.ts";
const encoder = new TextEncoder();
const fixture = () =>
  Bun.file(
    new URL(
      "../../../apps/docs/static/samples/workspace-brief.pptx",
      import.meta.url,
    ),
  ).bytes();
const contents = (pkg: ReturnType<typeof openOpcPackage>, name: string) =>
  new TextDecoder().decode(pkg.readPart(pkg.getPart(name)!));
test("layout theme overrides replace supplied schemes while retaining other theme components", async () => {
  const pkg = openOpcPackage(await fixture()),
    tx = beginPackageTransaction(pkg);
  const base = contents(pkg, "/ppt/theme/theme1.xml");
  const font = base
    .match(/<a:fontScheme[\s\S]*?<\/a:fontScheme>/)![0]
    .replace(/<a:latin[^>]*\/>/g, '<a:latin typeface="Georgia"/>');
  tx.addPart(
    "/ppt/theme/override.xml",
    "application/vnd.openxmlformats-officedocument.themeOverride+xml",
    encoder.encode(
      `<a:themeOverride xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${font}</a:themeOverride>`,
    ),
  );
  tx.addRelationship("/ppt/slideLayouts/slideLayout2.xml", {
    id: "themeOverride",
    type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/themeOverride",
    target: "/ppt/theme/override.xml",
  });
  const slide = contents(pkg, "/ppt/slides/slide1.xml").replace(
    /<a:latin[^>]*\/>/g,
    '<a:latin typeface="+mn-lt"/>',
  );
  tx.replacePart("/ppt/slides/slide1.xml", encoder.encode(slide));
  const doc = openPresentationDocument(tx.commit());
  expect(
    doc.slides[0]!.objects.flatMap(
      (o) => o.text?.paragraphs.flatMap((p) => p.runs) ?? [],
    ).some((r) => r.fontFamily === "Georgia"),
  ).toBe(true);
  expect(doc.slides[0]!.background).toBe(
    openPresentationDocument(await fixture()).slides[0]!.background,
  );
});
test("normal autofit applies saved line spacing reduction and preserves overflow modes", async () => {
  const pkg = openOpcPackage(await fixture()),
    tx = beginPackageTransaction(pkg);
  tx.replacePart(
    "/ppt/slides/slide1.xml",
    encoder.encode(
      contents(pkg, "/ppt/slides/slide1.xml").replace(
        /<a:bodyPr[^>]*(?:\/>|>[\s\S]*?<\/a:bodyPr>)/g,
        '<a:bodyPr horzOverflow="clip" vertOverflow="ellipsis"><a:normAutofit fontScale="80000" lnSpcReduction="20000"/></a:bodyPr>',
      ),
    ),
  );
  const text = openPresentationDocument(tx.commit()).slides[0]!.objects.find(
    (o) => o.layer === "slide" && o.text,
  )!.text!;
  expect(text.autoFit).toBe("normal");
  expect(text.verticalOverflow).toBe("ellipsis");
  expect(text.horizontalOverflow).toBe("clip");
  expect(text.paragraphs[0]!.lineHeight).toBe(0.8);
});
test("mixed-script runs use their authored Latin, East Asian and complex-script fonts", async () => {
  const pkg = openOpcPackage(await fixture()),
    tx = beginPackageTransaction(pkg);
  tx.replacePart(
    "/ppt/slides/slide1.xml",
    encoder.encode(
      contents(pkg, "/ppt/slides/slide1.xml").replace(
        /<a:r>[\s\S]*?<\/a:r>/,
        '<a:r><a:rPr lang="ja-JP"><a:latin typeface="Arial"/><a:ea typeface="Yu Gothic"/><a:cs typeface="Amiri"/></a:rPr><a:t>Hello 日本語 مرحبا</a:t></a:r>',
      ),
    ),
  );
  const runs = openPresentationDocument(tx.commit()).slides[0]!.objects.find(
    (o) => o.layer === "slide" && o.text,
  )!.text!.paragraphs[0]!.runs;
  expect(runs.map((r) => r.fontFamily)).toEqual([
    "Arial",
    "Yu Gothic",
    "Amiri",
  ]);
  expect(runs.map((r) => r.text).join("")).toBe("Hello 日本語 مرحبا");
});
test("paragraphs retain custom tabs and distributed alignment", async () => {
  const pkg = openOpcPackage(await fixture()),
    tx = beginPackageTransaction(pkg);
  tx.replacePart(
    "/ppt/slides/slide1.xml",
    encoder.encode(
      contents(pkg, "/ppt/slides/slide1.xml").replace(
        /<a:pPr[^>]*(?:\/>|>[\s\S]*?<\/a:pPr>)/g,
        '<a:pPr algn="dist" marR="95250"><a:tabLst><a:tab pos="1905000" algn="dec"/><a:tab pos="952500" algn="r"/></a:tabLst></a:pPr>',
      ),
    ),
  );
  const p = openPresentationDocument(tx.commit()).slides[0]!.objects.find(
    (o) => o.layer === "slide" && o.text,
  )!.text!.paragraphs[0]!;
  expect(p.tabs).toEqual([
    { position: 100, alignment: "r" },
    { position: 200, alignment: "dec" },
  ]);
  expect(p.distributed).toBe(true);
  expect(p.marginRight).toBe(10);
});
test("uncompressed EOT fonts expose their original SFNT bytes", async () => {
  const { embeddedFontBytes } = await import("../src/embedded-fonts.ts");
  const sfnt = new Uint8Array([0, 1, 0, 0, 0, 0, 0, 0]);
  const eot = new Uint8Array(90);
  const v = new DataView(eot.buffer);
  v.setUint32(0, 90, true);
  v.setUint32(4, 8, true);
  v.setUint16(34, 0x504c, true);
  eot.set(sfnt, 82);
  expect(embeddedFontBytes(eot)).toEqual(sfnt);
  v.setUint32(12, 4, true);
  expect(embeddedFontBytes(eot)).toBeUndefined();
});
test("media references resolve internal r:link sources without fetching external URLs", async () => {
  const { readPresentationMedia } = await import("../src/media.ts");
  const { parseLosslessXml } = await import("@tumblerjs/ooxml");
  const pkg = openOpcPackage(await fixture()),
    tx = beginPackageTransaction(pkg);
  tx.addPart("/ppt/media/test.mp4", "video/mp4", new Uint8Array([0, 1, 2]));
  tx.addRelationship("/ppt/slides/slide1.xml", {
    id: "video1",
    type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/video",
    target: "/ppt/media/test.mp4",
  });
  const updated = openOpcPackage(tx.commit());
  const xml = parseLosslessXml(
    encoder.encode(
      '<a:videoFile xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:link="video1"/>',
    ),
  );
  const media = readPresentationMedia(
    updated,
    "/ppt/slides/slide1.xml",
    xml.elements(),
  );
  expect(media?.kind).toBe("video");
  expect(media?.bytes).toEqual(new Uint8Array([0, 1, 2]));
  expect(media?.url).toBeUndefined();
});
test("SVG picture fills retain crop and tile placement for shapes and backgrounds", async () => {
  const pkg = openOpcPackage(await fixture()),
    tx = beginPackageTransaction(pkg);
  tx.addPart(
    "/ppt/media/tile.svg",
    "image/svg+xml",
    encoder.encode(
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="10" height="20" fill="green"/></svg>',
    ),
  );
  tx.addRelationship("/ppt/slides/slide1.xml", {
    id: "tileImage",
    type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image",
    target: "/ppt/media/tile.svg",
  });
  const fill =
    '<a:blipFill><a:blip r:embed="tileImage"/><a:srcRect l="10000"/><a:tile tx="95250" sx="50000" sy="100000" algn="ctr" flip="xy"/></a:blipFill>';
  let xml = contents(pkg, "/ppt/slides/slide1.xml").replace(
    "<p:spPr>",
    "<p:spPr>" + fill,
  );
  xml = xml.replace(
    /<p:bg>[\s\S]*?<\/p:bg>/,
    "<p:bg><p:bgPr>" + fill + "</p:bgPr></p:bg>",
  );
  tx.replacePart("/ppt/slides/slide1.xml", encoder.encode(xml));
  const slide = openPresentationDocument(tx.commit()).slides[0]!;
  const picture = slide.objects.find((o) => o.pictureFill)!.pictureFill!;
  expect(picture.contentType).toBe("image/svg+xml");
  expect(picture.crop[0]).toBe(0.1);
  expect(picture.tile).toMatchObject({
    x: 10,
    scaleX: 0.5,
    flip: "xy",
    align: "ctr",
  });
});
test("drawing patterns and supported effects retain authored parameters", async () => {
  const pkg = openOpcPackage(await fixture()),
    tx = beginPackageTransaction(pkg);
  tx.replacePart(
    "/ppt/slides/slide1.xml",
    encoder.encode(
      contents(pkg, "/ppt/slides/slide1.xml").replace(
        "<p:spPr>",
        '<p:spPr><a:pattFill prst="diagCross"><a:fgClr><a:srgbClr val="FF0000"/></a:fgClr><a:bgClr><a:srgbClr val="FFFFFF"/></a:bgClr></a:pattFill><a:effectLst><a:glow rad="95250"><a:srgbClr val="00FF00"/></a:glow><a:softEdge rad="19050"/></a:effectLst>',
      ),
    ),
  );
  const shape = openPresentationDocument(tx.commit()).slides[0]!.objects.find(
    (o) => o.pattern,
  )!;
  expect(shape.pattern?.preset).toBe("diagCross");
  expect(shape.effects?.map((e) => [e.kind, e.radius])).toEqual([
    ["glow", 5],
    ["softEdge", 1],
  ]);
});
test("SmartArt saved drawing parts render at the graphic frame scale and remain read-only", async () => {
  const pkg = openOpcPackage(await fixture()),
    tx = beginPackageTransaction(pkg);
  const diagram = "http://schemas.microsoft.com/office/drawing/2008/diagram",
    drawing = "http://schemas.openxmlformats.org/drawingml/2006/main";
  tx.addPart(
    "/ppt/diagrams/data1.xml",
    "application/vnd.openxmlformats-officedocument.drawingml.diagramData+xml",
    encoder.encode(
      `<dgm:dataModel xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram" xmlns:dsp="${diagram}"><dgm:extLst><a:ext xmlns:a="${drawing}" uri="${diagram}"><dsp:dataModelExt relId="cached"/></a:ext></dgm:extLst></dgm:dataModel>`,
    ),
  );
  tx.addPart(
    "/ppt/diagrams/drawing1.xml",
    "application/vnd.ms-office.drawingml.diagramDrawing+xml",
    encoder.encode(
      `<dsp:drawing xmlns:dsp="${diagram}" xmlns:a="${drawing}"><dsp:spTree><dsp:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="952500" cy="952500"/><a:chOff x="0" y="0"/><a:chExt cx="952500" cy="952500"/></a:xfrm></dsp:grpSpPr><dsp:sp><dsp:nvSpPr><dsp:cNvPr id="2" name="Cached node"/><dsp:cNvSpPr/><dsp:nvPr/></dsp:nvSpPr><dsp:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="952500" cy="952500"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="008800"/></a:solidFill></dsp:spPr></dsp:sp></dsp:spTree></dsp:drawing>`,
    ),
  );
  tx.addRelationship("/ppt/diagrams/data1.xml", {
    id: "cached",
    type: "http://schemas.microsoft.com/office/2007/relationships/diagramDrawing",
    target: "/ppt/diagrams/drawing1.xml",
  });
  tx.addRelationship("/ppt/slides/slide1.xml", {
    id: "diagram",
    type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramData",
    target: "/ppt/diagrams/data1.xml",
  });
  const frame =
    '<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="90" name="Diagram"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="952500" y="952500"/><a:ext cx="1905000" cy="952500"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/diagram"><dgm:relIds xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram" r:dm="diagram"/></a:graphicData></a:graphic></p:graphicFrame>';
  tx.replacePart(
    "/ppt/slides/slide1.xml",
    encoder.encode(
      contents(pkg, "/ppt/slides/slide1.xml").replace(
        "</p:spTree>",
        frame + "</p:spTree>",
      ),
    ),
  );
  const node = openPresentationDocument(tx.commit()).slides[0]!.objects.find(
    (o) => o.name === "Cached node",
  )!;
  expect(node).toBeDefined();
  expect(node.matrix).toEqual([2, 0, 0, 1, 100, 100]);
  expect(node.movable).toBe(false);
  expect(node.drawingGeometry?.paths.length).toBeGreaterThan(0);
});
test("click and after-effect timing retains ordered delays and transition metadata", async () => {
  const { readSlideTiming } = await import("../src/timing.ts");
  const { parseLosslessXml } = await import("@tumblerjs/ooxml");
  const effect = (id: number, type: string, duration: number) =>
    `<p:par><p:cTn id="${id}" nodeType="${type}"><p:childTnLst><p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="${id + 10}" dur="${duration}"/><p:tgtEl><p:spTgt spid="2"/></p:tgtEl></p:cBhvr></p:animEffect></p:childTnLst></p:cTn></p:par>`;
  const xml = parseLosslessXml(
    encoder.encode(
      `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:transition spd="fast" advTm="2000"><p:fade/></p:transition><p:timing><p:tnLst>${effect(1, "clickEffect", 300)}${effect(2, "afterEffect", 200)}${effect(3, "clickEffect", 500)}</p:tnLst></p:timing></p:sld>`,
    ),
  );
  const timing = readSlideTiming(xml.root);
  expect(timing.animations.map((e) => [e.step, e.delay, e.duration])).toEqual([
    [1, 0, 300],
    [1, 300, 200],
    [2, 0, 500],
  ]);
  expect(timing.transition).toMatchObject({
    kind: "fade",
    duration: 500,
    advanceAfter: 2000,
  });
});
