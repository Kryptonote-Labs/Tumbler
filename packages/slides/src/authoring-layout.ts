import { attachAuthoredLayout } from "./authored-layout-part.ts";
import { beginLosslessXmlEdit } from "@tumblerjs/ooxml";
import type { PresentationArtifact } from "./artifact.ts";
import { appendToTree, deleteObject, objectTarget, slideTree } from "./authoring-objects.ts";
import { children, editable, slideById } from "./authoring-slides.ts";
import { commitXml, emu } from "./authoring-xml.ts";
import { slideTextValue } from "./editing.ts";
import type { SlideObject } from "./model.ts";

export type PresentationLayout = "blank" | "title" | "title-content" | "two-content";
type Role = "ctrTitle" | "subTitle" | "title" | "body";
interface Slot {
  role: Role;
  index?: number;
  /** Bounds as fractions of the slide size. */
  x: number;
  y: number;
  width: number;
  height: number;
}

// Placement and type sizes follow the layouts of PowerPoint's default Office Theme.
const title = { role: "title", x: 0.0688, y: 0.0532, width: 0.8625, height: 0.1933 } as const;
const LAYOUTS: Record<PresentationLayout, readonly Slot[]> = {
  blank: [],
  title: [
    { role: "ctrTitle", x: 0.125, y: 0.1637, width: 0.75, height: 0.3481 },
    { role: "subTitle", index: 1, x: 0.125, y: 0.5252, width: 0.75, height: 0.2414 },
  ],
  "title-content": [
    title,
    { role: "body", index: 1, x: 0.0688, y: 0.2662, width: 0.8625, height: 0.6345 },
  ],
  "two-content": [
    title,
    { role: "body", index: 1, x: 0.0688, y: 0.2662, width: 0.425, height: 0.6345 },
    { role: "body", index: 2, x: 0.5063, y: 0.2662, width: 0.425, height: 0.6345 },
  ],
};
const bodyLevels = [2800, 2400, 2000, 1800, 1800]
  .map(
    (size, i) =>
      `<a:lvl${i + 1}pPr marL="${228600 + 457200 * i}" indent="-228600"><a:spcBef><a:spcPts val="1000"/></a:spcBef><a:buFont typeface="Arial"/><a:buChar char="${i % 2 ? "–" : "•"}"/><a:defRPr sz="${size}"/></a:lvl${i + 1}pPr>`,
  )
  .join("");
const STYLES: Record<Role, { anchor: "t" | "ctr" | "b"; levels: string }> = {
  ctrTitle: { anchor: "b", levels: '<a:lvl1pPr algn="ctr"><a:defRPr sz="6000"/></a:lvl1pPr>' },
  subTitle: {
    anchor: "t",
    levels:
      '<a:lvl1pPr marL="0" indent="0" algn="ctr"><a:buNone/><a:defRPr sz="2400"/></a:lvl1pPr>',
  },
  title: { anchor: "ctr", levels: '<a:lvl1pPr><a:defRPr sz="4400"/></a:lvl1pPr>' },
  body: { anchor: "t", levels: bodyLevels },
};
const isTitle = (role: string) => role === "title" || role === "ctrTitle";
const placeholder = (slot: Slot) =>
  `<p:ph${slot.role === "body" ? "" : ` type="${slot.role}"`}${slot.index ? ` idx="${slot.index}"` : ""}/>`;

/**
 * Gives a slide the title and content placeholders of a PowerPoint layout. Existing placeholders
 * take the new roles and keep their text; empty ones the layout has no room for are removed.
 * Other authored content is untouched. Each placeholder carries its own formatting, so it renders
 * the same whether or not the deck's masters define matching placeholders.
 */
export function applyPresentationLayout(
  artifact: PresentationArtifact,
  slideId: string,
  layout: PresentationLayout,
) {
  editable(artifact);
  const { width, height } = artifact.document;
  const existing = slideById(artifact, slideId).objects.filter(
    (o) => o.layer === "slide" && o.placeholder && o.textEditable,
  );
  const used = new Set<SlideObject>();
  let result = artifact;
  for (const slot of LAYOUTS[layout]) {
    const bounds = {
      x: width * slot.x,
      y: height * slot.y,
      width: width * slot.width,
      height: height * slot.height,
    };
    const match = existing.find(
      (o) => !used.has(o) && isTitle(o.placeholder!) === isTitle(slot.role),
    );
    if (match) {
      used.add(match);
      result = result.updateObject({
        slideId,
        objectKey: match.key,
        ...bounds,
      });
      result = restyle(result, slideId, match.key, slot);
    } else result = insertPlaceholder(result, slideId, slot, bounds);
  }
  for (const object of existing)
    if (!used.has(object) && !slideTextValue(object))
      result = deleteObject(result, slideId, object.key);
  return attachAuthoredLayout(
    result,
    slideId,
    layout,
    LAYOUTS[layout]
      .map((slot, i) =>
        placeholderMarkup(
          slot,
          {
            x: width * slot.x,
            y: height * slot.y,
            width: width * slot.width,
            height: height * slot.height,
          },
          i + 2,
          "",
        ),
      )
      .join(""),
  );
}

function insertPlaceholder(
  artifact: PresentationArtifact,
  slideId: string,
  slot: Slot,
  bounds: { x: number; y: number; width: number; height: number },
) {
  const { slide, source, tree, id, ns } = slideTree(artifact, slideId);
  return commitXml(
    artifact,
    slide.part,
    appendToTree(source, tree, placeholderMarkup(slot, bounds, id, ns)),
  );
}

function placeholderMarkup(
  slot: Slot,
  bounds: { x: number; y: number; width: number; height: number },
  id: number,
  ns: string,
) {
  const { anchor, levels } = STYLES[slot.role];
  const name = isTitle(slot.role)
    ? "Title"
    : slot.role === "subTitle"
      ? "Subtitle"
      : "Content Placeholder";
  const markup = `<p:sp ${ns}><p:nvSpPr><p:cNvPr id="${id}" name="${name} ${id}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr>${placeholder(slot)}</p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="${emu(bounds.x)}" y="${emu(bounds.y)}"/><a:ext cx="${emu(bounds.width)}" cy="${emu(bounds.height)}"/></a:xfrm></p:spPr><p:txBody><a:bodyPr anchor="${anchor}"><a:normAutofit/></a:bodyPr><a:lstStyle>${levels}</a:lstStyle><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp>`;
  return markup;
}

/** Moves an existing placeholder into a new role, replacing its role formatting but not its text. */
function restyle(artifact: PresentationArtifact, slideId: string, key: string, slot: Slot) {
  const { slide, source, element } = objectTarget(artifact, slideId, key);
  const find = (parent: typeof element | undefined, name: string) =>
    parent && children(parent).find((e) => e.localName === name);
  const ph = find(find(find(element, "nvSpPr"), "nvPr"), "ph")!;
  const body = find(element, "txBody")!;
  const properties = find(body, "bodyPr")!;
  const list = find(body, "lstStyle");
  const { anchor, levels } = STYLES[slot.role];
  const p = source.root.namespaceUri,
    a = properties.namespaceUri;
  const edit = beginLosslessXmlEdit(source);
  edit.replaceElementMarkup(ph, placeholder(slot).replace("<p:ph", `<p:ph xmlns:p="${p}"`));
  const current = properties.attributes.find((x) => !x.namespaceUri && x.localName === "anchor");
  if (current) edit.setAttribute(current, anchor);
  else edit.insertAttribute(properties, "anchor", anchor);
  const style = `<a:lstStyle xmlns:a="${a}">${levels}</a:lstStyle>`;
  if (list) edit.replaceElementMarkup(list, style);
  else
    edit.insertMarkupBefore(
      children(body).find((e) => e.localName === "p")!,
      style,
    );
  return commitXml(artifact, slide.part, edit.commit().bytes);
}
