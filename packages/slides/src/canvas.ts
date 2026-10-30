import { layoutChartScene, paintChartScene } from '@tumblerjs/charts';
import type { DrawingGradient, DrawingPictureFill } from './appearance.ts';
import type { PresentationDocument, PresentationSlide } from './model.ts';
import type { SlideCanvasContext, SlideCanvasOptions } from './canvas-types.ts';
import { paintSlideText } from './canvas-text.ts';
export type { SlideCanvasContext, SlideCanvasOptions } from './canvas-types.ts';

/** Embedded images needed by a slide, including its background and shape picture fills. */
export function presentationSlideImages(slide: PresentationSlide): readonly DrawingPictureFill[] {
  return [
    slide.backgroundPicture,
    ...slide.objects.flatMap((o) => [o.image, o.pictureFill]),
  ].filter((p): p is DrawingPictureFill => p !== undefined);
}
function gradient<Path, Image>(
  ctx: SlideCanvasContext<Path, Image>,
  value: DrawingGradient | undefined,
  fallback: string,
  w: number,
  h: number,
) {
  if (!value) return fallback;
  const radians = (value.angle * Math.PI) / 180;
  const dx = (Math.cos(radians) * w) / 2,
    dy = (Math.sin(radians) * h) / 2;
  const result =
    value.kind === 'radial'
      ? ctx.createRadialGradient(
          w * value.center[0],
          h * value.center[1],
          0,
          w * value.center[0],
          h * value.center[1],
          Math.max(w, h),
        )
      : ctx.createLinearGradient(w / 2 - dx, h / 2 - dy, w / 2 + dx, h / 2 + dy);
  for (const stop of value.stops)
    result.addColorStop(Math.max(0, Math.min(1, stop.offset)), stop.color);
  return result;
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
  const [l, t, r, b] = fill.crop;
  const sw = decoded.width * (1 - l - r),
    sh = decoded.height * (1 - t - b);
  if (sw <= 0 || sh <= 0) return;
  ctx.drawImage(decoded.image, decoded.width * l, decoded.height * t, sw, sh, 0, 0, width, height);
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
  ctx.fillStyle = gradient(
    ctx,
    slide.backgroundGradient,
    slide.background,
    document.width,
    document.height,
  );
  ctx.fillRect(0, 0, document.width, document.height);
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
      if (path.fill !== 'none' && object.fill !== 'none') ctx.fill(geometry);
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
      paintChartScene(ctx, layoutChartScene(object.chart, width, height), options.path);
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
