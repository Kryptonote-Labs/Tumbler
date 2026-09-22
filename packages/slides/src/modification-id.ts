import {
  beginLosslessXmlEdit,
  parseLosslessXml,
  type LosslessXmlElement,
} from "@tumblerjs/ooxml";
const namespace = "http://schemas.microsoft.com/office/powerpoint/2010/main";
const children = (e: LosslessXmlElement) =>
  e.children.filter((n): n is LosslessXmlElement => n.kind === "element");
const value = (e: LosslessXmlElement, name: string) =>
  e.attributes.find((a) => a.namespaceUri === "" && a.localName === name)
    ?.value;
/** MS-PPTX 2.3.1.19: this extension is edit metadata, not unsupported object content. */
export function isModificationIdList(element: LosslessXmlElement): boolean {
  return children(element).every(
    (extension) =>
      extension.localName === "ext" &&
      value(extension, "uri") === "{D42A27DB-BD31-4B8C-83A1-F6EECF244321}" &&
      children(extension).length === 1 &&
      children(extension).every(
        (child) =>
          child.namespaceUri === namespace &&
          child.localName === "modId" &&
          children(child).length === 0 &&
          /^\d+$/.test(value(child, "val") ?? "") &&
          Number(value(child, "val")) <= 4294967295,
      ),
  );
}
/** Refresh modified-shape IDs and avoid collisions anywhere on the owning slide.
 * https://learn.microsoft.com/en-us/openspecs/office_standards/ms-pptx/c7f10e50-8b6f-42e0-9926-e1d15f6a4861
 */
export function refreshModificationId(
  bytes: Uint8Array,
  shapeId: string,
): Uint8Array {
  const source = parseLosslessXml(bytes),
    ids = source.elements(namespace, "modId");
  if (!ids.length) return bytes;
  const metadata = source
    .elements()
    .find((e) => e.localName === "cNvPr" && value(e, "id") === shapeId);
  if (!metadata) return bytes;
  const shape = source
    .elements()
    .find(
      (e) =>
        ["sp", "pic", "graphicFrame"].includes(e.localName) &&
        e.span.start < metadata.span.start &&
        e.span.end > metadata.span.end,
    );
  if (!shape) return bytes;
  const owned = ids.filter(
    (e) => e.span.start > shape.span.start && e.span.end < shape.span.end,
  );
  if (!owned.length) return bytes;
  const used = new Set(ids.map((e) => Number(value(e, "val")))),
    editor = beginLosslessXmlEdit(source);
  for (const id of owned) {
    const attribute = id.attributes.find(
      (a) => a.namespaceUri === "" && a.localName === "val",
    )!;
    let next = (Number(attribute.value) + 1) >>> 0;
    while (used.has(next)) next = (next + 1) >>> 0;
    used.add(next);
    editor.setAttribute(attribute, String(next));
  }
  return editor.commit().bytes;
}
