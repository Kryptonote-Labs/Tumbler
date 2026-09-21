import { refreshModificationId } from "./modification-id.ts";
import {
  editPresentationText,
  presentationTextTarget,
  editPresentationShape,
  type PresentationTextEdit,
  type PresentationFormatChange,
  type PresentationShapeChange,
} from "./editing.ts";
import {
  beginLosslessXmlEdit,
  type LosslessXmlElement,
} from "@tumblerjs/ooxml";
import { beginPackageTransaction } from "@tumblerjs/opc";
import { EMUS_PER_PIXEL } from "./geometry.ts";
import { openPresentationDocument } from "./reader.ts";
import {
  PresentationError,
  type OpenPresentationOptions,
  type PresentationDocument,
  type PresentationObjectChange,
} from "./model.ts";

/** Immutable presentation edits. Only the owning slide XML part is replaced. */
export class PresentationArtifact {
  constructor(
    readonly document: PresentationDocument,
    readonly options: OpenPresentationOptions = {},
  ) {}
  bytes(): Uint8Array {
    return this.document.package.archive.originalBytes();
  }
  private target(slideId: string, key: string) {
    const slide = this.document.slides.find((item) => item.id === slideId);
    const object = slide?.objects.find((item) => item.key === key);
    if (!slide || !object)
      throw new PresentationError(
        "invalid_document",
        "The slide object does not exist.",
      );
    const source = this.document.sources.get(object.sourcePart);
    if (!source)
      throw new PresentationError("invalid_document", "Missing source XML.");
    return { object, source };
  }
  editText(change: PresentationTextEdit): PresentationArtifact {
    const { object, source } = this.target(change.slideId, change.objectKey);
    return this.commitPart(
      object.sourcePart,
      editPresentationText(
        source,
        presentationTextTarget(object, change.cell),
        change,
        change.value,
        change.formatting,
      ),
      object.shapeId,
    );
  }
  formatText(change: PresentationFormatChange): PresentationArtifact {
    const { object, source } = this.target(change.slideId, change.objectKey);
    return this.commitPart(
      object.sourcePart,
      editPresentationText(
        source,
        presentationTextTarget(object, change.cell),
        change,
        undefined,
        change.patch,
      ),
      object.shapeId,
    );
  }
  styleShape(change: PresentationShapeChange): PresentationArtifact {
    const { object, source } = this.target(change.slideId, change.objectKey);
    return this.commitPart(
      object.sourcePart,
      editPresentationShape(source, object, change),
      object.shapeId,
    );
  }
  private commitPart(
    part: string,
    bytes: Uint8Array,
    shapeId: string,
  ): PresentationArtifact {
    const original = this.document.package.readPart(
      this.document.package.getPart(part)!,
    );
    if (
      original.length === bytes.length &&
      original.every((byte, index) => byte === bytes[index])
    )
      return this;
    const transaction = beginPackageTransaction(this.document.package);
    transaction.replacePart(part, refreshModificationId(bytes, shapeId));
    return openPresentationArtifact(transaction.commit(), this.options);
  }
  updateObject(change: PresentationObjectChange): PresentationArtifact {
    const { object, source } = this.target(change.slideId, change.objectKey);
    if (!object.movable || object.transformElementId === undefined)
      throw new PresentationError(
        "unsupported_edit",
        object.restriction ?? "This object cannot be moved.",
      );
    const rotation = change.rotation ?? object.transform.rotation;
    if (!Number.isFinite(rotation))
      throw new RangeError("Rotation must be finite.");
    const angle =
      Math.round((((rotation % 360) + 360) % 360) * 60000) % 21600000;
    const previousAngle =
      Math.round((((object.transform.rotation % 360) + 360) % 360) * 60000) %
      21600000;
    const values = [change.x, change.y, change.width, change.height];
    const validDimensions =
      object.geometry === "line"
        ? change.width >= 0 &&
          change.height >= 0 &&
          change.width + change.height > 0
        : change.width > 0 && change.height > 0;
    if (
      values.some(
        (value) =>
          !Number.isFinite(value) ||
          Math.abs(value * EMUS_PER_PIXEL) > 2147483647,
      ) ||
      !validDimensions
    )
      throw new RangeError(
        "Object bounds must be finite with valid dimensions.",
      );
    if (
      angle === previousAngle &&
      values.every(
        (value, index) =>
          Math.round(value * EMUS_PER_PIXEL) ===
          Math.round(
            [
              object.transform.x,
              object.transform.y,
              object.transform.width,
              object.transform.height,
            ][index]! * EMUS_PER_PIXEL,
          ),
      )
    )
      return this;
    const transform = source.element(object.transformElementId)!;
    // Inherited transforms need a local override; this first edit family requires a local transform.
    if (
      transform.span.start < source.element(object.elementId)!.span.start ||
      transform.span.end > source.element(object.elementId)!.span.end
    )
      throw new PresentationError(
        "unsupported_edit",
        "Inherited geometry is read-only.",
      );
    const editor = beginLosslessXmlEdit(source);
    if (angle !== previousAngle) {
      const attribute = transform.attributes.find(
        (item) => item.namespaceUri === "" && item.localName === "rot",
      );
      if (attribute) editor.setAttribute(attribute, String(angle));
      else editor.insertAttribute(transform, "rot", String(angle));
    }
    for (const [name, attributes] of [
      ["off", { x: change.x, y: change.y }],
      ["ext", { cx: change.width, cy: change.height }],
    ] as const) {
      const element = transform.children.find(
        (item) => item.kind === "element" && item.localName === name,
      );
      if (!element || element.kind !== "element")
        throw new PresentationError(
          "unsupported_edit",
          "The transform is incomplete.",
        );
      for (const [key, value] of Object.entries(attributes)) {
        const attribute = element.attributes.find(
          (item) => item.localName === key && item.namespaceUri === "",
        );
        if (!attribute)
          throw new PresentationError(
            "unsupported_edit",
            "The transform is incomplete.",
          );
        editor.setAttribute(
          attribute,
          String(Math.round(value * EMUS_PER_PIXEL)),
        );
      }
    }
    if (
      object.table &&
      (change.width !== object.transform.width ||
        change.height !== object.transform.height)
    ) {
      const table = source.element(object.table.elementId)!;
      const children = table.children.filter((node) => node.kind === "element");
      const grid = children.find((node) => node.localName === "tblGrid")!;
      const columns = grid.children.filter(
        (node): node is LosslessXmlElement =>
          node.kind === "element" && node.localName === "gridCol",
      );
      const rows = children.filter((node) => node.localName === "tr");
      for (const [entries, attribute, total] of [
        [columns, "w", change.width],
        [rows, "h", change.height],
      ] as const) {
        const target = Math.round(total * EMUS_PER_PIXEL);
        if (target < entries.length)
          throw new RangeError("The table is too small for its grid.");
        const attributes = entries.map(
          (entry) =>
            entry.attributes.find(
              (a) => a.localName === attribute && a.namespaceUri === "",
            )!,
        );
        const weights = attributes.map((a) => Number(a.value));
        const sum = weights.reduce((a, b) => a + b, 0);
        let used = 0,
          cumulative = 0;
        attributes.forEach((attribute, index) => {
          cumulative += weights[index]!;
          const end =
            index === attributes.length - 1
              ? target
              : Math.max(
                  used + 1,
                  Math.min(
                    target - (attributes.length - index - 1),
                    Math.round((cumulative / sum) * target),
                  ),
                );
          editor.setAttribute(attribute, String(end - used));
          used = end;
        });
      }
    }
    return this.commitPart(
      object.sourcePart,
      editor.commit().bytes,
      object.shapeId,
    );
  }
  replaceText(
    slideId: string,
    key: string,
    value: string,
  ): PresentationArtifact {
    const { object, source } = this.target(slideId, key);
    if (!object.textEditable || object.text?.textElementId === undefined)
      throw new PresentationError(
        "unsupported_edit",
        "Only a single ordinary text run can be edited in this version.",
      );
    if (
      value.length > 100_000 ||
      /[\r\n\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)
    )
      throw new RangeError("Enter a single paragraph of ordinary text.");
    if (object.text.paragraphs[0]?.runs[0]?.text === value) return this;
    const element = source.element(object.text.textElementId)!;
    const editor = beginLosslessXmlEdit(source);
    if (element.selfClosing)
      editor.replaceElementMarkup(
        element,
        `<${element.qualified}>${value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</${element.qualified}>`,
      );
    else editor.setText(element, value);
    return this.commitPart(
      object.sourcePart,
      editor.commit().bytes,
      object.shapeId,
    );
  }
}
export function openPresentationArtifact(
  bytes: Uint8Array,
  options: OpenPresentationOptions = {},
): PresentationArtifact {
  return new PresentationArtifact(
    openPresentationDocument(bytes, options),
    options,
  );
}
