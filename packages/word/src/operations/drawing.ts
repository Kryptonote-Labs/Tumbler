import type * as Y from "yjs";
import type { TextAttributes } from "../collaboration/formatting.ts";
import type { WordDrawingChange, WordLayoutFragment } from "../index.ts";
import { isDocumentImage, normalizeImage } from "../collaboration/images.ts";
import { createWordCommands, type WordChange } from "../collaboration/commands.ts";
const { anchorWordRange } = createWordCommands();

/** Apply the same placement and movement operations to pictures and charts, retaining their content. */
export function wordDrawingChanges(
  text: Y.Text,
  start: number,
  fragment: WordLayoutFragment,
  value: WordDrawingChange,
  destination?: number,
): WordChange[] {
  if (!fragment.drawing || !["image", "chart"].includes(fragment.drawing.kind)) return [];
  let offset = 0;
  const parts: { insert?: unknown; attributes?: TextAttributes }[] = text.toDelta();
  const part = parts.find((part) => {
    const end = offset + (typeof part.insert === "string" ? part.insert.length : 0);
    const contains = start >= offset && start < end;
    offset = end;
    return contains;
  });
  if (!part?.attributes || text.toString()[start] !== "\uFFFC") return [];
  const image = isDocumentImage(part.attributes.image) ? part.attributes.image : undefined;
  if (!image && !part.attributes.wordSource && !part.attributes.ink) return [];
  const target = anchorWordRange(text, { start, end: start + 1 });
  if (destination !== undefined) {
    if (destination >= start && destination <= start + 1) return [];
    if (image)
      return [
        {
          kind: "image-move",
          target,
          destination: anchorWordRange(text, { start: destination, end: destination }),
          previous: image,
        },
      ];
    return [
      { kind: "replace", target, value: "", expected: "\uFFFC" },
      {
        kind: "replace",
        target: anchorWordRange(text, { start: destination, end: destination }),
        value: "\uFFFC",
        attributes: part.attributes,
      },
    ];
  }
  if (value.inlinePosition) return [];
  const position = value.layout
    ? {
        layout: value.layout,
        ...(value.wrap ? { wrap: value.wrap } : {}),
        ...(value.layout !== "inline"
          ? {
              x: value.xPoints ?? fragment.x,
              y: value.yPoints ?? fragment.y,
              horizontalRelativeTo: value.horizontalRelativeTo ?? "page",
              verticalRelativeTo: value.verticalRelativeTo ?? "page",
            }
          : {}),
      }
    : {};
  if (image)
    return [
      {
        kind: "image-update",
        target,
        previous: image,
        image: normalizeImage({
          ...image,
          width: value.widthPoints,
          height: value.heightPoints,
          ...position,
          ...(value.layout && value.layout !== "inline"
            ? {
                moveWithText:
                  value.verticalRelativeTo !== undefined && value.verticalRelativeTo !== "page",
              }
            : {}),
        }),
      },
    ];
  return [
    {
      kind: "format",
      target,
      expected: "\uFFFC",
      attributes: {
        drawing: {
          ...part.attributes.drawing,
          width: value.widthPoints,
          height: value.heightPoints,
          ...position,
        },
      },
    },
  ];
}
