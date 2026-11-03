import type { PdfPage } from "./document.ts";
import type { PdfSource } from "./source.ts";
import {
  array,
  dictionary,
  integer,
  invalid,
  name,
  number,
  PdfStream,
  PdfString,
  type PdfDictionary,
} from "./objects.ts";
import { matrix } from "./matrix.ts";
import { initialState, execution, type Execution } from "./graphics-state.ts";
import type { PdfSceneElement } from "./scene.ts";
export function pdfTextString(value: PdfString) {
  if (value.bytes[0] === 254 && value.bytes[1] === 255)
    return new TextDecoder("utf-16be").decode(value.bytes.subarray(2));
  if (value.bytes[0] === 239 && value.bytes[1] === 187 && value.bytes[2] === 191)
    return new TextDecoder().decode(value.bytes.subarray(3));
  return new TextDecoder("windows-1252").decode(value.bytes);
}

export function interpretAnnotations(
  source: PdfSource,
  page: PdfPage,
  elements: PdfSceneElement[],
  form: (
    stream: PdfStream,
    resources: PdfDictionary,
    context: Execution,
    elements: PdfSceneElement[],
    instance: string,
  ) => void,
) {
  const annotations: {
    subtype: string;
    contents: string;
    rect: readonly [number, number, number, number] | undefined;
  }[] = [];
  const rawAnnotations = source.resolve(page.dictionary.get("Annots"));
  if (Array.isArray(rawAnnotations))
    for (const [index, raw] of rawAnnotations.entries()) {
      const annotation = dictionary(source.resolve(raw)),
        flags = integer(annotation.get("F"), 0);
      const subtype = name(annotation.get("Subtype"));
      const contents = source.resolve(annotation.get("Contents"));
      const rectValue = source.resolve(annotation.get("Rect"));
      const rect =
        Array.isArray(rectValue) && rectValue.length === 4
          ? rectValue.map((item) => number(item))
          : undefined;
      const typedRect = rect ? ([rect[0]!, rect[1]!, rect[2]!, rect[3]!] as const) : undefined;
      annotations.push({
        subtype,
        contents: contents instanceof PdfString ? pdfTextString(contents) : "",
        rect: typedRect,
      });
      if (flags & 1 || flags & 2 || flags & 32) continue;
      const appearance = source.resolve(annotation.get("AP"));
      if (!(appearance instanceof Map) || !typedRect) continue;
      let normal = source.resolve(appearance.get("N"));
      if (normal instanceof Map) normal = source.resolve(normal.get(name(annotation.get("AS"))));
      if (!(normal instanceof PdfStream)) continue;
      const bbox = array(source.resolve(normal.dictionary.get("BBox"))).map((value) =>
        number(value),
      );
      if (bbox.length !== 4 || bbox[2] === bbox[0] || bbox[3] === bbox[1])
        return invalid("Invalid annotation appearance box.");
      const appearanceMatrix = matrix(source.resolve(normal.dictionary.get("Matrix")));
      const corners = [
        [bbox[0]!, bbox[1]!],
        [bbox[2]!, bbox[1]!],
        [bbox[0]!, bbox[3]!],
        [bbox[2]!, bbox[3]!],
      ].map(([x, y]) => [
        appearanceMatrix[0] * x! + appearanceMatrix[2] * y! + appearanceMatrix[4],
        appearanceMatrix[1] * x! + appearanceMatrix[3] * y! + appearanceMatrix[5],
      ]);
      const minX = Math.min(...corners.map((point) => point[0]!)),
        minY = Math.min(...corners.map((point) => point[1]!));
      const sx =
          (typedRect[2] - typedRect[0]) / (Math.max(...corners.map((point) => point[0]!)) - minX),
        sy =
          (typedRect[3] - typedRect[1]) / (Math.max(...corners.map((point) => point[1]!)) - minY);
      const state = initialState();
      state.transform = [sx, 0, 0, sy, typedRect[0] - minX * sx, typedRect[1] - minY * sy];
      form(normal, page.resources, execution(state), elements, `annotation:${page.id}:${index}`);
    }

  return annotations;
}
