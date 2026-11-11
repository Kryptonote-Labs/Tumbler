import { drawingGradientCircle, drawingGradientStops, drawingPatternPicture, paintDrawingPattern, paintDrawingPicture, paintDrawingGradient as gradient, paintRectangularGradient as rectangular } from "@tumblerjs/ooxml";
import {
  linearGradientLine,
  rectangularGradientFaces,
} from './fill-geometry.ts';
import { layoutChartScene, paintChartScene, chartScenePictures } from '@tumblerjs/charts';
import type { DrawingGradient, DrawingPictureFill, DrawingPattern } from './appearance.ts';
import type { PresentationDocument, PresentationSlide } from './model.ts';
import type { SlideCanvasContext, SlideCanvasOptions } from './canvas-types.ts';
import { paintSlideText } from './canvas-text.ts';
export type { SlideCanvasContext, SlideCanvasOptions } from './canvas-types.ts';

/** Embedded images needed by a slide, including its background and shape picture fills. */
export function presentationSlideImages(slide: PresentationSlide): readonly DrawingPictureFill[] {
  return [
    slide.backgroundPicture, ...(slide.backgroundPattern ? [drawingPatternPicture(slide.backgroundPattern)] : []),
    ...slide.objects.flatMap((o) => [o.image, o.pictureFill, ...(o.pattern ? [drawingPatternPicture(o.pattern)] : []), ...(o.chart?.status === 'supported' ? chartScenePictures(layoutChartScene(o.chart, o.transform.width, o.transform.height)) : [])]),
  ].filter((p): p is DrawingPictureFill => p !== undefined);
}
function picture<Path, Image>(
  ctx: SlideCanvasContext<Path, Image>,
  fill: DrawingPictureFill | undefined,
  width: number,
  height: number,
  options: SlideCanvasOptions<Path, Image>,
) {
  if (!fill) return;
  const decoded = options.image?.(fill);
  if (!decoded) return;
  paintDrawingPicture(ctx, fill, width, height, decoded);
}

function pattern<Path, Image>(
  ctx: SlideCanvasContext<Path, Image>,
  fill: DrawingPattern | undefined,
  width: number,
  height: number,
  options: SlideCanvasOptions<Path, Image>,
) {
  if (!fill) return;
  const decoded = options.image?.(drawingPatternPicture(fill));
  if (decoded) paintDrawingPattern(ctx, decoded.image, width, height);
}

/** Paints actual slide content without editor handles or empty-placeholder prompts. Hosts own PNG encoding. */
export function paintPresentationSlide<Path, Image>(
  ctx: SlideCanvasContext<Path, Image>,
  document: PresentationDocument,
  slide: PresentationSlide,
  options: SlideCanvasOptions<Path, Image>,
) {
  ctx.save();
  ctx.scale(options.scale ?? 1, options.scale ?? 1);
  ctx.beginPath();
  ctx.rect(0, 0, document.width, document.height);
  ctx.clip();
  // Slides composite transparent fills onto white, as the SVG viewer does.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, document.width, document.height);
  const background = slide.backgroundGradient;
  if (background?.kind === 'radial' && !drawingGradientCircle(background, document.width, document.height)) {
    ctx.save();
    ctx.scale(document.width, document.height);
    const fill = ctx.createRadialGradient(...background.center, 0, ...background.center, .5);
    for (const stop of drawingGradientStops(background)) fill.addColorStop(stop.offset, stop.color);
    ctx.fillStyle = fill; ctx.fillRect(0, 0, 1, 1); ctx.restore();
  } else if (background?.kind === 'rectangular')
    rectangular(ctx, background, document.width, document.height);
  else {
    ctx.fillStyle = gradient(ctx, background, slide.background, document.width, document.height);
    ctx.fillRect(0, 0, document.width, document.height);
  }
  pattern(ctx, slide.backgroundPattern, document.width, document.height, options);
  picture(ctx, slide.backgroundPicture, document.width, document.height, options);
  for (const object of slide.objects) {
    ctx.save();
    ctx.transform(...object.matrix);
    const { width, height } = object.transform;
    ctx.fillStyle = gradient(ctx, object.gradient, object.fill, width, height);
    ctx.strokeStyle = object.stroke;
    ctx.lineWidth = object.strokeWidth;
    ctx.setLineDash(
      object.strokeDash
        .split(/[ ,]+/)
        .map(Number)
        .filter((n) => Number.isFinite(n) && n > 0),
    );
    for (const path of object.drawingGeometry?.paths ?? []) {
      const geometry = options.path(path.d);
      if (path.fill !== 'none' && (object.gradient || object.pattern || object.fill !== 'none')) {
        if (object.pattern) {
          ctx.save();
          try { ctx.clip(geometry); const decoded = options.image?.(drawingPatternPicture(object.pattern)); if (decoded) paintDrawingPattern(ctx, decoded.image, width, height, { x: object.matrix[4], y: object.matrix[5] }); } finally { ctx.restore(); }
        } else if (object.gradient?.kind === 'rectangular') {
          ctx.save();
          ctx.clip(geometry);
          rectangular(ctx, object.gradient, width, height);
          ctx.restore();
        } else ctx.fill(geometry);
      }
      if (path.stroke && object.stroke !== 'none' && object.strokeWidth > 0) ctx.stroke(geometry);
    }
    picture(ctx, object.image ?? object.pictureFill, width, height, options);
    if (object.table) {
      const table = object.table;
      ctx.save();
      ctx.scale(width / table.width, height / table.height);
      for (const cell of table.cells) {
        ctx.save();
        ctx.translate(cell.x, cell.y);
        ctx.fillStyle = cell.fill;
        if (cell.fill !== 'none') ctx.fillRect(0, 0, cell.width, cell.height);
        if (cell.text) paintSlideText(ctx, cell.text, cell.width, cell.height, options);
        const edges = [
          [0, 0, cell.width, 0],
          [cell.width, 0, cell.width, cell.height],
          [0, cell.height, cell.width, cell.height],
          [0, 0, 0, cell.height],
        ];
        cell.borders.forEach((border, i) => {
          const edge = edges[i];
          if (!edge || !border.width || border.color === 'none') return;
          ctx.beginPath();
          ctx.strokeStyle = border.color;
          ctx.lineWidth = border.width;
          ctx.moveTo(edge[0]!, edge[1]!);
          ctx.lineTo(edge[2]!, edge[3]!);
          ctx.stroke();
        });
        ctx.restore();
      }
      ctx.restore();
    }
    if (object.chart && object.chart.status === 'supported')
      paintChartScene(ctx, layoutChartScene(object.chart, width, height, { patternOrigin: { x: object.matrix[4], y: object.matrix[5] } }), options.path, { image: options.image, picture: (fill, width, height) => picture(ctx, fill, width, height, options) });
    if (object.text) {
      const rect = object.drawingGeometry?.textRect ?? [0, 0, width, height];
      ctx.save();
      ctx.translate(rect[0]!, rect[1]!);
      paintSlideText(ctx, object.text, rect[2]! - rect[0]!, rect[3]! - rect[1]!, options);
      ctx.restore();
    }
    ctx.restore();
  }
  ctx.restore();
}
