import { describe, expect, test } from "bun:test";
import {
  openPresentationArtifact,
  openPresentationEditingSession,
  openPresentationDocument,
} from "../src/index.ts";
import {
  beginPackageTransaction,
  openOpcPackage,
  openZipArchive,
  writeZipArchiveChanges,
} from "@tumblerjs/opc";
import { OOXML_NAMESPACES } from "@tumblerjs/ooxml";
import { transformPoint, shapeMatrix } from "../src/geometry.ts";

const fixture = async (name = "workspace-brief") =>
  new Uint8Array(
    await Bun.file(
      new URL(
        `../../../apps/docs/static/samples/${name}.pptx`,
        import.meta.url,
      ),
    ).arrayBuffer(),
  );
function rewrite(
  bytes: Uint8Array,
  part: string,
  edit: (xml: string) => string,
) {
  const pkg = openOpcPackage(bytes),
    transaction = beginPackageTransaction(pkg);
  transaction.replacePart(
    part,
    new TextEncoder().encode(
      edit(new TextDecoder().decode(pkg.readPart(pkg.getPart(part)!))),
    ),
  );
  return transaction.commit();
}
const contents = (
  object: ReturnType<
    typeof openPresentationDocument
  >["slides"][number]["objects"][number],
) =>
  object.text?.paragraphs
    .flatMap((paragraph) => paragraph.runs.map((run) => run.text))
    .join("");

function unchangedParts(
  before: Uint8Array,
  after: Uint8Array,
  changed: string,
) {
  const original = openOpcPackage(before),
    edited = openOpcPackage(after);
  expect(edited.parts.map((part) => part.name.value)).toEqual(
    original.parts.map((part) => part.name.value),
  );
  for (const part of original.parts)
    if (part.name.value !== changed)
      expect(edited.readPart(edited.getPart(part.name)!)).toEqual(
        original.readPart(part),
      );
}

describe("PresentationML opening and preservation", () => {
  test("renders all generated decks, inherited decorations, images, groups, and charts", async () => {
    const brief = openPresentationDocument(await fixture());
    expect([brief.width, brief.height]).toEqual([1280, 720]);
    expect(brief.slides.map((slide) => slide.title)).toEqual([
      "A quieter workspace",
      "Working principles",
      "Progress at a glance",
    ]);
    expect(
      brief.slides[0]!.objects.some(
        (object) =>
          object.layer === "layout" && contents(object)?.includes("FIELDNOTES"),
      ),
    ).toBe(true);
    expect(
      brief.slides[2]!.objects.some(
        (object) => object.chart?.status === "supported",
      ),
    ).toBe(true);
    const pictures = openPresentationDocument(
      await fixture("shapes-and-pictures"),
    );
    expect(pictures.width / pictures.height).toBeCloseTo(4 / 3);
    expect(
      pictures.slides[1]!.objects.some((object) => object.image?.bytes.length),
    ).toBe(true);
    const compatibility = openPresentationDocument(
      await fixture("compatibility-deck"),
    );
    const table = compatibility.slides[0]!.objects.find(
      (object) => object.table,
    )!;
    expect(table.kind).toBe("table");
    expect(table.table!.cells).toHaveLength(9);
    expect(table.table!.cells[0]!.text!.paragraphs[0]!.runs[0]!.text).toBe(
      "Milestone",
    );
    expect(table.table!.cells[0]!.borders[0]!.width).toBeCloseTo(4 / 3);
    expect(table.movable).toBe(true);
    const grouped = compatibility.slides[1]!.objects.find(
      (object) => object.name === "Grouped rectangle",
    )!;
    expect(grouped.movable).toBe(true);
    expect(grouped.restriction).toBeUndefined();
    expect(transformPoint(grouped.matrix, 0, 0)).toEqual({ x: 576, y: 403.2 });
    expect(grouped.matrix[3]).toBe(1.5);
  });
  test("no-op export is byte-identical; text edit preserves all unrelated parts including notes", async () => {
    const bytes = await fixture("compatibility-deck"),
      artifact = openPresentationArtifact(bytes);
    expect(artifact.bytes()).toBe(bytes);
    const slide = artifact.document.slides[0]!,
      title = slide.objects.find(
        (object) => contents(object) === "Content we preserve",
      )!;
    const edited = artifact.replaceText(
      slide.id,
      title.key,
      "  New & <preserved> title  ",
    );
    expect(edited.document.slides[0]!.title).toBe(
      "  New & <preserved> title  ",
    );
    unchangedParts(bytes, edited.bytes(), slide.part);
    expect(
      artifact.replaceText(slide.id, title.key, "Content we preserve"),
    ).toBe(artifact);
  });
  test("geometry edits survive reopening, preserve other parts, and form one undo step", async () => {
    const bytes = await fixture(),
      session = openPresentationEditingSession(bytes);
    const slide = session.artifact.document.slides[0]!,
      title = slide.objects.find((object) => contents(object) === slide.title)!;
    const change = {
      slideId: slide.id,
      objectKey: title.key,
      ...title.transform,
      x: title.transform.x + 25,
      width: title.transform.width - 30,
    };
    session.updateObject(change);
    const edited = openPresentationDocument(
      session.artifact.bytes(),
    ).slides[0]!.objects.find((object) => object.key === title.key)!;
    expect(edited.transform.x).toBeCloseTo(change.x, 3);
    expect(edited.transform.width).toBeCloseTo(change.width, 3);
    unchangedParts(bytes, session.artifact.bytes(), slide.part);
    expect(session.canUndo).toBe(true);
    session.undo();
    expect(session.artifact.bytes()).toBe(bytes);
    expect(session.dirty).toBe(false);
    session.redo();
    expect(session.dirty).toBe(true);
    expect(() => session.updateObject({ ...change, width: NaN })).toThrow();
  });
  test("slide relationship order, hidden state, and configured limits are enforced", async () => {
    const bytes = await fixture();
    const reordered = rewrite(bytes, "/ppt/presentation.xml", (xml) =>
      xml.replace(
        /<p:sldIdLst>(.*?)<\/p:sldIdLst>/,
        (_, list: string) =>
          `<p:sldIdLst>${list
            .match(/<p:sldId\b[^>]*\/>/g)!
            .reverse()
            .join("")}</p:sldIdLst>`,
      ),
    );
    expect(openPresentationDocument(reordered).slides[0]!.title).toBe(
      "Progress at a glance",
    );
    expect(() => openPresentationDocument(bytes, { maxSlides: 2 })).toThrow(
      "Too many slides",
    );
    expect(() => openPresentationDocument(bytes, { maxObjects: 2 })).toThrow(
      "Too many presentation objects",
    );
    expect(() =>
      openPresentationDocument(bytes, { maxTextCharacters: 10 }),
    ).toThrow("Too much presentation text");
    const hidden = rewrite(bytes, "/ppt/slides/slide1.xml", (xml) =>
      xml.replace("<p:sld ", '<p:sld show="0" '),
    );
    expect(openPresentationDocument(hidden).slides[0]!.hidden).toBe(true);
  });
  test("duplicate IDs are rejected even across groups", async () => {
    const bytes = await fixture("compatibility-deck");
    const broken = rewrite(bytes, "/ppt/slides/slide2.xml", (xml) =>
      xml.replace(
        /id="\d+" name="Grouped rectangle"/,
        'id="900" name="Grouped rectangle"',
      ),
    );
    expect(() => openPresentationDocument(broken)).toThrow(
      "duplicate shape identity",
    );
  });
  test("legacy whole-box text replacement and inherited geometry reject unsafe edits", async () => {
    const artifact = openPresentationArtifact(
      await fixture("shapes-and-pictures"),
    );
    const slide = artifact.document.slides[0]!;
    for (const object of slide.objects.filter(
      (object) => object.layer !== "slide",
    )) {
      expect(() =>
        artifact.updateObject({
          slideId: slide.id,
          objectKey: object.key,
          ...object.transform,
          x: 12,
        }),
      ).toThrow();
    }
    const rich = slide.objects.find(
      (object) => contents(object) === "One line, two weights.",
    )!;
    expect(rich.text?.paragraphs[0]?.runs.map((run) => run.bold)).toEqual([
      false,
      true,
    ]);
    expect(() => artifact.replaceText(slide.id, rich.key, "flat")).toThrow();
  });
  test("strict namespaces follow the same relationship graph", async () => {
    const archive = openZipArchive(await fixture());
    const replacements = new Map<string, Uint8Array>();
    for (const entry of archive.entries.filter((entry) =>
      /\.(xml|rels)$/.test(entry.name),
    )) {
      let xml = new TextDecoder().decode(archive.read(entry));
      for (const key of ["presentation", "drawing", "chart"] as const)
        xml = xml.replaceAll(
          OOXML_NAMESPACES.transitional[key],
          OOXML_NAMESPACES.strict[key],
        );
      xml = xml.replaceAll(
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
        "http://purl.oclc.org/ooxml/officeDocument/relationships",
      );
      replacements.set(entry.name, new TextEncoder().encode(xml));
    }
    const doc = openPresentationDocument(
      writeZipArchiveChanges(archive, { replacements }),
    );
    expect(doc.conformance).toBe("strict");
    expect(doc.slides[0]!.title).toBe("A quieter workspace");
  });
  test("placeholder geometry and text defaults inherit from the matched layout", async () => {
    let bytes: Uint8Array = await fixture();
    const pkg = openOpcPackage(bytes);
    const slideXml = new TextDecoder().decode(
      pkg.readPart(pkg.getPart("/ppt/slides/slide1.xml")!),
    );
    const original = slideXml.match(/<p:sp>[\s\S]*?<\/p:sp>/)![0];
    const placeholder = original.replace(
      "<p:nvPr></p:nvPr>",
      '<p:nvPr><p:ph type="title" idx="7"/></p:nvPr>',
    );
    const inherited = placeholder
      .replace(/<p:cNvPr id="\d+"/, '<p:cNvPr id="99"')
      .replace(
        "<a:lstStyle/>",
        '<a:lstStyle><a:lvl1pPr><a:defRPr sz="3600" b="1"/></a:lvl1pPr></a:lstStyle>',
      );
    bytes = rewrite(bytes, "/ppt/slideLayouts/slideLayout2.xml", (xml) =>
      xml.replace("</p:spTree>", inherited + "</p:spTree>"),
    );
    const local = placeholder
      .replace(/<a:xfrm[\s\S]*?<\/a:xfrm>/, "")
      .replace(/ sz="\d+"/g, "");
    bytes = rewrite(bytes, "/ppt/slides/slide1.xml", (xml) =>
      xml.replace(original, local),
    );
    const artifact = openPresentationArtifact(bytes),
      title = artifact.document.slides[0]!.objects.find(
        (object) => contents(object) === "A quieter workspace",
      )!;
    expect(title.layer).toBe("slide");
    expect(title.transform.x).toBeCloseTo(57.6);
    expect(title.transform.width).toBeCloseTo(844.8);
    expect(title.text!.paragraphs[0]!.runs[0]!.fontSize).toBe(48);
    expect(title.movable).toBe(true);
    expect(title.textEditable).toBe(true);
    const slide = artifact.document.slides[0]!;
    const moved = artifact.updateObject({
      slideId: slide.id,
      objectKey: title.key,
      ...title.transform,
      x: title.transform.x + 25,
    });
    const reopened = openPresentationArtifact(
      moved.bytes(),
    ).document.slides[0]!.objects.find((o) => o.key === title.key)!;
    expect(reopened.transform.x).toBeCloseTo(title.transform.x + 25);
    expect(reopened.transform.width).toBe(title.transform.width);
    expect(reopened.text!.paragraphs[0]!.runs[0]!.fontSize).toBe(48);
    unchangedParts(bytes, moved.bytes(), slide.part);
  });
  test("MCE fallback selection preserves the unselected branch during another edit", async () => {
    const bytes = rewrite(await fixture(), "/ppt/slides/slide1.xml", (xml) =>
      xml.replace(
        /<p:sp>[\s\S]*?<\/p:sp>/,
        (shape) =>
          `<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:u="urn:tumbler:unsupported"><mc:Choice Requires="u"><u:original keep="yes"/></mc:Choice><mc:Fallback>${shape}</mc:Fallback></mc:AlternateContent>`,
      ),
    );
    const artifact = openPresentationArtifact(bytes),
      slide = artifact.document.slides[0]!;
    const fallback = slide.objects.find(
      (object) => contents(object) === "A quieter workspace",
    )!;
    expect(fallback.movable).toBe(false);
    const other = slide.objects.find((object) => object.textEditable)!;
    const edited = artifact.replaceText(
      slide.id,
      other.key,
      "Edited beside fallback",
    );
    const pkg = edited.document.package;
    expect(
      new TextDecoder().decode(pkg.readPart(pkg.getPart(slide.part)!)),
    ).toContain('<u:original keep="yes"/>');
    unchangedParts(bytes, edited.bytes(), slide.part);
  });
  test("horizontal lines can move without acquiring a height", async () => {
    const bytes = rewrite(await fixture(), "/ppt/slides/slide1.xml", (xml) =>
      xml.replace(/<p:sp>[\s\S]*?<\/p:sp>/, (shape) =>
        shape
          .replace('prst="rect"', 'prst="line"')
          .replace(/(<a:ext cx="\d+" cy=")\d+/, "$10"),
      ),
    );
    const artifact = openPresentationArtifact(bytes),
      slide = artifact.document.slides[0]!;
    const line = slide.objects.find(
      (object) => object.layer === "slide" && object.geometry === "line",
    )!;
    const edited = artifact.updateObject({
      slideId: slide.id,
      objectKey: line.key,
      ...line.transform,
      x: line.transform.x + 5,
    });
    const result = edited.document.slides[0]!.objects.find(
      (object) => object.key === line.key,
    )!;
    expect(result.transform.height).toBe(0);
    expect(result.transform.x).toBeCloseTo(line.transform.x + 5);
  });
  test("table merges preserve cell geometry and reject malformed grids", async () => {
    const original = await fixture("compatibility-deck");
    const merged = rewrite(original, "/ppt/slides/slide1.xml", (xml) => {
      let cell = 0;
      return xml.replace(/<a:tc>/g, (tag) => {
        cell++;
        return cell === 1
          ? '<a:tc gridSpan="2" rowSpan="2">'
          : [2, 4, 5].includes(cell)
            ? `<a:tc ${cell === 2 ? 'hMerge="1"' : cell === 4 ? 'vMerge="1"' : 'hMerge="1" vMerge="1"'}>`
            : tag;
      });
    });
    const artifact = openPresentationArtifact(merged);
    const slide = artifact.document.slides[0]!;
    const table = slide.objects.find((object) => object.table)!.table!;
    expect(table.cells).toHaveLength(6);
    expect(table.cells[0]!.width).toBeCloseTo(640);
    expect(table.cells[0]!.height).toBeCloseTo(115.2);
    expect(table.cells[1]!.column).toBe(2);
    const title = slide.objects.find((object) => object.textEditable)!;
    const edited = artifact.replaceText(
      slide.id,
      title.key,
      "Table still intact",
    );
    expect(
      edited.document.slides[0]!.objects.find((object) => object.table)!.table,
    ).toEqual(table);
    const broken = rewrite(original, "/ppt/slides/slide1.xml", (xml) =>
      xml.replace("<a:tc>", '<a:tc gridSpan="99">'),
    );
    expect(() => openPresentationDocument(broken)).toThrow(
      "Invalid table merge",
    );
  });
  test("rotation and mirroring keep the shape centre fixed", () => {
    for (const rotation of [0, 18, 90, 180, 270])
      for (const flipH of [false, true]) {
        const point = transformPoint(
          shapeMatrix({
            x: 20,
            y: 30,
            width: 200,
            height: 80,
            rotation,
            flipH,
            flipV: false,
          }),
          100,
          40,
        );
        expect(point.x).toBeCloseTo(120);
        expect(point.y).toBeCloseTo(70);
      }
  });
});
