import { describe, expect, test } from "bun:test";
import { layoutWordDocument, openWordArtifact } from "../src/index.ts";
import { buildWordDocumentFixture, type WordDocumentFixtureOptions } from "./document-fixture.ts";

const w = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const wp = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing";
const a = "http://schemas.openxmlformats.org/drawingml/2006/main";
const c = "http://schemas.openxmlformats.org/drawingml/2006/chart";
const pic = "http://schemas.openxmlformats.org/drawingml/2006/picture";
const r = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

describe("WordprocessingML drawings", () => {
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
