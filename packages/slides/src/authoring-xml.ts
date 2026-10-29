import { beginPackageTransaction, openZipArchive, writeZipArchiveChanges } from "@tumblerjs/opc";
import { openPresentationArtifact, type PresentationArtifact } from "./artifact.ts";
import { officeThemeXml, parseLosslessXml } from "@tumblerjs/ooxml";

export const P = "http://schemas.openxmlformats.org/presentationml/2006/main";
export const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
export const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
export const encoder = new TextEncoder();
export const xml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
export const emu = (value: number) => Math.round(value * 9525);
export const type = (name: string) =>
  `application/vnd.openxmlformats-officedocument.presentationml.${name}+xml`;
export const namespaces = `xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${R}"`;
export const group =
  '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
export const slideXml = (objects = "") =>
  `<?xml version="1.0" encoding="UTF-8"?><p:sld ${namespaces}><p:cSld><p:spTree>${group}${objects}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
export function partXml(artifact: PresentationArtifact, part: string) {
  const owner = artifact.document.package.getPart(part);
  if (!owner) throw new Error("Presentation part not found.");
  return parseLosslessXml(artifact.document.package.readPart(owner));
}
export function commitXml(artifact: PresentationArtifact, part: string, bytes: Uint8Array) {
  const tx = beginPackageTransaction(artifact.document.package);
  tx.replacePart(part, bytes);
  return openPresentationArtifact(tx.commit(), artifact.options);
}
export function createPresentation(options: { width?: number; height?: number } = {}) {
  const width = options.width ?? 1280,
    height = options.height ?? 720;
  for (const n of [width, height])
    if (!Number.isFinite(n) || n <= 0 || emu(n) > 2147483647)
      throw new RangeError("Slide dimensions must be positive DrawingML coordinates.");
  const parts: Record<string, string> = {
    "[Content_Types].xml": `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="${type("presentation.main")}"/><Override PartName="/ppt/slides/slide1.xml" ContentType="${type("slide")}"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="${type("slideMaster")}"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="${type("slideLayout")}"/></Types>`,
    "_rels/.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="ppt/presentation.xml"/></Relationships>`,
    "ppt/presentation.xml": `<p:presentation ${namespaces}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rIdMaster"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="${emu(width)}" cy="${emu(height)}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`,
    "ppt/_rels/presentation.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/slide" Target="slides/slide1.xml"/><Relationship Id="rIdMaster" Type="${R}/slideMaster" Target="slideMasters/slideMaster1.xml"/></Relationships>`,
    "ppt/slides/slide1.xml": slideXml(),
    "ppt/slides/_rels/slide1.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdLayout" Type="${R}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`,
    "ppt/slideLayouts/slideLayout1.xml": `<p:sldLayout ${namespaces} type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${group}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`,
    "ppt/slideLayouts/_rels/slideLayout1.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdMaster" Type="${R}/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`,
    "ppt/slideMasters/slideMaster1.xml": `<p:sldMaster ${namespaces}><p:cSld><p:spTree>${group}</p:spTree></p:cSld><p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rIdLayout"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`,
    "ppt/slideMasters/_rels/slideMaster1.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdLayout" Type="${R}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`,
  };
  parts["ppt/theme/theme1.xml"] = officeThemeXml();
  parts["[Content_Types].xml"] = parts["[Content_Types].xml"]!.replace(
    "</Types>",
    '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/></Types>',
  );
  parts["ppt/slideMasters/_rels/slideMaster1.xml.rels"] = parts[
    "ppt/slideMasters/_rels/slideMaster1.xml.rels"
  ]!.replace(
    "</Relationships>",
    `<Relationship Id="rIdTheme" Type="${R}/theme" Target="../theme/theme1.xml"/></Relationships>`,
  );
  const empty = new Uint8Array(22);
  empty.set([0x50, 0x4b, 0x05, 0x06]);
  return openPresentationArtifact(
    writeZipArchiveChanges(openZipArchive(empty), {
      additions: Object.entries(parts).map(([name, data]) => ({
        name,
        data: encoder.encode(data),
      })),
    }),
  );
}
