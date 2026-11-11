import { paintChartGradient } from './gradient-canvas.ts';
import type { ChartGradientPaint } from './gradient-scene.ts';
import type { DrawingGradientCanvasContext } from '@tumblerjs/ooxml';
import type { DrawingPictureFill } from '@tumblerjs/ooxml';
import type { ChartPicturePaint } from './fill-scene.ts';
import type { ChartMark, ChartScene } from "./scene-marks.ts";
import { chartFontShorthand } from "./scene-style.ts";

/**
 * The Canvas 2D subset that chart painting uses. Browser, OffscreenCanvas and server canvases
 * satisfy it; `Path` is the host's Path2D.
 */
export interface ChartCanvasContext<Path> {
  scale?: DrawingGradientCanvasContext['scale'];
  createLinearGradient?: DrawingGradientCanvasContext['createLinearGradient'];
  createRadialGradient?: DrawingGradientCanvasContext['createRadialGradient'];
  font: string;
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
  lineCap?: 'butt' | 'round' | 'square';
  lineJoin?: 'round' | 'bevel' | 'miter';
  miterLimit?: number;
  setLineDash?(values: number[]): void;
  globalAlpha: number;
  textAlign: "start" | "end" | "left" | "right" | "center";
  textBaseline: "top" | "hanging" | "middle" | "alphabetic" | "ideographic" | "bottom";
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(angle: number): void;
  beginPath(): void;
  rect(x: number, y: number, width: number, height: number): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  clip(path?: Path): void;
  fill(path?: Path): void;
  stroke(path?: Path): void;
  fillText(text: string, x: number, y: number): void;
}

/** Paints a chart scene at the context's current transform, one unit per scene pixel. */
export interface ChartCanvasOptions {
  /** Paint a predecoded picture at the current origin. The engine applies its bounds and shape clip. */
  readonly picture?: (picture: DrawingPictureFill, width: number, height: number) => void;
}
export function paintChartScene<Path>(context: ChartCanvasContext<Path>, scene: ChartScene, path: (d: string) => Path, options: ChartCanvasOptions = {}): void {
  context.save();
  try {
    context.beginPath();
    context.rect(0, 0, scene.width, scene.height);
    context.clip();
    context.textBaseline = "alphabetic";
    paintMarks(context, scene.marks, path, options);
  } finally { context.restore(); }
}

const ALIGN = { start: "left", middle: "center", end: "right" } as const;

function paintMarks<Path>(context: ChartCanvasContext<Path>, marks: readonly ChartMark[], path: (d: string) => Path, options: ChartCanvasOptions): void {
  for (const mark of marks) {
    if (mark.kind !== 'text' && mark.kind !== 'group') {
      context.setLineDash?.(Array.from(mark.strokeDash ?? []));
      context.lineCap = mark.strokeCap ?? 'butt';
      context.lineJoin = mark.strokeJoin ?? 'miter';
      context.miterLimit = mark.miterLimit ?? 10;
    }
    switch (mark.kind) {
      case "rect":
        context.beginPath();
        context.rect(mark.x, mark.y, mark.width, mark.height);
        fillAndStroke(context, mark.fill, mark.stroke, mark.strokeWidth ?? 1, mark.fillGradient, () => { context.beginPath(); context.rect(mark.x, mark.y, mark.width, mark.height); }, mark.fillPicture, options);
        break;
      case "circle":
        context.beginPath();
        context.arc(mark.cx, mark.cy, mark.r, 0, Math.PI * 2);
        context.globalAlpha = mark.fillOpacity ?? 1;
        fillAndStroke(context, mark.fill, undefined, 1, mark.fillGradient, undefined, mark.fillPicture, options);
        context.globalAlpha = 1;
        context.beginPath();
        context.arc(mark.cx, mark.cy, mark.r, 0, Math.PI * 2);
        fillAndStroke(context, undefined, mark.stroke, mark.strokeWidth ?? 1);
        break;
      case "path": {
        const shape = path(mark.d);
        if (mark.fillPicture) paintPicture(context, mark.fillPicture, options, shape);
        else if (mark.fillGradient) paintChartGradient(context, mark.fillGradient, shape);
        else if (mark.fill !== undefined && mark.fill !== "none") {
          context.fillStyle = mark.fill;
          context.fill(shape);
        }
        if (mark.stroke !== undefined && mark.stroke !== "none" && (mark.strokeWidth ?? 1) > 0) {
          context.strokeStyle = mark.stroke;
          context.lineWidth = mark.strokeWidth ?? 1;
          context.stroke(shape);
        }
        break;
      }
      case "line":
        if (mark.width <= 0) break;
        context.beginPath();
        context.moveTo(mark.x1, mark.y1);
        context.lineTo(mark.x2, mark.y2);
        fillAndStroke(context, undefined, mark.stroke, mark.width);
        break;
      case "text":
        context.save();
        try {
          context.translate(mark.x, mark.y);
          if (mark.rotate) context.rotate(mark.rotate * Math.PI / 180);
          context.font = chartFontShorthand(mark.font);
          context.textAlign = ALIGN[mark.anchor];
          context.fillStyle = mark.font.color;
          context.fillText(mark.text, 0, 0);
        } finally { context.restore(); }
        break;
      case "group":
        if (mark.clip === undefined) {
          paintMarks(context, mark.marks, path, options);
          break;
        }
        context.save();
        try {
          context.beginPath();
          context.rect(mark.clip.x, mark.clip.y, mark.clip.width, mark.clip.height);
          context.clip();
          paintMarks(context, mark.marks, path, options);
        } finally { context.restore(); }
        break;
    }
  }
}

/** Fills and strokes the current path. */
function fillAndStroke<Path>(context: ChartCanvasContext<Path>, fill: string | undefined, stroke: string | undefined, width: number, gradient?: ChartGradientPaint, redraw?: () => void, picture?: ChartPicturePaint, options: ChartCanvasOptions = {}): void {
  if (picture) { paintPicture(context, picture, options); redraw?.(); }
  else if (gradient) { paintChartGradient(context, gradient); redraw?.(); }
  else if (fill !== undefined && fill !== "none") {
    context.fillStyle = fill;
    context.fill();
  }
  if (stroke !== undefined && stroke !== "none" && width > 0) {
    context.strokeStyle = stroke;
    context.lineWidth = width;
    context.stroke();
  }
}

function paintPicture<Path>(context: ChartCanvasContext<Path>, paint: ChartPicturePaint, options: ChartCanvasOptions, shape?: Path) {
  if (!options.picture) return;
  context.save();
  try {
    context.clip(shape);
    context.translate(paint.bounds.x, paint.bounds.y);
    options.picture(paint.picture, paint.bounds.width, paint.bounds.height);
  } finally { context.restore(); }
}
