import { deflateSync } from "node:zlib";
import { crc32 } from "../packages/opc/src/zip/crc32.ts";
import { openPresentationArtifact } from "../packages/slides/src/index.ts";
import PptxGenJS from "pptxgenjs";
import {
  openOpcPackage,
  beginPackageTransaction,
} from "../packages/opc/src/index.ts";
import {
  parseLosslessXml,
  beginLosslessXmlEdit,
  OOXML_NAMESPACES,
} from "../packages/ooxml/src/index.ts";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const destination = resolve(process.argv[2] ?? "apps/docs/static/samples");
await mkdir(destination, { recursive: true });
const green = "355F46";
function deck(title: string, wide = true) {
  const pptx = new PptxGenJS();
  pptx.layout = wide ? "LAYOUT_WIDE" : "LAYOUT_4x3";
  pptx.author = "Tumbler";
  pptx.subject = "Original MIT-licensed Tumbler test fixture";
  pptx.title = title;
  pptx.company = "Kryptonote Labs";
  pptx.lang = "en-GB";
  pptx.theme = { headFontFace: "Arial", bodyFontFace: "Arial", lang: "en-GB" };
  pptx.defineSlideMaster({
    title: "FIELDNOTES",
    background: { color: "F5F7F3" },
    objects: [
      {
        text: {
          text: "FIELDNOTES / TUMBLER",
          options: {
            x: 0.55,
            y: 0.22,
            w: 5,
            h: 0.3,
            fontSize: 10,
            color: green,
            bold: true,
            margin: 0,
          },
        },
      },
      {
        line: {
          x: 0.55,
          y: 0.7,
          w: wide ? 12.2 : 8.9,
          h: 0,
          line: { color: "C7D5C9", width: 1 },
        },
      },
    ],
    slideNumber: {
      x: wide ? 12.1 : 8.9,
      y: wide ? 7.1 : 7.1,
      color: "617466",
      fontSize: 10,
    },
  });
  return pptx;
}
function title(pptx: PptxGenJS, heading: string, subtitle: string) {
  const slide = pptx.addSlide("FIELDNOTES");
  slide.addText(heading, {
    x: 0.6,
    y: 1,
    w: 8.8,
    h: 0.8,
    fontFace: "Arial",
    fontSize: 32,
    bold: true,
    color: green,
    margin: 0,
    breakLine: false,
  });
  slide.addText(subtitle, {
    x: 0.6,
    y: 2,
    w: 8,
    h: 0.8,
    fontSize: 19,
    color: "526557",
    margin: 0,
  });
  return slide;
}
const brief = deck("A quieter workspace");
let slide = title(
  brief,
  "A quieter workspace",
  "A small place to think, write, and work with documents.",
);
slide.addShape(brief.ShapeType.roundRect, {
  x: 0.6,
  y: 3.3,
  w: 5.4,
  h: 1.6,
  rectRadius: 0.12,
  fill: { color: "DBE9DE" },
  line: { color: "94B69C", width: 1 },
});
slide.addText("Build for the work", {
  x: 0.85,
  y: 3.65,
  w: 4.9,
  h: 0.55,
  fontSize: 23,
  bold: true,
  color: green,
  margin: 0,
});
slide.addText("Select a text box in Edit mode to change its text.", {
  x: 0.6,
  y: 6.4,
  w: 10,
  h: 0.4,
  fontSize: 12,
  color: "617466",
  margin: 0,
});
slide = title(
  brief,
  "Working principles",
  "Keep the interface quiet and the content easy to read.",
);
for (const [index, text] of [
  "Give each control a clear purpose.",
  "Preserve familiar document layouts.",
  "Keep opening and exporting files close at hand.",
].entries()) {
  slide.addShape(brief.ShapeType.ellipse, {
    x: 0.65,
    y: 3.3 + index * 0.8,
    w: 0.12,
    h: 0.12,
    fill: { color: green },
    line: { color: green },
  });
  slide.addText(text, {
    x: 0.95,
    y: 3.15 + index * 0.8,
    w: 9,
    h: 0.5,
    fontSize: 21,
    color: green,
    margin: 0,
  });
}
slide = title(
  brief,
  "Progress at a glance",
  "Quarterly deliveries from the first project.",
);
slide.addChart(
  brief.ChartType.bar,
  [
    {
      name: "Deliveries",
      labels: ["Q1", "Q2", "Q3", "Q4"],
      values: [24, 38, 31, 52],
    },
  ],
  {
    x: 0.6,
    y: 3,
    w: 10,
    h: 3.5,
    catAxisLabelFontFace: "Arial",
    valAxisLabelFontFace: "Arial",
    showLegend: false,
    showTitle: false,
    chartColors: [green],
  },
);
await brief.writeFile({
  fileName: resolve(destination, "workspace-brief.pptx"),
});

const visuals = deck("Shapes and pictures", false);
slide = title(
  visuals,
  "Shapes and pictures",
  "Rotation, transparency, pictures, and mixed text runs.",
);
slide.addShape(visuals.ShapeType.rect, {
  x: 0.8,
  y: 3.4,
  w: 2.3,
  h: 1.2,
  rotate: 18,
  fill: { color: "355F46" },
  line: { color: "244732", width: 2 },
});
slide.addShape(visuals.ShapeType.ellipse, {
  x: 3.6,
  y: 3.3,
  w: 2.2,
  h: 1.4,
  fill: { color: "9EC4A7", transparency: 15 },
  line: { color: "355F46", width: 1.5 },
});
slide.addText(
  [
    { text: "One line, ", options: { bold: false } },
    { text: "two weights.", options: { bold: true } },
  ],
  { x: 0.7, y: 5.4, w: 8, h: 0.65, fontSize: 24, color: green, margin: 0 },
);
slide = title(
  visuals,
  "An embedded picture",
  "The picture remains an image part when other objects change.",
);
// An original raster diagram, built from rectangles so the source is reproducible.
function picture() {
  const width = 480,
    height = 320;
  const pixels = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const column = Math.floor((x - 50) / 95);
      const bar =
        x >= 50 &&
        column >= 0 &&
        column < 4 &&
        (x - 50) % 95 < 60 &&
        y > 260 - [90, 145, 120, 200][column]! &&
        y < 260;
      pixels.set(
        bar ? [53, 95, 70] : [219, 233, 222],
        y * (width * 3 + 1) + 1 + x * 3,
      );
    }
  function chunk(type: string, data: Buffer) {
    const result = Buffer.alloc(data.length + 12);
    result.writeUInt32BE(data.length);
    result.write(type, 4);
    data.copy(result, 8);
    result.writeUInt32BE(crc32(result.subarray(4, -4)), result.length - 4);
    return result;
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
slide.addImage({
  data: `image/png;base64,${picture().toString("base64")}`,
  x: 0.8,
  y: 3,
  w: 3,
  h: 2,
  altText: "Four green bars on a pale green background",
});
slide.addShape(visuals.ShapeType.rect, {
  x: 0.8,
  y: 3,
  w: 3,
  h: 2,
  fill: { color: "FFFFFF", transparency: 100 },
  line: { color: green, width: 2 },
});
slide.addText("Image bytes are preserved", {
  x: 4.2,
  y: 3.45,
  w: 4.7,
  h: 0.7,
  fontSize: 22,
  color: green,
  margin: 0,
});
await visuals.writeFile({
  fileName: resolve(destination, "shapes-and-pictures.pptx"),
});

const compatibility = deck("Compatibility checks");
slide = title(
  compatibility,
  "Content we preserve",
  "Native cells, borders, and text. Table editing comes next.",
);
slide.addTable(
  [
    ["Milestone", "Owner", "Status"],
    ["Prototype", "Design", "Complete"],
    ["Review", "Engineering", "In progress"],
  ],
  {
    x: 0.6,
    y: 3,
    w: 10,
    h: 1.8,
    fontFace: "Arial",
    fontSize: 18,
    color: green,
    border: { type: "solid", color: "A6B9AA", pt: 1 },
    fill: "FFFFFF",
  },
);
slide.addNotes(
  "These notes must survive edits to the title. This sample is original Tumbler test material.",
);
slide = title(
  compatibility,
  "A second slide",
  "Slide order comes from presentation relationships, not file names.",
);
slide.addShape(compatibility.ShapeType.chevron, {
  x: 1,
  y: 3.3,
  w: 4,
  h: 1.5,
  fill: { color: "9EC4A7" },
  line: { color: green },
});
slide.addShape(compatibility.ShapeType.rect, {
  objectName: "Grouped rectangle",
  x: 6,
  y: 3.2,
  w: 2,
  h: 1,
  fill: { color: "355F46" },
  line: { color: "355F46" },
});
slide.addShape(compatibility.ShapeType.ellipse, {
  objectName: "Grouped ellipse",
  x: 8.2,
  y: 3.2,
  w: 1,
  h: 1,
  fill: { color: "9EC4A7" },
  line: { color: "355F46" },
});
await compatibility.writeFile({
  fileName: resolve(destination, "compatibility-deck.pptx"),
});
// PptxGenJS 4.0.1 restarts table IDs at 2. These original fixtures have no
const standards = deck("Everyday PowerPoint features");
const gallery = title(
  standards,
  "Shapes and connectors",
  "DrawingML presets, gradients, and line ends",
);
const shapes = [
  "chevron",
  "hexagon",
  "star5",
  "cloud",
  "heart",
  "rightArrow",
  "flowChartDecision",
  "wedgeRoundRectCallout",
] as const;
shapes.forEach((shape, i) =>
  gallery.addShape(standards.ShapeType[shape], {
    x: 0.7 + (i % 4) * 3.1,
    y: 3.1 + Math.floor(i / 4) * 1.6,
    w: 2.4,
    h: 1.2,
    fill: { color: "527C64" },
    line: { color: "355F46", width: 1.5 },
    objectName: i === 0 ? "Gradient chevron" : shape,
  }),
);
gallery.addNotes(
  "Each preset uses the published ECMA DrawingML geometry definitions. The chevron has a two-stop linear gradient.",
);
const formatted = title(
  standards,
  "Text and navigation",
  "Run formatting, hyperlinks, and speaker notes",
);
formatted.addText(
  [
    { text: "Water: H", options: {} },
    { text: "2", options: { subscript: true } },
    { text: "O. Area: x", options: {} },
    { text: "2", options: { superscript: true } },
    { text: "  Updated", options: { strike: true } },
  ],
  { x: 0.7, y: 3.2, w: 11, h: 0.8, fontSize: 26, color: green },
);
formatted.addText("Back to the shape gallery", {
  x: 0.7,
  y: 4.5,
  w: 8,
  h: 0.6,
  fontSize: 22,
  hyperlink: { slide: 1 },
  color: green,
});
formatted.addText("ECMA-376 specification", {
  x: 0.7,
  y: 5.4,
  w: 8,
  h: 0.6,
  fontSize: 22,
  hyperlink: {
    url: "https://ecma-international.org/publications-and-standards/standards/ecma-376/",
  },
  color: green,
});
formatted.addNotes(
  "These notes belong to the active slide. Internal links navigate without changing the presentation bytes.",
);
const styled = title(
  standards,
  "Theme-styled table",
  "Header and banding resolved from a built-in Office style",
);
styled.addTable(
  [
    ["Milestone", "Owner", "Status"],
    ["Prototype", "Design", "Complete"],
    ["Review", "Engineering", "In progress"],
    ["Release", "Team", "Planned"],
  ],
  {
    x: 0.7,
    y: 3.2,
    w: 11.8,
    h: 2.8,
    fontSize: 20,
    rowH: 0.7,
  },
);
await standards.writeFile({
  fileName: resolve(destination, "standards-features.pptx"),
});

// connectors or timing references, so assign unique IDs before distributing them.
for (const file of [
  "workspace-brief.pptx",
  "shapes-and-pictures.pptx",
  "compatibility-deck.pptx",
  "standards-features.pptx",
]) {
  const path = resolve(destination, file);
  const pkg = openOpcPackage(
    new Uint8Array(await Bun.file(path).arrayBuffer()),
  );
  const transaction = beginPackageTransaction(pkg);
  const main = pkg.mainOfficeDocumentPart();
  const mainXml = new TextDecoder().decode(pkg.readPart(main));
  const notes = mainXml.match(
    /<p:notesMasterIdLst>[\s\S]*?<\/p:notesMasterIdLst>/,
  )?.[0];
  if (notes)
    transaction.replacePart(
      main.name,
      new TextEncoder().encode(
        mainXml
          .replace(notes, "")
          .replace("<p:sldIdLst>", `${notes}<p:sldIdLst>`),
      ),
    );
  for (const chart of pkg.parts.filter(
    (part) =>
      part.contentType ===
      "application/vnd.openxmlformats-officedocument.drawingml.chart+xml",
  )) {
    const xml = new TextDecoder().decode(pkg.readPart(chart));
    // A 2D bar chart has two axes. PptxGenJS emits an extra series-axis reference.
    const corrected = xml.replace(
      /<c:barChart>[\s\S]*?<\/c:barChart>/g,
      (block) => {
        let axes = 0;
        return block.replace(/<c:axId\b[^>]*\/>/g, (axis) =>
          ++axes <= 2 ? axis : "",
        );
      },
    );
    transaction.replacePart(chart.name, new TextEncoder().encode(corrected));
  }
  for (const part of pkg.parts.filter(
    (part) =>
      part.contentType ===
      "application/vnd.openxmlformats-officedocument.presentationml.slide+xml",
  )) {
    const source = parseLosslessXml(pkg.readPart(part));
    const editor = beginLosslessXmlEdit(source);
    source
      .elements(OOXML_NAMESPACES.transitional.presentation, "cNvPr")
      .forEach((element, index) => {
        const id = element.attributes.find(
          (attribute) => attribute.localName === "id",
        );
        if (id && id.value !== String(index + 1))
          editor.setAttribute(id, String(index + 1));
      });
    // PptxGenJS repeats identical paragraph properties between rich-text runs.
    let corrected = new TextDecoder()
      .decode(editor.commit().bytes)
      .replace(/<a:p>[\s\S]*?<\/a:p>/g, (paragraph) => {
        let found = false;
        return paragraph.replace(
          /<a:pPr\b[^>]*>[\s\S]*?<\/a:pPr>/g,
          (properties) => {
            if (found) return "";
            found = true;
            return properties;
          },
        );
      });
    if (file === "standards-features.pptx") {
      if (part.name.value.endsWith("slide1.xml"))
        corrected = corrected.replace(/<p:sp>[\s\S]*?<\/p:sp>/g, (block) =>
          block.includes('name="Gradient chevron"')
            ? block.replace(
                /<a:solidFill>[\s\S]*?<\/a:solidFill>/,
                '<a:gradFill><a:gsLst><a:gs pos="0"><a:srgbClr val="B9D7C3"/></a:gs><a:gs pos="100000"><a:srgbClr val="355F46"/></a:gs></a:gsLst><a:lin ang="0" scaled="1"/></a:gradFill>',
              )
            : block,
        );
      if (part.name.value.endsWith("slide3.xml"))
        corrected = corrected.replace(/<a:tbl>[\s\S]*?<\/a:tbl>/g, (block) =>
          block
            .replace(
              /<a:tblPr(?:[^>]*\/>|[^>]*>[\s\S]*?<\/a:tblPr>)/,
              '<a:tblPr firstRow="1" bandRow="1"><a:tableStyleId>{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}</a:tableStyleId></a:tblPr>',
            )
            .replace(/<a:tcPr[\s\S]*?<\/a:tcPr>/g, "<a:tcPr/>")
            .replace(
              /<a:rPr[\s\S]*?<\/a:rPr>/g,
              '<a:rPr lang="en-US" sz="2000"/>',
            ),
        );
    }
    let bytes = new TextEncoder().encode(corrected);
    if (
      file === "compatibility-deck.pptx" &&
      part.name.value === "/ppt/slides/slide2.xml"
    ) {
      const xml = new TextDecoder().decode(bytes);
      const source = parseLosslessXml(bytes);
      const grouped = source
        .elements(OOXML_NAMESPACES.transitional.presentation, "sp")
        .filter((element) =>
          source
            .elements(OOXML_NAMESPACES.transitional.presentation, "cNvPr")
            .some(
              (metadata) =>
                metadata.span.start > element.span.start &&
                metadata.span.end < element.span.end &&
                metadata.attributes.some(
                  (attribute) =>
                    attribute.localName === "name" &&
                    attribute.value.startsWith("Grouped "),
                ),
            ),
        );
      const first = grouped[0]!,
        last = grouped.at(-1)!;
      const children = xml.slice(first.span.start, last.span.end);
      // Group coordinates intentionally differ from slide coordinates to exercise scaling.
      const group = `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="900" name="Scaled group"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="5486400" y="3840480"/><a:ext cx="2926080" cy="1371600"/><a:chOff x="5486400" y="2926080"/><a:chExt cx="2926080" cy="914400"/></a:xfrm></p:grpSpPr>${children}</p:grpSp>`;
      bytes = new TextEncoder().encode(
        xml.slice(0, first.span.start) + group + xml.slice(last.span.end),
      );
    }
    transaction.replacePart(part.name, bytes);
  }
  const output = transaction.commit();
  await Bun.write(path, output);
  if (process.argv.includes("--with-edits")) {
    const artifact = openPresentationArtifact(output);
    const slide = artifact.document.slides[0]!;
    const title = slide.objects.find((object) => object.textEditable)!;
    const edited = artifact
      .replaceText(slide.id, title.key, "Edited & preserved title")
      .updateObject({
        slideId: slide.id,
        objectKey: title.key,
        ...title.transform,
        x: title.transform.x + 12,
        width: title.transform.width - 24,
      });
    await Bun.write(
      resolve(destination, file.replace(".pptx", "-edited.pptx")),
      edited.bytes(),
    );
  }
}
console.log(`Wrote four original test decks to ${destination}`);
