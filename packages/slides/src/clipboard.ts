import { beginLosslessXmlEdit, type LosslessXmlElement } from "@tumblerjs/ooxml";
import { beginPackageTransaction, relationshipItemName } from "@tumblerjs/opc";
import { openPresentationArtifact, type PresentationArtifact } from "./artifact.ts";
import { objectTarget } from "./authoring-objects.ts";
import { children, editable, raw, slideById } from "./authoring-slides.ts";
import { partXml } from "./authoring-xml.ts";

/** Copy one slide-local object with all relationships needed to preserve its content. */
export function pastePresentationObject(
  destination: PresentationArtifact,
  slideId: string,
  source: PresentationArtifact,
  sourceSlideId: string,
  objectKey: string,
) {
  editable(destination);
  if (source.document.conformance !== destination.document.conformance)
    throw new Error("Clipboard objects must use the destination presentation conformance.");
  const target = slideById(destination, slideId),
    targetSource = partXml(destination, target.part);
  const { source: sourceXml, element, slide } = objectTarget(source, sourceSlideId, objectKey);
  const sourceTree = children(children(sourceXml.root).find((e) => e.localName === "cSld")!).find(
    (e) => e.localName === "spTree",
  )!;
  if (!children(sourceTree).some((e) => e.id === element.id))
    throw new Error("Copy a top-level slide object.");
  const tree = children(children(targetSource.root).find((e) => e.localName === "cSld")!).find(
    (e) => e.localName === "spTree",
  )!;
  const pkg = destination.document.package,
    tx = beginPackageTransaction(pkg);
  const visit = (node: LosslessXmlElement, callback: (node: LosslessXmlElement) => void) => {
    callback(node);
    for (const child of children(node)) visit(child, callback);
  };
  let maxId = 1;
  visit(targetSource.root, (node) => {
    if (node.localName === "cNvPr")
      maxId = Math.max(
        maxId,
        Number(node.attributes.find((a) => !a.namespaceUri && a.localName === "id")?.value ?? 1),
      );
  });
  // A copied fragment must carry namespace declarations inherited from its source ancestors.
  const declarations = new Map<string, string>();
  const find = (node: LosslessXmlElement): boolean => {
    const before = new Map(declarations);
    for (const attr of node.attributes)
      if (attr.qualified === "xmlns" || attr.prefix === "xmlns")
        declarations.set(attr.qualified, attr.value);
    if (node.id === element.id) return true;
    for (const child of children(node)) if (find(child)) return true;
    declarations.clear();
    for (const [k, v] of before) declarations.set(k, v);
    return false;
  };
  find(sourceXml.root);
  const edit = beginLosslessXmlEdit(sourceXml);
  for (const [name, value] of declarations)
    if (!element.attributes.some((a) => a.qualified === name))
      edit.insertAttribute(element, name, value);
  visit(element, (node) => {
    if (node.localName === "cNvPr") {
      const id = node.attributes.find((a) => !a.namespaceUri && a.localName === "id");
      if (id) edit.setAttribute(id, String(++maxId));
    }
  });
  let rootNumber = 1;
  while (pkg.parts.some((part) => part.name.value.startsWith(`/ppt/clipboard/copy${rootNumber}/`)))
    rootNumber++;
  const root = `/ppt/clipboard/copy${rootNumber}`;
  const copied = new Map<string, string>();
  const copyPart = (name: string): string => {
    const prior = copied.get(name);
    if (prior) return prior;
    const original = source.document.package.getPart(name);
    if (!original) throw new Error("Clipboard resource is missing.");
    const dest = root + name;
    copied.set(name, dest);
    tx.addPart(dest, original.contentType, source.document.package.readPart(original));
    for (const rel of source.document.package.archive.get(relationshipItemName(original.name))
      ? source.document.package.relationships(original.name).items
      : [])
      tx.addRelationship(
        dest,
        rel.targetMode === "External"
          ? { id: rel.id, type: rel.type, target: rel.target, targetMode: "External" }
          : {
              id: rel.id,
              type: rel.type,
              target: copyPart(rel.targetPartName.value),
              ...(rel.fragment ? { fragment: rel.fragment } : {}),
            },
      );
    return dest;
  };
  const relationships = source.document.package.relationships(
    source.document.package.getPart(slide.part)!.name,
  );
  const used = new Set(pkg.relationships(pkg.getPart(target.part)!.name).items.map((r) => r.id));
  const remapped = new Map<string, string>();
  visit(element, (node) => {
    for (const attr of node.attributes) {
      if (
        ![
          "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
          "http://purl.oclc.org/ooxml/officeDocument/relationships",
        ].includes(attr.namespaceUri)
      )
        continue;
      let id = remapped.get(attr.value);
      if (!id) {
        const rel = relationships.get(attr.value);
        if (!rel) throw new Error("Clipboard relationship is missing.");
        let n = 1;
        while (used.has(`rIdClipboard${n}`)) n++;
        id = `rIdClipboard${n}`;
        used.add(id);
        remapped.set(attr.value, id);
        tx.addRelationship(
          target.part,
          rel.targetMode === "External"
            ? { id, type: rel.type, target: rel.target, targetMode: "External" }
            : {
                id,
                type: rel.type,
                target: copyPart(rel.targetPartName.value),
                ...(rel.fragment ? { fragment: rel.fragment } : {}),
              },
        );
      }
      edit.setAttribute(attr, id);
    }
  });
  const edited = edit.commit().document;
  const fragment = edited.element(element.id)!;
  // Element ids are stable for source edits, but added resource declarations do not alter child order.
  const markup = raw(edited, fragment);
  const targetEdit = beginLosslessXmlEdit(targetSource),
    extension = children(tree).find((e) => e.localName === "extLst");
  if (extension) targetEdit.insertMarkupBefore(extension, markup);
  else targetEdit.appendMarkup(tree, markup);
  tx.replacePart(target.part, targetEdit.commit().bytes);
  return openPresentationArtifact(tx.commit(), destination.options);
}
