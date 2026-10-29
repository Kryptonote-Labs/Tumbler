import type { PresentationArtifact } from "./artifact.ts";
import { slideColorHex } from "./editing.ts";
import { objectTarget } from "./authoring-objects.ts";
import { children } from "./authoring-slides.ts";
/** Freeze inherited text styling before the object leaves its source layout. */
export function materializeClipboardText(
  source: PresentationArtifact,
  slideId: string,
  objectKey: string,
) {
  const { object, source: xml } = objectTarget(source, slideId, objectKey);
  const targets = object.table
    ? object.table.cells.map((cell) => ({
        text: cell.text,
        elementId: cell.elementId,
        cell: { row: cell.row, column: cell.column },
      }))
    : [{ text: object.text, elementId: object.elementId, cell: undefined }];
  let result = source;
  if (
    object.kind === "shape" &&
    !object.gradient &&
    !object.pattern &&
    !object.pictureFill &&
    !object.restriction
  ) {
    const fill =
      object.fill === "none"
        ? "none"
        : /,1\)$/.test(object.fill) || /^#[a-f\d]{6}$/i.test(object.fill)
          ? slideColorHex(object.fill)
          : undefined;
    const stroke =
      object.stroke === "none"
        ? "none"
        : /,1\)$/.test(object.stroke) || /^#[a-f\d]{6}$/i.test(object.stroke)
          ? slideColorHex(object.stroke)
          : undefined;
    if (fill !== undefined || stroke !== undefined)
      result = result.styleShape({
        slideId,
        objectKey,
        ...(fill === undefined ? {} : { fill }),
        ...(stroke === undefined ? {} : { stroke }),
      });
  }
  for (const target of targets) {
    if (!target.text?.editable) continue;
    const shape = xml.element(target.elementId)!,
      body = children(shape).find((e) => e.localName === "txBody")!,
      props = children(body).find((e) => e.localName === "bodyPr");
    const auto = props && children(props).find((e) => e.localName === "normAutofit"),
      scale =
        Number(auto?.attributes.find((a) => a.localName === "fontScale")?.value ?? 100000) / 100000;
    let offset = 0;
    for (const paragraph of target.text.paragraphs) {
      for (const run of paragraph.runs) {
        const size = (run.fontSize * 0.75) / (scale || 1);
        result = result.formatText({
          slideId,
          objectKey,
          ...(target.cell ? { cell: target.cell } : {}),
          start: offset,
          end: offset + run.text.length,
          patch: {
            text: {
              fontFamily: { set: run.fontFamily },
              ...(size >= 1 && size <= 409 ? { fontSize: { set: size } } : {}),
              bold: { set: run.bold },
              italic: { set: run.italic },
              ...(/,1\)$/.test(run.color) || /^#[a-f\d]{6}$/i.test(run.color)
                ? { color: { set: { type: "rgb" as const, value: slideColorHex(run.color) } } }
                : {}),
            },
          },
        });
        offset += run.text.length;
      }
      result = result.formatText({
        slideId,
        objectKey,
        ...(target.cell ? { cell: target.cell } : {}),
        start: Math.max(0, offset - paragraph.runs.reduce((n, r) => n + r.text.length, 0)),
        end: offset,
        patch: {
          block: {
            horizontalAlignment: {
              set:
                paragraph.align === "left"
                  ? "start"
                  : paragraph.align === "right"
                    ? "end"
                    : paragraph.align,
            },
          },
        },
      });
      offset++;
    }
  }
  return result;
}
