import { beginLosslessXmlEdit } from "@tumblerjs/ooxml";
import type { PresentationArtifact } from "./artifact.ts";
import type { PresentationCommand } from "./commands.ts";
import { children, raw } from "./authoring-slides.ts";
import { objectTarget } from "./authoring-objects.ts";
import { commitXml, xml } from "./authoring-xml.ts";
import { presentationTextTarget, slideTextValue } from "./editing.ts";

/** DrawingML paragraph properties stay on the paragraphs they affect. */
export function paragraphFormat(
  artifact: PresentationArtifact,
  command: Extract<PresentationCommand, { name: "paragraph" }>,
) {
  const { slide, object, source } = objectTarget(artifact, command.slideId, command.objectKey);
  const target = presentationTextTarget(object, command.cell);
  if (!target.textEditable) throw new Error("This text is read-only.");
  const value = slideTextValue(target);
  if (command.end < command.start || command.end > value.length)
    throw new RangeError("Invalid text range.");
  const shape = source.element(target.elementId)!,
    body = children(shape).find((e) => e.localName === "txBody")!;
  const edit = beginLosslessXmlEdit(source);
  const a =
    artifact.document.conformance === "strict"
      ? "http://purl.oclc.org/ooxml/drawingml/main"
      : "http://schemas.openxmlformats.org/drawingml/2006/main";
  let offset = 0;
  const paras = children(body).filter((e) => e.localName === "p");
  for (let i = 0; i < paras.length; i++) {
    const para = paras[i]!,
      text = target.text!.paragraphs[i]!;
    const length = text.runs.map((r) => r.text).join("").length,
      start = offset;
    offset += length + 1;
    if (
      command.start > start + length ||
      command.end < start ||
      (command.end === start && command.start !== command.end)
    )
      continue;
    const props = children(para).find((e) => e.localName === "pPr");
    const attrs = new Map(
      props?.attributes
        .filter((a) => a.qualified !== "xmlns:a")
        .map((a) => [a.qualified, a.value]) ?? [],
    );
    if (command.level !== undefined) attrs.set("lvl", String(command.level));
    const remove = new Set<string>();
    const additions: { name: string; markup: string }[] = [];
    if (command.bullet !== undefined) {
      for (const name of ["buNone", "buChar", "buAutoNum", "buBlip"]) remove.add(name);
      additions.push({
        name: "bullet",
        markup:
          command.bullet === "none"
            ? "<a:buNone/>"
            : command.bullet === "bullet"
              ? '<a:buChar char="•"/>'
              : '<a:buAutoNum type="arabicPeriod"/>',
      });
      attrs.set(
        "marL",
        command.bullet === "none" ? "0" : String(342900 * ((command.level ?? 0) + 1)),
      );
      attrs.set("indent", command.bullet === "none" ? "0" : "-285750");
    }
    for (const [field, name] of [
      ["lineSpacing", "lnSpc"],
      ["before", "spcBef"],
      ["after", "spcAft"],
    ] as const) {
      const n = command[field];
      if (n === undefined) continue;
      remove.add(name);
      additions.push({
        name,
        markup: `<a:${name}><a:${field === "lineSpacing" ? "spcPct" : "spcPts"} val="${Math.round(n * (field === "lineSpacing" ? 100000 : 100))}"/></a:${name}>`,
      });
    }
    const nodes = (props ? children(props) : [])
      .filter((e) => !remove.has(e.localName))
      .map((e) => ({ name: e.localName, markup: raw(source, e) }));
    nodes.push(...additions);
    const order = [
      "lnSpc",
      "spcBef",
      "spcAft",
      "buClrTx",
      "buClr",
      "buSzTx",
      "buSzPct",
      "buSzPts",
      "buFontTx",
      "buFont",
      "buNone",
      "buAutoNum",
      "buChar",
      "buBlip",
      "bullet",
      "tabLst",
      "defRPr",
      "extLst",
    ];
    nodes.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
    const markup = `<a:pPr xmlns:a="${a}" ${[...attrs].map(([key, value]) => `${key}="${xml(value)}"`).join(" ")}>${nodes.map((n) => n.markup).join("")}</a:pPr>`;
    if (props) edit.replaceElementMarkup(props, markup);
    else if (children(para)[0]) edit.insertMarkupBefore(children(para)[0]!, markup);
    else edit.replaceElementMarkup(para, `<${para.qualified}>${markup}</${para.qualified}>`);
  }
  if (command.verticalAlignment !== undefined) {
    const props = command.cell
      ? children(shape).find((e) => e.localName === "tcPr")!
      : children(body).find((e) => e.localName === "bodyPr")!;
    const attr = props.attributes.find((a) => !a.namespaceUri && a.localName === "anchor");
    const v = { top: "t", center: "ctr", bottom: "b" }[command.verticalAlignment];
    if (attr) edit.setAttribute(attr, v);
    else edit.insertAttribute(props, "anchor", v);
  }
  return commitXml(artifact, slide.part, edit.commit().bytes);
}
