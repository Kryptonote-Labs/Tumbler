import type { DrawingPictureFill } from '@tumblerjs/ooxml';
import { mergeChartFillLayers } from './fill-style.ts';
import { chartGradientPaint } from './gradient-scene.ts';
import type { ChartGradientPaint } from './gradient-scene.ts';
import type { ChartRect } from './layout.ts';
import type { ChartSeries, ChartShapeStyle } from './model.ts';
import type { SceneContext } from './scene-marks.ts';
import type { ChartMark, ChartScene } from './scene-marks.ts';
import type { ChartImage, ChartPictureFill } from './picture-parser.ts';

export interface ChartPicturePaint { readonly bounds: ChartRect; readonly picture: DrawingPictureFill }
export interface ChartFillPaint { readonly fillPicture?: ChartPicturePaint; readonly fillGradient?: ChartGradientPaint }
const resolvedPictures = new WeakMap<ChartPictureFill, WeakMap<ChartImage, DrawingPictureFill>>();

function resolvePicture(reference: ChartPictureFill, image: ChartImage): DrawingPictureFill {
  let bindings = resolvedPictures.get(reference);
  if (!bindings) { bindings = new WeakMap(); resolvedPictures.set(reference, bindings); }
  let picture = bindings.get(image);
  if (!picture) {
    const { relationshipId, ...properties } = reference;
    picture = { ...image, ...properties }; bindings.set(image, picture);
  }
  return picture;
}

/** A fill choice replaces inherited fill as a unit, including image data and its source geometry. */
export function chartFillPaint(context: SceneContext, style: ChartShapeStyle | undefined, bounds: ChartRect): ChartFillPaint {
  if (style?.noFill) return {};
  const reference = style?.picture, image = reference && context.model.images?.[reference.relationshipId];
  if (reference && image) {
    return { fillPicture: { bounds, picture: resolvePicture(reference, image) } };
  }
  return chartGradientPaint(context, style?.gradient, bounds);
}
export function chartPointFill(context: SceneContext, series: ChartSeries, index: number, bounds: ChartRect) {
  return chartFillPaint(context, mergeChartFillLayers<ChartShapeStyle>([series, context.pointFormat(series, index)]), bounds);
}
export function chartLegendFill(context: SceneContext, series: ChartSeries, bounds: ChartRect) {
  return chartFillPaint(context, series, bounds);
}

/** Image identities stay stable between enumeration and painting so hosts can decode once. */
export function chartScenePictures(scene: ChartScene): readonly DrawingPictureFill[] {
  const pictures = new Set<DrawingPictureFill>();
  function visit(marks: readonly ChartMark[]) {
    for (const mark of marks) {
      if (mark.fillPicture) pictures.add(mark.fillPicture.picture);
      if (mark.kind === 'group') visit(mark.marks);
    }
  }
  visit(scene.marks); return [...pictures];
}
