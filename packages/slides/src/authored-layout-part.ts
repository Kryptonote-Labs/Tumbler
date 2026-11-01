import { beginPackageTransaction } from "@tumblerjs/opc";
import { beginLosslessXmlEdit } from "@tumblerjs/ooxml";
import type { PresentationArtifact } from "./artifact.ts";
import type { PresentationLayout } from "./authoring-layout.ts";
import { children, slideById } from "./authoring-slides.ts";
import { A, P, R, encoder, group, namespaces, partXml, type } from "./authoring-xml.ts";
import { openPresentationArtifact } from "./artifact.ts";

/** Keep a reusable layout relationship when applying one of the built-in authoring layouts. */
export function attachAuthoredLayout(
  artifact: PresentationArtifact,
  slideId: string,
  layout: PresentationLayout,
  objects: string,
) {
  const pkg = artifact.document.package;
  const slide = slideById(artifact, slideId);
  const relation = pkg
    .relationships(pkg.getPart(slide.part)!.name)
    .items.find((r) => r.type.endsWith("/slideLayout"));
  if (relation?.targetMode !== "Internal") return artifact;
  const currentLayout = pkg.getPart(relation.targetPartName)!;
  const masterRel = pkg
    .relationships(currentLayout.name)
    .items.find((r) => r.type.endsWith("/slideMaster"));
  if (masterRel?.targetMode !== "Internal") return artifact;
  const masterPart = masterRel.targetPartName.value;
  const strict = artifact.document.conformance === "strict";
  const relNamespace = strict ? "http://purl.oclc.org/ooxml/officeDocument/relationships" : R;
  const kinds = { blank: "blank", title: "title", "title-content": "obj", "two-content": "twoObj" };
  let markup = `<p:sldLayout ${namespaces} type="${kinds[layout]}" preserve="1"><p:cSld name="${layout}"><p:spTree>${group}${objects}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
  if (strict)
    markup = markup
      .replaceAll(P, "http://purl.oclc.org/ooxml/presentationml/main")
      .replaceAll(A, "http://purl.oclc.org/ooxml/drawingml/main")
      .replaceAll(R, relNamespace);
  const master = partXml(artifact, masterPart);
  const list = children(master.root).find((e) => e.localName === "sldLayoutIdLst");
  if (!list) throw new Error("Slide master layout list is missing.");
  const masterRels = pkg.relationships(pkg.getPart(masterPart)!.name);
  // Reuse an identical authored layout on this master, never a layout from another theme.
  const existing = masterRels.items.find(
    (r) =>
      r.targetMode === "Internal" &&
      r.type.endsWith("/slideLayout") &&
      new TextDecoder().decode(pkg.readPart(pkg.getPart(r.targetPartName)!)) === markup,
  );
  const tx = beginPackageTransaction(pkg);
  let target = existing?.targetMode === "Internal" ? existing.targetPartName.value : undefined;
  if (!target) {
    let n = 1;
    while (pkg.getPart(`/ppt/slideLayouts/tumbler${n}.xml`)) n++;
    target = `/ppt/slideLayouts/tumbler${n}.xml`;
    tx.addPart(target, type("slideLayout"), encoder.encode(markup));
    tx.addRelationship(target, {
      id: "rIdMaster",
      type: `${relNamespace}/slideMaster`,
      target: masterPart,
    });
    let rid = `rIdTumbler${n}`;
    while (masterRels.get(rid)) rid += "_";
    tx.addRelationship(masterPart, { id: rid, type: `${relNamespace}/slideLayout`, target });
    const ids = children(list).map((e) =>
      Number(
        e.attributes.find((a) => !a.namespaceUri && a.localName === "id")?.value ?? 2147483648,
      ),
    );
    const id = Math.max(2147483648, ...ids) + 1;
    if (id >= 4294967296) throw new RangeError("No slide layout identifiers remain.");
    const edit = beginLosslessXmlEdit(master);
    edit.appendMarkup(
      list,
      `<p:sldLayoutId xmlns:p="${master.root.namespaceUri}" xmlns:r="${relNamespace}" id="${id}" r:id="${rid}"/>`,
    );
    tx.replacePart(masterPart, edit.commit().bytes);
  }
  tx.removeRelationship(slide.part, relation.id);
  tx.addRelationship(slide.part, { id: relation.id, type: relation.type, target });
  return openPresentationArtifact(tx.commit(), artifact.options);
}
