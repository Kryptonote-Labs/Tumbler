import { chartStrokeBrush } from './stroke-brush.ts';
import { drawingPatternPicture } from '@tumblerjs/ooxml';
import { resolveChartColor } from './colors.ts';
import type { DrawingPattern, DrawingPictureFill } from '@tumblerjs/ooxml';
import { mergeChartFillLayers } from './fill-style.ts';
import { chartGradientPaint, chartGradientBrush } from './gradient-scene.ts';
import type { ChartGradientPaint } from './gradient-scene.ts';
import type { ChartRect } from './layout.ts';
import type { ChartSeries, ChartShapeStyle } from './model.ts';
import type { SceneContext } from './scene-marks.ts';
import type { ChartMark, ChartScene } from './scene-marks.ts';
import type { ChartImage, ChartPictureFill } from './picture-parser.ts';

export interface ChartPicturePaint { readonly bounds: ChartRect; readonly picture: DrawingPictureFill }
export interface ChartPatternPaint { readonly bounds: ChartRect; readonly pattern: DrawingPattern; readonly light?: number; readonly picture: DrawingPictureFill; readonly origin: { readonly x: number; readonly y: number } }
export interface ChartFillPaint { readonly fillPattern?: ChartPatternPaint; readonly fillPicture?: ChartPicturePaint; readonly fillGradient?: ChartGradientPaint }
const resolvedPatterns = new WeakMap<NonNullable<ChartShapeStyle['pattern']>, Map<string, DrawingPattern>>();
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
  if (style?.pattern) {
    const color = (value: import('./model.ts').ChartColor | undefined, fallback: string) => value ? context.options.resolveColor?.(value) ?? resolveChartColor(value, context.model) ?? fallback : fallback;
    const reference = style.pattern, foreground = color(reference.foreground, '#000000'), background = color(reference.background, '#ffffff');
    let bindings = resolvedPatterns.get(reference);
    if (!bindings) { bindings = new Map(); resolvedPatterns.set(reference, bindings); }
    const key = `${foreground}|${background}`;
    let pattern = bindings.get(key);
    if (!pattern) { pattern = Object.freeze({ preset: reference.preset, foreground, background }); bindings.set(key, pattern); }
    return { fillPattern: { bounds, origin: context.options.patternOrigin ?? { x: 0, y: 0 }, pattern, picture: drawingPatternPicture(pattern) } };
  }
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
      const stroke = chartStrokeBrush(mark);
      const fill = mark.fillGradient && chartGradientBrush(mark.fillGradient);
      if (fill) pictures.add(fill.picture);
      if (stroke) pictures.add(stroke.picture);
      if (mark.fillPattern) pictures.add(mark.fillPattern.picture);
      if (mark.fillPicture) pictures.add(mark.fillPicture.picture);
      if (mark.kind === 'group') visit(mark.marks);
    }
  }
  visit(scene.marks); return [...pictures];
}
