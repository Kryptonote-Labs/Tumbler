import { newSlideLayout } from "./new-slide-layout.ts";
import { applyPresentationLayout } from "./authoring-layout.ts";
import { beginPackageTransaction } from "@tumblerjs/opc";
import { beginLosslessXmlEdit, type LosslessXmlElement } from "@tumblerjs/ooxml";
import { openPresentationArtifact, type PresentationArtifact } from "./artifact.ts";
import { encoder, partXml, P, A, R, slideXml, type, commitXml, xml } from "./authoring-xml.ts";

export type SlideLayout = "blank" | "title" | "title-content" | "two-content";
export function slideById(artifact: PresentationArtifact, id: string) {
  const slide = artifact.document.slides.find((s) => s.id === id);
  if (!slide) throw new Error("Slide not found.");
  return slide;
}
export function editable(artifact: PresentationArtifact) {
  if (artifact.document.signed) throw new Error("Signed presentations are read-only.");
}
export function mainPart(artifact: PresentationArtifact) {
  return artifact.document.package.mainOfficeDocumentPart().name.value;
}
export function children(element: LosslessXmlElement) {
  return element.children.filter((e) => e.kind === "element");
}
export function raw(source: { source: string }, element: LosslessXmlElement) {
  return source.source.slice(element.span.start, element.span.end);
}
export function insertSlide(
  artifact: PresentationArtifact,
  index: number,
  sourceId?: string,
  layoutSourceId?: string,
) {
  editable(artifact);
  if (!Number.isInteger(index) || index < 0 || index > artifact.document.slides.length)
    throw new RangeError("Invalid slide position.");
  const pkg = artifact.document.package,
    main = mainPart(artifact),
    source = partXml(artifact, main);
  const list = children(source.root).find((e) => e.localName === "sldIdLst");
  if (!list) throw new Error("Slide list is missing.");
  const ids = children(list);
  let n = 1;
  while (pkg.getPart(`/ppt/slides/slide${n}.xml`)) n++;
  const part = `/ppt/slides/slide${n}.xml`;
  const used = new Set(pkg.relationships(pkg.getPart(main)!.name).items.map((r) => r.id));
  let rid = "rIdSlide" + n;
  while (used.has(rid)) rid += "_";
  const id =
    Math.max(
      255,
      ...ids.map((e) =>
        Number(e.attributes.find((a) => a.localName === "id" && !a.namespaceUri)?.value ?? 255),
      ),
    ) + 1;
  if (id >= 2147483648) throw new RangeError("No slide identifiers remain.");
  const tx = beginPackageTransaction(pkg);
  if (sourceId && layoutSourceId)
    throw new Error("Choose duplication or a layout source, not both.");
  const original = sourceId ? slideById(artifact, sourceId) : undefined;
  const donorId = layoutSourceId ?? artifact.document.slides[Math.max(0, index - 1)]?.id;
  const layout = !original && donorId ? newSlideLayout(artifact, donorId) : undefined;
  tx.addPart(
    part,
    type("slide"),
    original
      ? pkg.readPart(pkg.getPart(original.part)!)
      : encoder.encode(
          artifact.document.conformance === "strict"
            ? slideXml(layout?.objects)
                .replaceAll(P, "http://purl.oclc.org/ooxml/presentationml/main")
                .replaceAll(A, "http://purl.oclc.org/ooxml/drawingml/main")
                .replaceAll(R, "http://purl.oclc.org/ooxml/officeDocument/relationships")
            : slideXml(layout?.objects),
        ),
  );
  if (original)
    for (const rel of pkg.relationships(pkg.getPart(original.part)!.name).items) {
      // Notes belong to one slide; copies must not alias the original's notes.
      if (rel.type.endsWith("/notesSlide")) continue;
      tx.addRelationship(
        part,
        rel.targetMode === "External"
          ? { id: rel.id, type: rel.type, target: rel.target, targetMode: "External" }
          : {
              id: rel.id,
              type: rel.type,
              target: rel.targetPartName,
              ...(rel.fragment === undefined ? {} : { fragment: rel.fragment }),
            },
      );
    }
  else if (layout?.part)
    tx.addRelationship(part, {
      id: "rIdLayout",
      type: `${artifact.document.conformance === "strict" ? "http://purl.oclc.org/ooxml/officeDocument/relationships" : R}/slideLayout`,
      target: layout.part,
    });
  tx.addRelationship(main, {
    id: rid,
    type: `${artifact.document.conformance === "strict" ? "http://purl.oclc.org/ooxml/officeDocument/relationships" : R}/slide`,
    target: part,
  });
  const edit = beginLosslessXmlEdit(source),
    markup = `<p:sldId xmlns:p="${source.root.namespaceUri}" xmlns:r="${artifact.document.conformance === "strict" ? "http://purl.oclc.org/ooxml/officeDocument/relationships" : R}" id="${id}" r:id="${rid}"/>`;
  if (ids[index]) edit.insertMarkupBefore(ids[index]!, markup);
  else edit.appendMarkup(list, markup);
  tx.replacePart(main, edit.commit().bytes);
  const result = openPresentationArtifact(tx.commit(), artifact.options);
  return layout?.fallback ? applyPresentationLayout(result, String(id), layout.fallback) : result;
}
export function deleteSlide(artifact: PresentationArtifact, id: string) {
  editable(artifact);
  if (artifact.document.slides.length === 1)
    throw new Error("Keep at least one slide in the presentation.");
  slideById(artifact, id);
  const main = mainPart(artifact),
    source = partXml(artifact, main);
  const list = children(source.root).find((e) => e.localName === "sldIdLst")!;
  const item = children(list).find((e) =>
    e.attributes.some((a) => a.localName === "id" && !a.namespaceUri && a.value === id),
  );
  if (!item) throw new Error("Slide identity is missing.");
  const rid = item.attributes.find((a) => a.localName === "id" && a.namespaceUri)!.value;
  const edit = beginLosslessXmlEdit(source);
  edit.replaceElementMarkup(item, "");
  // Retain detached parts: other slides may reference the removed slide via hyperlinks.
  const tx = beginPackageTransaction(artifact.document.package)
    .replacePart(main, edit.commit().bytes)
    .removeRelationship(main, rid);
  return openPresentationArtifact(tx.commit(), artifact.options);
}
export function moveSlide(artifact: PresentationArtifact, id: string, index: number) {
  editable(artifact);
  slideById(artifact, id);
  if (!Number.isInteger(index) || index < 0 || index >= artifact.document.slides.length)
    throw new RangeError("Invalid slide position.");
  const main = mainPart(artifact),
    source = partXml(artifact, main),
    list = children(source.root).find((e) => e.localName === "sldIdLst")!;
  const items = children(list),
    from = items.findIndex((e) =>
      e.attributes.some((a) => !a.namespaceUri && a.localName === "id" && a.value === id),
    );
  const [item] = items.splice(from, 1);
  items.splice(index, 0, item!);
  const edit = beginLosslessXmlEdit(source);
  edit.replaceElementMarkup(
    list,
    `${source.source.slice(list.startTagSpan.start, list.startTagSpan.end)}${items.map((e) => raw(source, e)).join("")}</${list.qualified}>`,
  );
  return commitXml(artifact, main, edit.commit().bytes);
}
/** Keep a slide editable while excluding it from the slideshow. */
export function setSlideHidden(artifact: PresentationArtifact, id: string, hidden: boolean) {
  editable(artifact);
  const slide = slideById(artifact, id);
  if (slide.hidden === hidden) return artifact;
  const source = partXml(artifact, slide.part);
  const show = source.root.attributes.find((a) => a.localName === "show" && !a.namespaceUri);
  const edit = beginLosslessXmlEdit(source);
  if (show) edit.setAttribute(show, hidden ? "0" : "1");
  else edit.insertAttribute(source.root, "show", hidden ? "0" : "1");
  return commitXml(artifact, slide.part, edit.commit().bytes);
}

/** Write speaker notes without replacing slide content or notes placeholders. */
export function setSlideNotes(artifact: PresentationArtifact, id: string, notes: string) {
  editable(artifact);
  const slide = slideById(artifact, id), pkg = artifact.document.package;
  const relation = pkg.relationships(pkg.getPart(slide.part)!.name).items.find(r => r.type.endsWith('/notesSlide'));
  const strict = artifact.document.conformance === 'strict';
  const p = strict ? 'http://purl.oclc.org/ooxml/presentationml/main' : P;
  const a = strict ? 'http://purl.oclc.org/ooxml/drawingml/main' : A;
  const r = strict ? 'http://purl.oclc.org/ooxml/officeDocument/relationships' : R;
  const paragraphs = notes.split('\n').map(line => `<a:p><a:r><a:t xml:space="preserve">${xml(line)}</a:t></a:r></a:p>`).join('');
  const body = `<p:txBody xmlns:p="${p}" xmlns:a="${a}"><a:bodyPr/><a:lstStyle/>${paragraphs}</p:txBody>`;
  const shape = `<p:sp xmlns:p="${p}"><p:nvSpPr><p:cNvPr id="2" name="Notes"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/>${body}</p:sp>`;
  const tx = beginPackageTransaction(pkg);
  if (relation && relation.targetMode !== 'External') {
    const source = partXml(artifact, relation.targetPartName.value);
    const tree = children(source.root).find(e => e.localName === 'cSld');
    const shapes = tree && children(tree).find(e => e.localName === 'spTree');
    if (!shapes) throw new Error('Notes shape tree is missing.');
    const target = children(shapes).find(e => e.localName === 'sp' && children(e).some(n => n.localName === 'nvSpPr' && children(n).some(v => v.localName === 'nvPr' && children(v).some(ph => ph.localName === 'ph' && ph.attributes.some(a => a.localName === 'type' && a.value === 'body')))));
    const edit = beginLosslessXmlEdit(source);
    const text = target && children(target).find(e => e.localName === 'txBody');
    if (text) edit.replaceElementMarkup(text, body);
    else if (target) edit.appendMarkup(target, body);
    else {
      const ids = new Set(children(shapes).flatMap(s => children(s).flatMap(n => children(n))).filter(e => e.localName === 'cNvPr').flatMap(e => e.attributes.filter(a => a.localName === 'id').map(a => a.value)));
      let id = 2; while (ids.has(String(id))) id++;
      edit.appendMarkup(shapes, shape.replace('id="2"', `id="${id}"`));
    }
    tx.replacePart(relation.targetPartName, edit.commit().bytes);
  } else {
    let n = 1;
    while (pkg.getPart(`/ppt/notesSlides/notesSlide${n}.xml`)) n++;
    const part = `/ppt/notesSlides/notesSlide${n}.xml`;
    tx.addPart(part, type('notesSlide'), encoder.encode(`<p:notes xmlns:p="${p}" xmlns:a="${a}"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${shape}</p:spTree></p:cSld></p:notes>`));
    let rid = 'rIdNotes';
    const ids = new Set(pkg.relationships(pkg.getPart(slide.part)!.name).items.map(r => r.id));
    while (ids.has(rid)) rid += '_';
    tx.addRelationship(slide.part, { id: rid, type: `${r}/notesSlide`, target: part });
    tx.addRelationship(part, { id: 'rIdSlide', type: `${r}/slide`, target: slide.part });
  }
  return openPresentationArtifact(tx.commit(), artifact.options);
}
