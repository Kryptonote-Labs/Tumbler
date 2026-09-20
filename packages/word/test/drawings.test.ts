import { describe, expect, test } from "bun:test";
import { wordParagraphText, layoutWordDocument, openWordArtifact, WordEditingSession } from "../src/index.ts";
import { buildWordDocumentFixture, type WordDocumentFixtureOptions } from "./document-fixture.ts";

const w = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const wp = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing";
const a = "http://schemas.openxmlformats.org/drawingml/2006/main";
const c = "http://schemas.openxmlformats.org/drawingml/2006/chart";
const pic = "http://schemas.openxmlformats.org/drawingml/2006/picture";
const r = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

describe("WordprocessingML drawings", () => {
  test("inline movement preserves text, media, layout, and undo history", () => {
    const artifact = open(drawing("image", `<pic:pic><pic:blipFill><a:blip r:embed="image"/></pic:blipFill></pic:pic>`, "Move me") + '<w:p><w:r><w:t>Hello world</w:t></w:r></w:p>', [
      { id: "image", type: `${r}/image`, target: "media/image.png" },
    ], [{ itemName: "word/media/image.png", contentType: "image/png", xml: "image-bytes" }]);
    const image = [...artifact.document.drawings.values()][0]!;
    const paragraph = artifact.document.blocks[1]!;
    const session = new WordEditingSession(artifact);
    session.updateDrawing({ elementId: image.elementId, widthPoints: 72, heightPoints: 36, inlinePosition: { paragraphElementId: paragraph.elementId, offset: 6 } });
    const moved = session.artifact;
    const destination = moved.document.blocks[1]!;
    if (destination.kind !== "paragraph") throw new Error("Expected paragraph");
    expect(wordParagraphText(moved.document, destination)).toBe("Hello \uFFFCworld");
    expect([...moved.document.drawings.values()]).toMatchObject([{ placement: "inline", widthPoints: 72, altText: "Move me" }]);
    const relocated = [...moved.document.drawings.values()][0]!;
    const again = moved.updateDrawing({ elementId: relocated.elementId, widthPoints: 72, heightPoints: 36, inlinePosition: { paragraphElementId: destination.elementId, offset: 12 } });
    const end = again.document.blocks[1]!;
    if (end.kind !== "paragraph") throw new Error("Expected paragraph");
    expect(wordParagraphText(again.document, end)).toBe("Hello world\uFFFC");
    session.undo();
    expect(session.artifact.bytes()).toEqual(artifact.bytes());
    session.redo();
    expect(session.artifact.bytes()).toEqual(moved.bytes());
  });

  test("resolves embedded images and preserves authored inline geometry", () => {
    const artifact = open(drawing("image", `<pic:pic><pic:blipFill><a:blip r:embed="image"/></pic:blipFill></pic:pic>`, "Image description"), [
      { id: "image", type: `${r}/image`, target: "media/image.png" },
    ], [{ itemName: "word/media/image.png", contentType: "image/png", xml: "image-bytes" }]);
    const image = [...artifact.document.drawings.values()][0];
    expect(image).toMatchObject({ kind: "image", placement: "inline", widthPoints: 72, heightPoints: 36, altText: "Image description", contentType: "image/png" });
    const layout = layoutWordDocument(artifact.document, { measure: () => ({ width: 5, ascent: 8, descent: 2 }) });
    const fragment = layout.pages[0]?.columns[0]?.lines[0]?.fragments[0];
    expect(fragment).toMatchObject({ kind: "drawing", width: 72, height: 36, drawing: { kind: "image" } });
  });

  test("reuses the shared chart parser for Word chart frames", () => {
    const artifact = open(drawing("chart", `<c:chart r:id="chart"/>`, "Sales chart", c), [
      { id: "chart", type: `${r}/chart`, target: "charts/chart1.xml" },
    ], [{ itemName: "word/charts/chart1.xml", contentType: "application/vnd.openxmlformats-officedocument.drawingml.chart+xml", xml: `<c:chartSpace xmlns:c="${c}" xmlns:a="${a}"><c:chart><c:plotArea><c:pieChart/></c:plotArea></c:chart></c:chartSpace>` }]);
    expect([...artifact.document.drawings.values()][0]).toMatchObject({ kind: "chart", model: { status: "supported", kind: "pie" } });
  });

  test("models anchored placement without fetching external images", () => {
    const body = `<w:p><w:r><w:drawing><wp:anchor behindDoc="1" allowOverlap="1" distT="12700"><wp:extent cx="127000" cy="127000"/><wp:positionH relativeFrom="margin"><wp:posOffset>25400</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>38100</wp:posOffset></wp:positionV><wp:wrapNone/><wp:docPr id="1" name="Remote"/><a:graphic><a:graphicData uri="${pic}"><pic:pic><pic:blipFill><a:blip r:embed="remote"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r></w:p>`;
    const artifact = open(body, [{ id: "remote", type: `${r}/image`, target: "https://example.test/image.png", targetMode: "External" }]);
    expect([...artifact.document.drawings.values()][0]).toMatchObject({ kind: "unsupported", placement: "anchor", anchor: { behindDocument: true, horizontalOffsetPoints: 2, verticalOffsetPoints: 3 } });
  });
  test("resizes image extents and keeps media unchanged through undo and redo", () => {
    const artifact = open(drawing("image", `<pic:pic><pic:blipFill><a:blip r:embed="image"/></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="457200"/></a:xfrm></pic:spPr></pic:pic>`, "Image description"), [
      { id: "image", type: `${r}/image`, target: "media/image.png" },
    ], [{ itemName: "word/media/image.png", contentType: "image/png", xml: "image-bytes" }]);
    const image = [...artifact.document.drawings.values()][0]!;
    const session = new WordEditingSession(artifact);
    const resized = session.resizeDrawing({ elementId: image.elementId, widthPoints: 108, heightPoints: 54 });
    expect([...openWordArtifact(resized.bytes()).document.drawings.values()][0]).toMatchObject({ widthPoints: 108, heightPoints: 54, bytes: new TextEncoder().encode("image-bytes") });
    expect(resized.document.source.elements(a, "ext")[0]!.attributes.find(item => item.localName === "cx")!.value).toBe("1371600");
    expect([...session.undo().document.drawings.values()][0]).toMatchObject({ widthPoints: 72, heightPoints: 36 });
    expect([...session.redo().document.drawings.values()][0]).toMatchObject({ widthPoints: 108, heightPoints: 54 });
    expect(session.resizeDrawing({ elementId: image.elementId, widthPoints: 108, heightPoints: 54 })).toBe(resized);
    for (const widthPoints of [0, -1, NaN, Infinity]) expect(() => session.resizeDrawing({ elementId: image.elementId, widthPoints, heightPoints: 54 })).toThrow();
  });

  test("resizes a chart frame without changing its chart data", () => {
    const artifact = open(drawing("chart", `<c:chart r:id="chart"/>`, "Sales chart", c), [
      { id: "chart", type: `${r}/chart`, target: "charts/chart1.xml" },
    ], [{ itemName: "word/charts/chart1.xml", contentType: "application/vnd.openxmlformats-officedocument.drawingml.chart+xml", xml: `<c:chartSpace xmlns:c="${c}" xmlns:a="${a}"><c:chart><c:plotArea><c:pieChart/></c:plotArea></c:chart></c:chartSpace>` }]);
    const chart = [...artifact.document.drawings.values()][0]!;
    const resized = artifact.resizeDrawing({ elementId: chart.elementId, widthPoints: 144, heightPoints: 72 });
    expect([...resized.document.drawings.values()][0]).toMatchObject({ kind: "chart", widthPoints: 144, heightPoints: 72 });
    if (chart.kind !== "chart") throw new Error("Expected chart");
    expect(resized.document.package.readPart(resized.document.package.getPart(chart.partName)!)).toEqual(artifact.document.package.readPart(artifact.document.package.getPart(chart.partName)!));
  });

  test("moves and resizes a drawing atomically with page-relative layout and reversible wrapping", () => {
    const artifact = open(drawing("image", `<pic:pic><pic:blipFill><a:blip r:embed="image"/></pic:blipFill></pic:pic>`, "Movable image"), [
      { id: "image", type: `${r}/image`, target: "media/image.png" },
    ], [{ itemName: "word/media/image.png", contentType: "image/png", xml: "image-bytes" }]);
    const image = [...artifact.document.drawings.values()][0]!;
    const session = new WordEditingSession(artifact);
    const change = { elementId: image.elementId, widthPoints: 90, heightPoints: 45, xPoints: 120, yPoints: 180 };
    const moved = session.updateDrawing({ ...change, layout: "front" });
    expect([...openWordArtifact(moved.bytes()).document.drawings.values()][0]).toMatchObject({ placement: "anchor", widthPoints: 90, heightPoints: 45, anchor: { horizontalRelativeTo: "page", verticalRelativeTo: "page", horizontalOffsetPoints: 120, verticalOffsetPoints: 180, wrap: "none", behindDocument: false } });
    const layout = layoutWordDocument(moved.document, { measure: () => ({ width: 5, ascent: 8, descent: 2 }) });
    expect(layout.pages[0]!.columns[0]!.lines[0]!.fragments[0]).toMatchObject({ x: 120, y: 180, width: 90, height: 45 });
    expect(session.undo()).toBe(artifact);
    expect(session.canUndo).toBe(false);
    session.redo();
    expect([...session.updateDrawing({ ...change, layout: "behind" }).document.drawings.values()][0]!.anchor?.behindDocument).toBe(true);
    expect([...session.updateDrawing({ ...change, layout: "inline" }).document.drawings.values()][0]).toMatchObject({ placement: "inline", widthPoints: 90, heightPoints: 45 });
    expect(() => artifact.updateDrawing({ ...change, layout: "front", xPoints: -1 })).toThrow();
  });

});

function drawing(id: string, graphic: string, description: string, uri = pic): string {
  return `<w:p><w:r><w:drawing><wp:inline><wp:extent cx="914400" cy="457200"/><wp:docPr id="1" name="Drawing" descr="${description}"/><a:graphic><a:graphicData uri="${uri}">${graphic}</a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

function open(body: string, relationships: NonNullable<WordDocumentFixtureOptions["relationships"]>, parts: NonNullable<WordDocumentFixtureOptions["parts"]> = []) {
  return openWordArtifact(buildWordDocumentFixture({
    documentXml: `<w:document xmlns:w="${w}" xmlns:wp="${wp}" xmlns:a="${a}" xmlns:c="${c}" xmlns:pic="${pic}" xmlns:r="${r}"><w:body>${body}</w:body></w:document>`,
    relationships,
    parts,
  }));
}
