import * as Y from 'yjs';
import type { PdfTextModel } from './model.ts';
import type { PdfTextStyle } from './fonts.ts';

const sameFace = (a: PdfTextStyle, b: PdfTextStyle) =>
  a.font === b.font && a.family === b.family && a.bold === b.bold && a.italic === b.italic;
/** Source adjustments belong to surviving adjacent CRDT characters, never to a global letter pair. */
export function pdfSourceSpacing(
  model: PdfTextModel,
  id: string,
  offsets: number[],
  styles: PdfTextStyle[],
) {
  const seed = model.seed(id),
    text = model.text(id),
    result = offsets.map(() => 0),
    indices = new Map(offsets.map((offset, index) => [offset, index]));
  for (const gap of seed.spacing ?? []) {
    if (!gap.anchors) continue;
    const resolve = (anchor: (typeof gap.anchors)[0]) => {
      const relative = Y.createRelativePositionFromJSON(anchor);
      const absolute = Y.createAbsolutePositionFromRelativePosition(relative, model.doc);
      if (
        !absolute ||
        absolute.type !== text ||
        !Y.compareRelativePositions(
          relative,
          Y.createRelativePositionFromTypeIndex(text, absolute.index),
        )
      )
        return;
      return absolute.index;
    };
    const left = resolve(gap.anchors[0]),
      right = resolve(gap.anchors[1]);
    if (left === undefined || right === undefined) continue;
    const index = indices.get(right),
      before = seed.delta[gap.left],
      after = seed.delta[gap.right];
    if (
      index === undefined ||
      index === 0 ||
      offsets[index - 1] !== left ||
      !before ||
      !after ||
      right - left !== before.insert.length
    )
      continue;
    const a = styles[index - 1]!,
      b = styles[index]!;
    const ratio = a.size / before.attributes.size;
    if (
      sameFace(a, before.attributes) &&
      sameFace(b, after.attributes) &&
      Math.abs(ratio - b.size / after.attributes.size) < 1e-9
    )
      result[index] = gap.gap * ratio;
  }
  return result;
}
