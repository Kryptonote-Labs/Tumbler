import type { PresentationArtifact } from "./artifact.ts";
import { slideTextValue } from "./editing.ts";
/** Compact agent reads retain stable slide/object addresses and actual authoring geometry. */
export function inspectPresentation(artifact: PresentationArtifact, slideId?: string) {
  const doc = artifact.document,
    slide = slideId !== undefined ? doc.slides.find((s) => s.id === slideId) : doc.slides[0];
  if (!slide) throw new Error("Slide not found.");
  return {
    width: doc.width,
    height: doc.height,
    slides: doc.slides.map((s, index) => ({
      id: s.id,
      number: index + 1,
      title: s.title,
      hidden: s.hidden,
      empty: s.objects.length === 0,
      objectCount: s.objects.length,
    })),
    slide: {
      id: slide.id,
      number: doc.slides.indexOf(slide) + 1,
      empty: slide.objects.length === 0,
      objectCount: slide.objects.length,
      title: slide.title,
      notes: slide.notes,
      background: slide.background,
      diagnostics: slide.diagnostics,
      objects: slide.objects.map((o) => ({
        key: o.key,
        name: o.name,
        kind: o.kind,
        geometry: o.geometry,
        transform: o.transform,
        fill: o.fill,
        stroke: o.stroke,
        text: slideTextValue(o),
        paragraphs: o.text?.paragraphs,
        editable: o.textEditable,
        movable: o.movable,
        restriction: o.restriction,
        table: o.table && {
          cells: o.table.cells.map((c) => ({
            row: c.row,
            column: c.column,
            rowSpan: c.rowSpan,
            columnSpan: c.columnSpan,
            text: c.text?.paragraphs.map((p) => p.runs.map((r) => r.text).join("")).join("\n"),
          })),
        },
      })),
    },
  };
}
