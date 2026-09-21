import PptxGenJS from "pptxgenjs";
import {
  openOpcPackage,
  beginPackageTransaction,
} from "../packages/opc/src/index.ts";
import { resolve } from "node:path";
const pptx = new PptxGenJS();
pptx.layout = "LAYOUT_WIDE";
pptx.author = "Tumbler";
pptx.subject = "Original MIT-licensed conformance examples";
pptx.title = "Presentation rendering checks";
pptx.theme = { headFontFace: "Arial", bodyFontFace: "Arial", lang: "en-GB" };
const green = "355F46";
function slide(title: string, description: string) {
  const s = pptx.addSlide();
  s.background = { color: "F5F7F3" };
  s.addText(title, {
    x: 0.55,
    y: 0.35,
    w: 12,
    h: 0.6,
    fontSize: 30,
    bold: true,
    color: green,
    margin: 0,
  });
  s.addText(description, {
    x: 0.55,
    y: 1.1,
    w: 12,
    h: 0.55,
    fontSize: 16,
    color: "526557",
    margin: 0,
  });
  return s;
}
let s = slide(
  "Text fitting and tab stops",
  "The title fits its box. Amounts share a decimal tab stop.",
);
s.addText("This long heading fits inside a deliberately small text box", {
  objectName: "Autofit",
  x: 0.7,
  y: 2,
  w: 5,
  h: 0.7,
  fontSize: 34,
  color: green,
  margin: 0,
});
s.addText("Research\t12.50\nEngineering\t980.00\nReview\t6.25", {
  objectName: "Decimal tabs",
  x: 7,
  y: 2,
  w: 5,
  h: 2,
  fontSize: 22,
  color: green,
  margin: 0,
});
s.addText("Latin · 日本語 · العربية", {
  objectName: "Script fonts",
  x: 0.7,
  y: 4,
  w: 11,
  h: 1,
  fontSize: 28,
  color: green,
  margin: 0,
});
s = slide(
  "Pictures, patterns, and effects",
  "Tiled vector artwork, percentage and cross-hatch fills, glow, and softened edges.",
);
for (const [i, name] of [
  "Picture fill",
  "Hatching",
  "Dots",
  "Glow",
  "Soft edge",
].entries())
  s.addShape(pptx.ShapeType.roundRect, {
    objectName: name,
    x: 0.7 + i * 2.5,
    y: 2.7,
    w: 2,
    h: 2,
    fill: { color: "94B69C" },
    line: { color: green, width: 1 },
  });
s = slide("Stacked values", "Positive and negative values stack separately.");
const data = [
  { name: "Design", labels: ["Q1", "Q2", "Q3"], values: [20, 30, -10] },
  { name: "Engineering", labels: ["Q1", "Q2", "Q3"], values: [35, 15, -20] },
];
s.addChart(pptx.ChartType.bar, data, {
  x: 0.8,
  y: 2,
  w: 11.7,
  h: 4.8,
  catAxisLabelFontSize: 16,
  valAxisLabelFontSize: 14,
  barDir: "col",
  catName: "Quarter",
  barGrouping: "stacked",
  chartColors: ["355F46", "94B69C"],
  showLegend: true,
  legendPos: "b",
});
s = slide(
  "Columns and a line",
  "Both plots share category positions and retain their own series type.",
);
s.addChart(
  [
    { type: pptx.ChartType.bar, data: [data[0]!], options: { barDir: "col" } },
    {
      type: pptx.ChartType.line,
      data: [
        { name: "Trend", labels: ["Q1", "Q2", "Q3"], values: [10, 25, 20] },
      ],
    },
  ],
  {
    x: 0.8,
    y: 2,
    w: 11.7,
    h: 4.8,
    showLegend: true,
    legendPos: "b",
    chartColors: ["355F46", "94B69C"],
  },
);
s = slide(
  "Embedded video",
  "The clip stays inside the document. Playback uses the browser controls.",
);
s.addMedia({
  objectName: "Video",
  type: "video",
  path: resolve("apps/docs/e2e/fixtures/media.webm"),
  x: 1,
  y: 2,
  w: 11,
  h: 4.8,
});
s = slide(
  "Click-by-click playback",
  "Choose Play animations, then Next animation to reveal each shape.",
);
s.addShape(pptx.ShapeType.roundRect, {
  objectName: "Fade in",
  x: 1,
  y: 2.8,
  w: 4.8,
  h: 2.4,
  fill: { color: "355F46" },
  line: { color: "355F46" },
});
s.addShape(pptx.ShapeType.roundRect, {
  objectName: "Wipe in",
  x: 7.4,
  y: 2.8,
  w: 4.8,
  h: 2.4,
  fill: { color: "94B69C" },
  line: { color: "355F46" },
});
const bytes = await pptx.write({ outputType: "uint8array" });
if (!(bytes instanceof Uint8Array))
  throw new Error("Expected presentation bytes");
const pkg = openOpcPackage(bytes),
  tx = beginPackageTransaction(pkg),
  encoder = new TextEncoder();
const read = (name: string) =>
  new TextDecoder().decode(pkg.readPart(pkg.getPart(name)!));
const tile =
  '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#dbe9de"/><circle cx="20" cy="20" r="8" fill="#355f46"/></svg>';
tx.addPart("/ppt/media/tile.svg", "image/svg+xml", encoder.encode(tile));
tx.addRelationship("/ppt/slides/slide2.xml", {
  id: "tile",
  type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image",
  target: "/ppt/media/tile.svg",
});
for (const part of pkg.parts.filter((p) => p.name.value.endsWith(".xml"))) {
  let xml = read(part.name.value);
  if (part.name.value === "/ppt/presentation.xml") {
    const notes = xml.match(
      /<p:notesMasterIdLst>[\s\S]*?<\/p:notesMasterIdLst>/,
    )?.[0];
    if (notes)
      xml = xml
        .replace(notes, "")
        .replace("<p:sldIdLst>", notes + "<p:sldIdLst>");
  }
  if (part.name.value.includes("/charts/"))
    xml = xml.replace(/<c:barChart>[\s\S]*?<\/c:barChart>/g, (block) => {
      let n = 0;
      return block.replace(/<c:axId\b[^>]*\/>/g, (axis) =>
        ++n <= 2 ? axis : "",
      );
    });
  if (part.name.value.includes("/charts/")) {
    xml = xml.replace(/<c:ser>[\s\S]*?<\/c:ser>/g, (series) => {
      const points = series.match(/<c:dPt>[\s\S]*?<\/c:dPt>/g) ?? [];
      return series
        .replace(/<c:dPt>[\s\S]*?<\/c:dPt>/g, "")
        .replace("<c:dLbls>", points.join("") + "<c:dLbls>");
    });
    xml = xml.replace(/<c:lineChart>[\s\S]*?<\/c:lineChart>/g, (line) => {
      let axes = 0;
      return line
        .replace("<c:lineChart>", '<c:lineChart><c:grouping val="standard"/>')
        .replace(/<c:invertIfNegative[^>]*\/>/g, "")
        .replace(/<c:axId[^>]*\/>/g, (axis) => (++axes <= 2 ? axis : ""))
        .replace(/<c:ser>[\s\S]*?<\/c:ser>/g, (series) => {
          const marker =
            series.match(/<c:marker>[\s\S]*?<\/c:marker>/)?.[0] ?? "";
          return series
            .replace(marker, "")
            .replace("<c:dLbls>", marker + "<c:dLbls>");
        });
    });
  }
  if (part.name.value === "/ppt/slides/slide1.xml")
    xml = xml.replace(/<p:sp>[\s\S]*?<\/p:sp>/g, (block) => {
      if (block.includes('name="Autofit"'))
        return block.replace(
          /<a:bodyPr[^>]*(?:\/>|>[\s\S]*?<\/a:bodyPr>)/,
          '<a:bodyPr><a:normAutofit fontScale="100000" lnSpcReduction="10000"/></a:bodyPr>',
        );
      if (block.includes('name="Decimal tabs"'))
        return block.replace(/<a:pPr[^>]*>[\s\S]*?<\/a:pPr>/g, (p) =>
          p.replace(
            "</a:pPr>",
            '<a:tabLst><a:tab pos="2743200" algn="dec"/></a:tabLst></a:pPr>',
          ),
        );
      if (block.includes('name="Script fonts"'))
        return block.replace(
          /<a:latin[^>]*\/>/g,
          '<a:latin typeface="Arial"/><a:ea typeface="Noto Sans CJK JP"/><a:cs typeface="Noto Sans Arabic"/>',
        );
      return block;
    });
  if (part.name.value === "/ppt/slides/slide2.xml")
    xml = xml.replace(/<p:sp>[\s\S]*?<\/p:sp>/g, (block) => {
      if (block.includes('name="Picture fill"'))
        return block.replace(
          /<a:solidFill>[\s\S]*?<\/a:solidFill>/,
          '<a:blipFill><a:blip r:embed="tile"/><a:tile sx="100000" sy="100000" tx="0" ty="0" algn="tl" flip="none"/></a:blipFill>',
        );
      for (const [name, preset] of [
        ["Hatching", "diagCross"],
        ["Dots", "pct20"],
      ])
        if (block.includes(`name="${name}"`))
          return block.replace(
            /<a:solidFill>[\s\S]*?<\/a:solidFill>/,
            `<a:pattFill prst="${preset}"><a:fgClr><a:srgbClr val="355F46"/></a:fgClr><a:bgClr><a:srgbClr val="DBE9DE"/></a:bgClr></a:pattFill>`,
          );
      if (block.includes('name="Glow"'))
        return block.replace(
          "</p:spPr>",
          '<a:effectLst><a:glow rad="114300"><a:srgbClr val="355F46"/></a:glow><a:reflection stA="50000" sy="-100000" endPos="70000" algn="bl" dir="5400000" dist="57150"/></a:effectLst></p:spPr>',
        );
      if (block.includes('name="Soft edge"'))
        return block.replace(
          "</p:spPr>",
          '<a:effectLst><a:softEdge rad="76200"/></a:effectLst></p:spPr>',
        );
      return block;
    });
  // PptxGenJS reuses the preceding text shape ID for media objects.
  if (part.name.value === "/ppt/slides/slide5.xml")
    xml = xml.replace(
      '<p:cNvPr id="3" name="Video"',
      '<p:cNvPr id="4" name="Video"',
    );
  if (part.name.value === "/ppt/slides/slide6.xml") {
    const id = (name: string) =>
      xml.match(new RegExp(`<p:cNvPr id="(\\d+)" name="${name}"`))![1];
    const effect = (target: string, index: number, filter: string) =>
      `<p:par><p:cTn id="${index}" nodeType="clickEffect"><p:childTnLst><p:animEffect transition="in" filter="${filter}"><p:cBhvr><p:cTn id="${index + 10}" dur="500"/><p:tgtEl><p:spTgt spid="${target}"/></p:tgtEl></p:cBhvr></p:animEffect></p:childTnLst></p:cTn></p:par>`;
    xml = xml.replace(
      "</p:sld>",
      `<p:transition spd="fast"><p:fade/></p:transition><p:timing><p:tnLst>${effect(id("Fade in"), 1, "fade")}${effect(id("Wipe in"), 2, "wipe(left)")}</p:tnLst></p:timing></p:sld>`,
    );
  }
  tx.replacePart(part.name, encoder.encode(xml));
}
await Bun.write(
  resolve("apps/docs/static/samples/rendering-checks.pptx"),
  tx.commit(),
);
