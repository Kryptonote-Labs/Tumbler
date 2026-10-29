import { beginLosslessXmlEdit } from "@tumblerjs/ooxml";
import type { PresentationArtifact } from "./artifact.ts";
import { objectTarget } from "./authoring-objects.ts";
import { children, raw } from "./authoring-slides.ts";
import { commitXml, xml } from "./authoring-xml.ts";
import { presentationClipboardLine, presentationClipboardTheme } from "./reader.ts";
/** A local outline must carry the complete source style, including width, dash, caps and ends. */
export function materializeClipboardLine(
  source: PresentationArtifact,
  slideId: string,
  objectKey: string,
) {
  const { slide, source: ownXml, element } = objectTarget(source, slideId, objectKey),
    props = children(element).find((e) => e.localName === "spPr");
  if (!props || children(props).some((e) => e.localName === "ln")) return source;
  const line = presentationClipboardLine(source.document, slideId, objectKey);
  if (!line) return source;
  const theme = presentationClipboardTheme(source.document, slideId),
    edit = beginLosslessXmlEdit(line.xml);
  const node = line.element,
    bindings = new Map<string, string>();
  const find = (element: typeof node): boolean => {
    const before = new Map(bindings);
    for (const attr of element.attributes)
      if (attr.qualified === "xmlns" || attr.prefix === "xmlns")
        bindings.set(attr.qualified, attr.value);
    if (element.id === node.id) return true;
    for (const child of children(element)) if (find(child)) return true;
    bindings.clear();
    for (const [k, v] of before) bindings.set(k, v);
    return false;
  };
  find(line.xml.root);
  for (const [name, value] of bindings)
    if (!node.attributes.some((a) => a.qualified === name)) edit.insertAttribute(node, name, value);
  const visit = (element: typeof node) => {
    if (element.localName === "schemeClr") {
      const name = element.attributes.find((a) => a.localName === "val")?.value ?? "",
        value = name === "phClr" ? line.placeholder : theme.color(name);
      if (value) {
        const rgba = /^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/.exec(value),
          hex = rgba
            ? rgba
                .slice(1, 4)
                .map((n) => Number(n).toString(16).padStart(2, "0"))
                .join("")
            : value.replace(/^#/, "");
        const q = element.prefix ? element.prefix + ":" : "",
          alpha =
            rgba && Number(rgba[4]) !== 1
              ? `<${q}alpha val="${Math.round(Number(rgba[4]) * 100000)}"/>`
              : "";
        const declarations = element.attributes
          .filter((a) => a.qualified === "xmlns" || a.prefix === "xmlns")
          .map((a) => ` ${a.qualified}="${xml(a.value)}"`)
          .join("");
        edit.replaceElementMarkup(
          element,
          `<${q}srgbClr${declarations} val="${hex}">${alpha}${children(element)
            .map((e) => raw(line.xml, e))
            .join("")}</${q}srgbClr>`,
        );
      }
    }
    for (const child of children(element)) visit(child);
  };
  visit(node);
  const copied = edit.commit().document,
    markup = raw(copied, copied.element(node.id)!);
  const own = beginLosslessXmlEdit(ownXml),
    after = children(props).find((e) =>
      ["effectLst", "effectDag", "scene3d", "sp3d", "extLst"].includes(e.localName),
    );
  if (props.selfClosing)
    own.replaceElementMarkup(
      props,
      ownXml.source
        .slice(props.startTagSpan.start, props.startTagSpan.end)
        .replace(/\/\s*>$/, ">") +
        markup +
        `</${props.qualified}>`,
    );
  else if (after) own.insertMarkupBefore(after, markup);
  else own.appendMarkup(props, markup);
  return commitXml(source, slide.part, own.commit().bytes);
}
