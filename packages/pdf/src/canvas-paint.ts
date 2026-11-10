import { rectangleCoverage } from "./rectangle-coverage.ts";
import { identity, multiply, type PdfMatrix } from "./matrix.ts";
import { invalid } from "./objects.ts";
import type { PdfSource } from "./source.ts";
import type {
  PdfImageData,
  PdfPageScene,
  PdfPaint,
  PdfPathCommand,
  PdfSceneElement,
} from "./scene.ts";
import { rasterPdfShading } from "./shading-raster.ts";

export interface PdfGradient {
  addColorStop(offset: number, color: string): void;
}
/** The Canvas subset needed by the PDF painter; browser and native canvases share this boundary. */
export interface PdfCanvasContext<Image, Path> {
  fillStyle: string | object;
  strokeStyle: string | object;
  globalAlpha: number;
  globalCompositeOperation: GlobalCompositeOperation;
  lineWidth: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  miterLimit: number;
  lineDashOffset: number;
  imageSmoothingEnabled: boolean;
  font: string;
  textBaseline: CanvasTextBaseline;
  save(): void;
  restore(): void;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  transform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  scale(x: number, y: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  bezierCurveTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number): void;
  closePath(): void;
  fill(rule?: CanvasFillRule): void;
  fill(path: Path, rule?: CanvasFillRule): void;
  stroke(): void;
  stroke(path: Path): void;
  clip(rule?: CanvasFillRule): void;
  clip(path: Path, rule?: CanvasFillRule): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  setLineDash(segments: number[]): void;
  fillText(text: string, x: number, y: number): void;
  strokeText(text: string, x: number, y: number): void;
  drawImage(image: Image, x: number, y: number, width: number, height: number): void;
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): PdfGradient;
  createRadialGradient(
    x0: number,
    y0: number,
    r0: number,
    x1: number,
    y1: number,
    r1: number,
  ): PdfGradient;
}
export interface PdfPaintHost<Image, Path> {
  path(svg: string): Path;
  image(data: PdfImageData): Promise<Image>;
  surface(width: number, height: number): { image: Image; context: PdfCanvasContext<Image, Path> };
  release?(image: Image): void;
}
export interface PdfPaintOptions {
  readonly scale?: number;
  /** Device-pixel rectangle to render without allocating the rest of the page. */
  readonly region?: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly background?: string;
  readonly signal?: AbortSignal;
  readonly text?: boolean;
}

function path<Image, Path>(
  context: PdfCanvasContext<Image, Path>,
  commands: readonly PdfPathCommand[],
  viewport: PdfMatrix,
  fallback: PdfMatrix,
) {
  context.beginPath();
  for (const command of commands) {
    context.setTransform(...multiply(viewport, command.transform ?? fallback));
    switch (command.kind) {
      case "move":
        context.moveTo(command.x, command.y);
        break;
      case "line":
        context.lineTo(command.x, command.y);
        break;
      case "curve":
        context.bezierCurveTo(command.x1, command.y1, command.x2, command.y2, command.x, command.y);
        break;
      case "close":
        context.closePath();
        break;
    }
  }
}

function geometry<Image, Path>(
  context: PdfCanvasContext<Image, Path>,
  element: PdfSceneElement,
  viewport: PdfMatrix,
  host: PdfPaintHost<Image, Path>,
  stroke: boolean,
  scale: number,
) {
  const state = element.state;
  context.setTransform(...multiply(viewport, state.transform));
  context.lineWidth =
    state.lineWidth === 0
      ? 1 / scale / Math.max(0.000001, Math.hypot(state.transform[0], state.transform[1]))
      : state.lineWidth;
  context.lineCap = state.lineCap;
  context.lineJoin = state.lineJoin;
  context.miterLimit = state.miterLimit;
  context.setLineDash([...state.dash]);
  context.lineDashOffset = state.dashPhase;
  if (element.kind === "path") {
    const coverage = !stroke ? rectangleCoverage(element, viewport) : undefined;
    if (coverage) {
      context.setTransform(...identity);
      context.fillRect(...coverage);
      return;
    }
    path(context, element.path, viewport, state.transform);
    context.setTransform(...multiply(viewport, state.transform));
    if (stroke) context.stroke();
    else context.fill(element.fillRule);
  } else if (element.kind === "glyph") {
    context.lineWidth =
      state.lineWidth / (Math.abs(element.fontSize / element.font.unitsPerEm) || 1);
    if (element.glyph.path !== undefined) {
      const outline = host.path(element.glyph.path);
      if (stroke) context.stroke(outline);
      else context.fill(outline);
    } else {
      context.scale(1, -1);
      context.font = `${element.font.css.style} ${element.font.css.weight} ${element.font.unitsPerEm}px ${element.font.css.family}`;
      context.textBaseline = "alphabetic";
      if (stroke) context.strokeText(element.glyph.renderText, 0, 0);
      else context.fillText(element.glyph.renderText, 0, 0);
    }
  }
}

/** Paint a compiled page with the same scene geometry on browser and native canvases. */
export async function paintPdfPage<Image, Path>(
  context: PdfCanvasContext<Image, Path>,
  scene: PdfPageScene,
  source: PdfSource,
  host: PdfPaintHost<Image, Path>,
  options: PdfPaintOptions = {},
) {
  const scale = options.scale ?? 4 / 3;
  if (!Number.isFinite(scale) || scale <= 0) return invalid("PDF render scale must be positive.");
  const region = options.region;
  if (region && (![region.x, region.y, region.width, region.height].every(Number.isSafeInteger) || region.width <= 0 || region.height <= 0))
    return invalid("PDF render region must have integer coordinates and positive dimensions.");
  const viewport = multiply([scale, 0, 0, scale, -(region?.x ?? 0), -(region?.y ?? 0)], scene.viewport),
    width = region?.width ?? Math.ceil(scene.width * scale),
    height = region?.height ?? Math.ceil(scene.height * scale);
  const shadings = new Map<PdfPaint, Promise<Image>>();
  const shadingImage = (paint: Exclude<PdfPaint, string>) => {
    let image = shadings.get(paint);
    if (!image) {
      image = host.image(
        rasterPdfShading(
          source,
          paint.shading,
          paint.resources,
          multiply(viewport, paint.transform),
          width,
          height,
        ),
      );
      shadings.set(paint, image);
    }
    return image;
  };
  context.save();
  try {
    context.setTransform(...identity);
    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";
    if (options.background !== "transparent") {
      context.fillStyle = options.background ?? "#fff";
      context.fillRect(0, 0, width, height);
    }
    for (const element of scene.elements) {
      options.signal?.throwIfAborted();
      if (options.text === false && element.source.instance.includes(":glyph:")) continue;
      if (
        element.kind === "glyph" &&
        (options.text === false ||
          element.glyph.procedure ||
          element.mode === 3 ||
          element.mode === 7)
      )
        continue;
      // Fill-only outlines cannot affect a tile outside their transformed ink bounds.
      // Keep fallback fonts, stroked text and non-normal blends on the conservative path.
      if (region && element.kind === "glyph" && (element.mode === 0 || element.mode === 4) &&
          element.state.blend === "source-over" && element.glyph.bounds) {
        const [left, bottom, right, top] = element.glyph.bounds;
        const [a,b,c,d,e,f] = multiply(viewport, element.state.transform);
        const xs = [a*left+c*bottom+e,a*right+c*bottom+e,a*left+c*top+e,a*right+c*top+e];
        const ys = [b*left+d*bottom+f,b*right+d*bottom+f,b*left+d*top+f,b*right+d*top+f];
        if (Math.max(...xs) < -2 || Math.min(...xs) > width+2 ||
            Math.max(...ys) < -2 || Math.min(...ys) > height+2) continue;
      }
      context.save();
      try {
        for (const clip of element.state.clips) {
          path(context, clip.path, viewport, clip.transform);
          context.clip(clip.rule);
        }
        const state = element.state;
        context.globalCompositeOperation = state.blend;
        const draw = async (paint: PdfPaint, alpha: number, stroke: boolean) => {
          context.globalAlpha = alpha;
          if (typeof paint === "string") {
            context.fillStyle = paint;
            context.strokeStyle = paint;
            geometry(context, element, viewport, host, stroke, scale);
            return;
          }
          const surface = host.surface(width, height),
            mask = surface.context;
          mask.fillStyle = "#fff";
          mask.strokeStyle = "#fff";
          geometry(mask, element, viewport, host, stroke, scale);
          mask.setTransform(...identity);
          mask.globalCompositeOperation = "source-in";
          mask.drawImage(await shadingImage(paint), 0, 0, width, height);
          context.setTransform(...identity);
          context.drawImage(surface.image, 0, 0, width, height);
        };
        if (element.kind === "path") {
          if (element.fill) await draw(state.fill, state.fillAlpha, false);
          if (element.stroke) await draw(state.stroke, state.strokeAlpha, true);
        } else if (element.kind === "glyph") {
          if ([0, 2, 4, 6].includes(element.mode)) await draw(state.fill, state.fillAlpha, false);
          if ([1, 2, 5, 6].includes(element.mode))
            await draw(state.stroke, state.strokeAlpha, true);
        } else if (element.kind === "image") {
          let image: Image = await host.image(element.image);
          options.signal?.throwIfAborted();
          if (element.image.stencil) {
            const surface = host.surface(element.image.width, element.image.height),
              mask = surface.context;
            mask.drawImage(image, 0, 0, element.image.width, element.image.height);
            mask.globalCompositeOperation = "source-in";
            if (typeof state.fill !== "string")
              return invalid(
                "A stencil using a shading pattern needs device-space mask composition.",
              );
            mask.fillStyle = state.fill;
            mask.fillRect(0, 0, element.image.width, element.image.height);
            image = surface.image;
          }
          let imageTransform = multiply(viewport, state.transform);
          // Image scan conversion covers the enclosing device pixels; source geometry stays intact.
          if (Math.abs(imageTransform[1]) < 1e-7 && Math.abs(imageTransform[2]) < 1e-7) {
            const [a, , , d, e, f] = imageTransform;
            const left = Math.floor(Math.min(e, e + a)),
              right = Math.ceil(Math.max(e, e + a));
            const top = Math.floor(Math.min(f, f + d)),
              bottom = Math.ceil(Math.max(f, f + d));
            imageTransform = [
              Math.sign(a) * (right - left),
              0,
              0,
              Math.sign(d) * (bottom - top),
              a < 0 ? right : left,
              d < 0 ? bottom : top,
            ];
          }
          context.setTransform(...imageTransform);
          context.globalAlpha = state.fillAlpha;
          context.imageSmoothingEnabled =
            element.image.interpolate ||
            element.image.width > Math.hypot(imageTransform[0], imageTransform[1]) ||
            element.image.height > Math.hypot(imageTransform[2], imageTransform[3]);
          context.transform(1 / element.image.width, 0, 0, -1 / element.image.height, 0, 1);
          context.drawImage(image, 0, 0, element.image.width, element.image.height);
        } else {
          const paint = {
            kind: "shading-pattern" as const,
            shading: element.shading,
            resources: element.resources,
            transform: state.transform,
          };
          context.setTransform(...identity);
          context.globalAlpha = state.fillAlpha;
          context.drawImage(await shadingImage(paint), 0, 0, width, height);
        }
      } finally {
        context.restore();
      }
    }
  } finally {
    context.restore();
    for (const image of shadings.values())
      void image.then((value) => host.release?.(value)).catch(() => {});
  }
}
