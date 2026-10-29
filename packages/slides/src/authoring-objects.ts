import { beginLosslessXmlEdit } from "@tumblerjs/ooxml";
import { beginPackageTransaction } from "@tumblerjs/opc";
import { openPresentationArtifact, type PresentationArtifact } from "./artifact.ts";
import { children, editable, raw, slideById } from "./authoring-slides.ts";
import { A, R, commitXml, emu, partXml, xml } from "./authoring-xml.ts";

export interface ObjectBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
export type ShapeGeometry =
  | "rect"
  | "roundRect"
  | "ellipse"
  | "triangle"
  | "diamond"
  | "line"
  | "rightArrow"
  | "chevron"
  | "star5";
export type NewSlideObject = Extract<
  import("./commands.ts").PresentationCommand,
  { name: "insert-object" }
>["object"];
export function objectTarget(artifact: PresentationArtifact, slideId: string, key: string) {
  const slide = slideById(artifact, slideId),
    object = slide.objects.find((o) => o.key === key);
  if (!object || object.layer !== "slide" || !object.movable)
    throw new Error(object?.restriction ?? "Select an editable slide object.");
  const source = partXml(artifact, slide.part),
    element = source.element(object.elementId)!;
  return { slide, object, source, element };
}
function validateBounds(bounds: ObjectBounds, line: boolean) {
  for (const n of Object.values(bounds))
    if (!Number.isFinite(n) || Math.abs(emu(n)) > 2147483647)
      throw new RangeError("Object bounds exceed DrawingML coordinates.");
  if (
    line
      ? bounds.width < 0 || bounds.height < 0 || bounds.width + bounds.height <= 0
      : bounds.width <= 0 || bounds.height <= 0
  )
    throw new RangeError("Object dimensions must be positive.");
}
function color(value: string) {
  if (value === "none") return "<a:noFill/>";
  if (!/^#[a-f\d]{6}$/i.test(value)) throw new TypeError("Use #RRGGBB colors or none.");
  return `<a:solidFill><a:srgbClr val="${value.slice(1)}"/></a:solidFill>`;
}
function textBody(value: string, fontSize = 24) {
  if (!Number.isFinite(fontSize) || fontSize < 1 || fontSize > 409)
    throw new RangeError("Font size must be between 1 and 409 points.");
  return `<a:bodyPr/><a:lstStyle/>${value
    .split("\n")
    .map(
      (text) =>
        `<a:p><a:r><a:rPr lang="en-US" sz="${Math.round(fontSize * 100)}"/><a:t>${xml(text)}</a:t></a:r><a:endParaRPr lang="en-US" sz="${Math.round(fontSize * 100)}"/></a:p>`,
    )
    .join("")}`;
}
export function insertObject(
  artifact: PresentationArtifact,
  slideId: string,
  bounds: ObjectBounds,
  input: NewSlideObject,
) {
  editable(artifact);
  validateBounds(bounds, input.kind === "shape" && input.geometry === "line");
  const slide = slideById(artifact, slideId),
    source = partXml(artifact, slide.part);
  const tree = children(children(source.root).find((e) => e.localName === "cSld")!).find(
    (e) => e.localName === "spTree",
  )!;
  let maxId = 1;
  const visit = (element: typeof tree) => {
    for (const e of children(element)) {
      if (e.localName === "cNvPr")
        maxId = Math.max(maxId, Number(e.attributes.find((a) => a.localName === "id")?.value ?? 0));
      visit(e);
    }
  };
  visit(tree);
  const id = maxId + 1;
  const ns = `xmlns:p="${source.root.namespaceUri}" xmlns:a="${artifact.document.conformance === "strict" ? "http://purl.oclc.org/ooxml/drawingml/main" : A}" xmlns:r="${artifact.document.conformance === "strict" ? "http://purl.oclc.org/ooxml/officeDocument/relationships" : R}"`;
  const transform = `<a:xfrm><a:off x="${emu(bounds.x)}" y="${emu(bounds.y)}"/><a:ext cx="${emu(bounds.width)}" cy="${emu(bounds.height)}"/></a:xfrm>`;
  const tx = beginPackageTransaction(artifact.document.package);
  let markup: string;
  if (input.kind === "shape") {
    markup = `<p:sp ${ns}><p:nvSpPr><p:cNvPr id="${id}" name="${input.geometry ? "Shape" : "Text Box"} ${id}"/><p:cNvSpPr${input.geometry ? "" : ' txBox="1"'}/><p:nvPr/></p:nvSpPr><p:spPr>${transform}<a:prstGeom prst="${input.geometry ?? "rect"}"><a:avLst/></a:prstGeom>${color(input.fill ?? (input.geometry ? "#4472C4" : "none"))}<a:ln>${color(input.stroke ?? "none")}</a:ln></p:spPr><p:txBody>${textBody(input.text ?? "", input.fontSize)}</p:txBody></p:sp>`;
  } else if (input.kind === "image") {
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(input.data) || input.data.length % 4)
      throw new TypeError("Image data must be base64.");
    const bytes = Uint8Array.from(atob(input.data), (c) => c.charCodeAt(0));
    if (
      input.contentType === "image/png"
        ? ![137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)
        : !(bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    )
      throw new TypeError("Image bytes do not match the content type.");
    let n = 1;
    const ext = input.contentType === "image/png" ? "png" : "jpg";
    while (artifact.document.package.getPart(`/ppt/media/image${n}.${ext}`)) n++;
    const part = `/ppt/media/image${n}.${ext}`,
      rid = `rIdImage${id}_${n}`;
    tx.addPart(part, input.contentType, bytes).addRelationship(slide.part, {
      id: rid,
      type: `${artifact.document.conformance === "strict" ? "http://purl.oclc.org/ooxml/officeDocument/relationships" : R}/image`,
      target: part,
    });
    markup = `<p:pic ${ns}><p:nvPicPr><p:cNvPr id="${id}" name="Picture ${id}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${transform}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
  } else {
    if (
      !Number.isInteger(input.rows) ||
      !Number.isInteger(input.columns) ||
      input.rows < 1 ||
      input.columns < 1
    )
      throw new RangeError("Table rows and columns must be positive integers.");
    const cell = `<a:tc><a:txBody>${textBody("", 18)}</a:txBody><a:tcPr>${color("#FFFFFF")}</a:tcPr></a:tc>`;
    markup = `<p:graphicFrame ${ns}><p:nvGraphicFramePr><p:cNvPr id="${id}" name="Table ${id}"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${emu(bounds.x)}" y="${emu(bounds.y)}"/><a:ext cx="${emu(bounds.width)}" cy="${emu(bounds.height)}"/></p:xfrm><a:graphic><a:graphicData uri="${A}/table"><a:tbl><a:tblPr firstRow="1" bandRow="1"/><a:tblGrid>${Array.from({ length: input.columns }, () => `<a:gridCol w="${emu(bounds.width / input.columns)}"/>`).join("")}</a:tblGrid>${Array.from({ length: input.rows }, () => `<a:tr h="${emu(bounds.height / input.rows)}">${cell.repeat(input.columns)}</a:tr>`).join("")}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
  }
  const edit = beginLosslessXmlEdit(source);
  edit.appendMarkup(tree, markup);
  tx.replacePart(slide.part, edit.commit().bytes);
  return openPresentationArtifact(tx.commit(), artifact.options);
}
export function deleteObject(artifact: PresentationArtifact, slideId: string, key: string) {
  editable(artifact);
  const { slide, source, element } = objectTarget(artifact, slideId, key);
  const edit = beginLosslessXmlEdit(source);
  edit.replaceElementMarkup(element, "");
  return commitXml(artifact, slide.part, edit.commit().bytes);
}
export function duplicateObject(artifact: PresentationArtifact, slideId: string, key: string) {
  editable(artifact);
  const { slide, source, element, object } = objectTarget(artifact, slideId, key);
  if (
    !children(children(source.root).find((e) => e.localName === "cSld")!).some(
      (e) => e.localName === "spTree" && children(e).some((n) => n.id === element.id),
    )
  )
    throw new Error("Duplicate the containing group instead.");
  let maxId = 1;
  const visit = (node: typeof element) => {
    for (const child of children(node)) {
      if (child.localName === "cNvPr")
        maxId = Math.max(
          maxId,
          Number(child.attributes.find((a) => a.localName === "id" && !a.namespaceUri)?.value ?? 1),
        );
      visit(child);
    }
  };
  visit(source.root);
  const id = maxId + 1;
  // Only rewrite the root object's identity, preserving relationship ids and all other markup.
  const identity = children(children(element).find((e) => e.localName.startsWith("nv"))!).find(
    (e) => e.localName === "cNvPr",
  )!;
  const idAttr = identity.attributes.find((a) => a.localName === "id" && !a.namespaceUri)!;
  const fragment = raw(source, element),
    start = idAttr.valueSpan.start - element.span.start,
    end = idAttr.valueSpan.end - element.span.start;
  const edit = beginLosslessXmlEdit(source);
  edit.appendMarkup(
    children(children(source.root).find((e) => e.localName === "cSld")!).find(
      (e) => e.localName === "spTree",
    )!,
    fragment.slice(0, start) + id + fragment.slice(end),
  );
  let next = commitXml(artifact, slide.part, edit.commit().bytes);
  const copy = slideById(next, slideId).objects.find((o) => o.shapeId === String(id))!;
  return next.updateObject({
    slideId,
    objectKey: copy.key,
    ...copy.transform,
    x: copy.transform.x + 16,
    y: copy.transform.y + 16,
  });
}
export function arrangeObject(
  artifact: PresentationArtifact,
  slideId: string,
  key: string,
  action:
    | "front"
    | "back"
    | "forward"
    | "backward"
    | "left"
    | "center"
    | "right"
    | "top"
    | "middle"
    | "bottom",
) {
  editable(artifact);
  const { slide, object, source, element } = objectTarget(artifact, slideId, key);
  if (
    !children(children(source.root).find((e) => e.localName === "cSld")!).some(
      (e) => e.localName === "spTree" && children(e).some((n) => n.id === element.id),
    )
  )
    throw new Error("Arrange the containing group instead.");
  const t = object.transform;
  if (["left", "center", "right", "top", "middle", "bottom"].includes(action))
    return artifact.updateObject({
      slideId,
      objectKey: key,
      ...t,
      x:
        action === "left"
          ? 0
          : action === "center"
            ? (artifact.document.width - t.width) / 2
            : action === "right"
              ? artifact.document.width - t.width
              : t.x,
      y:
        action === "top"
          ? 0
          : action === "middle"
            ? (artifact.document.height - t.height) / 2
            : action === "bottom"
              ? artifact.document.height - t.height
              : t.y,
    });
  const tree = children(children(source.root).find((e) => e.localName === "cSld")!).find(
    (e) => e.localName === "spTree",
  )!;
  const elements = children(tree),
    objects = elements.filter((e) => !["nvGrpSpPr", "grpSpPr", "extLst"].includes(e.localName));
  const at = objects.findIndex((e) => e.id === element.id);
  if (at < 0) throw new Error("Object is not a top-level shape.");
  const [item] = objects.splice(at, 1);
  const index =
    action === "front"
      ? objects.length
      : action === "back"
        ? 0
        : action === "forward"
          ? Math.min(at + 1, objects.length)
          : Math.max(0, at - 1);
  objects.splice(index, 0, item!);
  let position = 0;
  const edit = beginLosslessXmlEdit(source);
  for (const e of elements)
    if (objects.some((o) => o.id === e.id))
      edit.replaceElementMarkup(e, raw(source, objects[position++]!));
  return commitXml(artifact, slide.part, edit.commit().bytes);
}
