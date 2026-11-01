import type { LosslessXmlElement } from "@tumblerjs/ooxml";
import type { PresentationArtifact } from "./artifact.ts";
import { children, slideById } from "./authoring-slides.ts";
import { partXml, xml } from "./authoring-xml.ts";
import type { PresentationLayout } from "./authoring-layout.ts";

const attr = (element: LosslessXmlElement, name: string) =>
  element.attributes.find((a) => !a.namespaceUri && a.localName === name)?.value;
const child = (element: LosslessXmlElement | undefined, name: string) =>
  element && children(element).find((e) => e.localName === name);

/** New slides instantiate layout placeholders, leaving their geometry and styles inherited. */
export function newSlideLayout(artifact: PresentationArtifact, sourceId: string) {
  const pkg = artifact.document.package;
  const slide = slideById(artifact, sourceId);
  const related = (part: string, type: string) => {
    const owner = pkg.getPart(part)!;
    const relation = pkg
      .relationships(owner.name)
      .items.find((r) => r.type.endsWith(`/${type}`) && r.targetMode === "Internal");
    return relation?.targetMode === "Internal" ? relation.targetPartName.value : undefined;
  };
  let part = related(slide.part, "slideLayout");
  let layout = part ? partXml(artifact, part) : undefined;
  let titleFallback = false;
  if (layout && attr(layout.root, "type") === "title") {
    const masterPart = related(part!, "slideMaster");
    if (masterPart) {
      const master = partXml(artifact, masterPart);
      const layouts = child(master.root, "sldLayoutIdLst");
      const next = layouts && children(layouts)[1];
      const rid = next?.attributes.find((a) => a.localName === "id" && a.namespaceUri)?.value;
      const rel = rid && pkg.relationships(pkg.getPart(masterPart)!.name).get(rid);
      if (rel && rel.targetMode === "Internal" && rel.targetPartName.value !== part) {
        part = rel.targetPartName.value;
        layout = partXml(artifact, part);
      }
    }
    titleFallback = !!layout && attr(layout.root, "type") === "title";
  }
  const tree = child(child(layout?.root, "cSld"), "spTree");
  const placeholders = (tree ? children(tree) : []).flatMap((shape) => {
    const ph = child(child(child(shape, "nvSpPr"), "nvPr"), "ph");
    if (!ph || ["dt", "ftr", "hdr", "sldNum"].includes(attr(ph, "type") ?? "")) return [];
    return [{ shape, ph }];
  });
  const objects = placeholders
    .map(({ shape, ph }, index) => {
      const metadata = child(child(shape, "nvSpPr"), "cNvPr");
      const name = metadata ? (attr(metadata, "name") ?? "Placeholder") : "Placeholder";
      const attributes = ["type", "orient", "sz", "idx", "hasCustomPrompt"]
        .flatMap((key) => {
          const value = attr(ph, key);
          return value === undefined ? [] : [` ${key}="${xml(value)}"`];
        })
        .join("");
      return `<p:sp><p:nvSpPr><p:cNvPr id="${index + 2}" name="${xml(name)}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph${attributes}/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody></p:sp>`;
    })
    .join("");

  // Older authoring commands put layout placeholders directly on a blank-layout slide.
  // Preserve that layout choice without copying slide content or arbitrary authored shapes.
  let fallback: PresentationLayout | undefined;
  if (!placeholders.length && (!layout || attr(layout.root, "type") === "blank")) {
    const roles = slide.objects
      .filter((o) => o.layer === "slide" && o.placeholder)
      .map((o) => o.placeholder);
    if (roles.includes("ctrTitle")) fallback = "title-content";
    else if (roles.includes("title"))
      fallback =
        roles.filter((role) => role === "body" || role === "obj").length > 1
          ? "two-content"
          : "title-content";
  }
  return {
    part,
    objects: titleFallback ? "" : objects,
    fallback: titleFallback ? ("title-content" as const) : fallback,
  };
}
