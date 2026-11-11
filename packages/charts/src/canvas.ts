import { chartStrokeBrush } from './stroke-brush.ts';
import { paintDrawingPattern } from '@tumblerjs/ooxml';
import { paintChartGradient, paintChartGradientStroke } from './gradient-canvas.ts';
import type { DrawingGradientCanvasContext } from '@tumblerjs/ooxml';
import type { DrawingPictureFill } from '@tumblerjs/ooxml';
import type { ChartPatternPaint, ChartPicturePaint } from './fill-scene.ts';
import type { ChartMark, ChartScene } from "./scene-marks.ts";
import { chartFontShorthand } from "./scene-style.ts";

/**
 * The Canvas 2D subset that chart painting uses. Browser, OffscreenCanvas and server canvases
 * satisfy it; `Path` is the host's Path2D.
 */
export interface ChartCanvasContext<Path, Image = unknown> {
  createPattern?(image: Image, repetition: 'repeat'): import('@tumblerjs/ooxml').DrawingCanvasPattern | null;
  scale?: DrawingGradientCanvasContext['scale'];
  createLinearGradient?: DrawingGradientCanvasContext['createLinearGradient'];
  createRadialGradient?: DrawingGradientCanvasContext['createRadialGradient'];
  filter?: string | undefined;
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
export interface ChartCanvasOptions<Image = unknown> {
  /** Decode enumerated scene images, including native pattern tiles and rectangular outline brushes. */
  readonly image?: ((picture: DrawingPictureFill) => { readonly image: Image; readonly width: number; readonly height: number } | undefined) | undefined;
  /** Paint a predecoded picture at the current origin. The engine applies its bounds and shape clip. */
  readonly picture?: (picture: DrawingPictureFill, width: number, height: number) => void;
}
export function paintChartScene<Path, Image = unknown>(context: ChartCanvasContext<Path, Image>, scene: ChartScene, path: (d: string) => Path, options: ChartCanvasOptions<Image> = {}): void {
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

function paintMarks<Path, Image>(context: ChartCanvasContext<Path, Image>, marks: readonly ChartMark[], path: (d: string) => Path, options: ChartCanvasOptions<Image>): void {
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
        fillMark(context, mark, options);
        strokeMark(context, mark, options, () => { context.beginPath(); context.rect(mark.x, mark.y, mark.width, mark.height); context.stroke(); });
        break;
      case "circle":
        context.beginPath();
        context.arc(mark.cx, mark.cy, mark.r, 0, Math.PI * 2);
        context.globalAlpha = mark.fillOpacity ?? 1;
        fillMark(context, mark, options);
        context.globalAlpha = 1;
        strokeMark(context, mark, options, () => { context.beginPath(); context.arc(mark.cx, mark.cy, mark.r, 0, Math.PI * 2); context.stroke(); });
        break;
      case "path": {
        const shape = path(mark.d);
        fillMark(context, mark, options, shape);
        strokeMark(context, mark, options, () => context.stroke(shape));
        break;
      }
      case "line":
        if (mark.width <= 0) break;
        strokeMark(context, mark, options, () => { context.beginPath(); context.moveTo(mark.x1, mark.y1); context.lineTo(mark.x2, mark.y2); context.stroke(); });
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

function strokeMark<Path, Image>(context: ChartCanvasContext<Path, Image>, mark: Exclude<ChartMark, { kind: 'text' | 'group' }>, options: ChartCanvasOptions<Image>, draw: () => void) {
  const width = mark.kind === 'line' ? mark.width : mark.strokeWidth ?? 1;
  if ((!mark.strokeGradient && (mark.stroke === undefined || mark.stroke === 'none')) || width <= 0) return;
  context.lineWidth = width;
  const paint = options.image && chartStrokeBrush(mark);
  const decoded = paint && options.image?.(paint.picture);
  const brush = decoded && context.createPattern?.(decoded.image, 'repeat');
  if (brush && paint) {
    const bounds = paint.bounds;
    brush.setTransform({ a: bounds.width / decoded.width, b: 0, c: 0, d: bounds.height / decoded.height, e: bounds.x, f: bounds.y });
    context.strokeStyle = brush; draw();
  } else if (mark.strokeGradient && mark.strokeBounds) paintChartGradientStroke(context, { gradient: mark.strokeGradient, bounds: mark.strokeBounds }, draw);
  else { context.strokeStyle = mark.stroke; draw(); }
}

/** Fill the caller's current path, or the supplied reusable path. */
function fillMark<Path, Image>(context: ChartCanvasContext<Path, Image>, mark: Exclude<ChartMark, { kind: 'text' | 'group' | 'line' }>, options: ChartCanvasOptions<Image>, shape?: Path): void {
  if (mark.fillPattern) paintPattern(context, mark.fillPattern, options, shape);
  else if (mark.fillPicture) paintPicture(context, mark.fillPicture, options, shape);
  else if (mark.fillGradient) paintChartGradient(context, mark.fillGradient, shape);
  else if (mark.fill !== undefined && mark.fill !== 'none') {
    context.fillStyle = mark.fill;
    context.fill(shape);
  }
}

function paintPicture<Path, Image>(context: ChartCanvasContext<Path, Image>, paint: ChartPicturePaint, options: ChartCanvasOptions<Image>, shape?: Path) {
  if (!options.picture) return;
  context.save();
  try {
    context.clip(shape);
    context.translate(paint.bounds.x, paint.bounds.y);
    options.picture(paint.picture, paint.bounds.width, paint.bounds.height);
  } finally { context.restore(); }
}

function paintPattern<Path, Image>(context: ChartCanvasContext<Path, Image>, paint: ChartPatternPaint, options: ChartCanvasOptions<Image>, shape?: Path) {
  const decoded = options.image?.(paint.picture);
  if (!decoded) return;
  context.save();
  try {
    context.clip(shape); context.translate(paint.bounds.x, paint.bounds.y);
    paintDrawingPattern(context, decoded.image, paint.bounds.width, paint.bounds.height, { x: paint.bounds.x + paint.origin.x, y: paint.bounds.y + paint.origin.y }, paint.light);
  } finally { context.restore(); }
}
