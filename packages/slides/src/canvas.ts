import { linearGradientLine, drawingPatternGeometry } from './fill-geometry.ts';
import { layoutChartScene, paintChartScene } from '@tumblerjs/charts';
import type { DrawingGradient, DrawingPictureFill, DrawingPattern } from './appearance.ts';
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
  let result;
  if (value.kind === 'radial') {
    result = ctx.createRadialGradient(
      w * value.center[0],
      h * value.center[1],
      0,
      w * value.center[0],
      h * value.center[1],
      Math.max(w, h),
    );
  } else result = ctx.createLinearGradient(...linearGradientLine(value, w, h));
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
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.clip();
  ctx.globalAlpha *= fill.opacity ?? 1;
  const draw = (w: number, h: number) => {
    const [fl, ft, fr, fb] = fill.stretch ?? [0, 0, 0, 0];
    ctx.drawImage(
      decoded.image,
      decoded.width * l,
      decoded.height * t,
      sw,
      sh,
      fl * w,
      ft * h,
      w * (1 - fl - fr),
      h * (1 - ft - fb),
    );
  };
  const tile = fill.tile;
  if (!tile) draw(width, height);
  else {
    const w = Math.max(1, decoded.width * tile.scaleX),
      h = Math.max(1, decoded.height * tile.scaleY);
    const ox =
      tile.x +
      (tile.align.includes('r')
        ? width - w
        : ['ctr', 't', 'b'].includes(tile.align)
          ? (width - w) / 2
          : 0);
    const oy =
      tile.y +
      (tile.align.includes('b')
        ? height - h
        : ['ctr', 'l', 'r'].includes(tile.align)
          ? (height - h) / 2
          : 0);
    for (let row = Math.floor(-oy / h); row < Math.ceil((height - oy) / h); row++)
      for (let col = Math.floor(-ox / w); col < Math.ceil((width - ox) / w); col++) {
        const flipX = (tile.flip === 'x' || tile.flip === 'xy') && Math.abs(col % 2) === 1;
        const flipY = (tile.flip === 'y' || tile.flip === 'xy') && Math.abs(row % 2) === 1;
        ctx.save();
        ctx.translate(ox + col * w + (flipX ? w : 0), oy + row * h + (flipY ? h : 0));
        ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
        ctx.drawImage(decoded.image, decoded.width * l, decoded.height * t, sw, sh, 0, 0, w, h);
        ctx.restore();
      }
  }
  ctx.restore();
}

function pattern<Path, Image>(
  ctx: SlideCanvasContext<Path, Image>,
  fill: DrawingPattern | undefined,
  width: number,
  height: number,
  options: SlideCanvasOptions<Path, Image>,
) {
  if (!fill) return;
  const geometry = drawingPatternGeometry(fill.preset);
  ctx.save();
  ctx.fillStyle = fill.background;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = fill.foreground;
  ctx.strokeStyle = fill.foreground;
  ctx.lineWidth = geometry.strokeWidth;
  const path = geometry.path ? options.path(geometry.path) : undefined;
  for (let y = 0; y < height; y += geometry.size)
    for (let x = 0; x < width; x += geometry.size) {
      ctx.save();
      ctx.translate(x, y);
      ctx.beginPath();
      ctx.rect(0, 0, Math.min(geometry.size, width - x), Math.min(geometry.size, height - y));
      ctx.clip();
      for (const rect of geometry.rects) ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      if (path) {
        if (geometry.filled) ctx.fill(path);
        else ctx.stroke(path);
      }
      ctx.restore();
    }
  ctx.restore();
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
  if (background?.kind === 'radial') {
    // Keep the normalized coordinate transform active while painting the elliptical gradient.
    ctx.save();
    ctx.scale(document.width, document.height);
    const fill = ctx.createRadialGradient(...background.center, 0, ...background.center, 0.5);
    for (const stop of background.stops) fill.addColorStop(stop.offset, stop.color);
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, 1, 1);
    ctx.restore();
  } else {
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
