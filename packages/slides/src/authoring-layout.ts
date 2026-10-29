import type { PresentationArtifact } from "./artifact.ts";
import { insertObject } from "./authoring-objects.ts";
import { slideById } from "./authoring-slides.ts";

export type PresentationLayout = "blank" | "title" | "title-content" | "two-content";
/** Place editable text frames without deleting other authored content or changing a shared master. */
export function applyPresentationLayout(
  artifact: PresentationArtifact,
  slideId: string,
  layout: PresentationLayout,
) {
  if (layout === "blank") return artifact;
  const { width, height } = artifact.document;
  const boxes =
    layout === "title"
      ? [
          {
            x: width * 0.1,
            y: height * 0.32,
            width: width * 0.8,
            height: height * 0.2,
            fontSize: 44,
          },
          {
            x: width * 0.1,
            y: height * 0.55,
            width: width * 0.8,
            height: height * 0.15,
            fontSize: 24,
          },
        ]
      : [
          {
            x: width * 0.06,
            y: height * 0.06,
            width: width * 0.88,
            height: height * 0.15,
            fontSize: 36,
          },
          {
            x: width * 0.06,
            y: height * 0.26,
            width: width * (layout === "two-content" ? 0.42 : 0.88),
            height: height * 0.64,
            fontSize: 24,
          },
          ...(layout === "two-content"
            ? [
                {
                  x: width * 0.52,
                  y: height * 0.26,
                  width: width * 0.42,
                  height: height * 0.64,
                  fontSize: 24,
                },
              ]
            : []),
        ];
  const existing = slideById(artifact, slideId).objects.filter(
    (o) => o.layer === "slide" && o.textEditable && o.kind === "shape",
  );
  let result = artifact;
  for (const [index, { fontSize, ...bounds }] of boxes.entries()) {
    const object = existing[index];
    if (object) result = result.updateObject({ slideId, objectKey: object.key, ...bounds });
    else result = insertObject(result, slideId, bounds, { kind: "shape", text: "", fontSize });
  }
  return result;
}
