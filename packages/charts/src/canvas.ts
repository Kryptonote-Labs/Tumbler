import type { ChartMark, ChartScene } from "./scene-marks.ts";
import { chartFontShorthand } from "./scene-style.ts";

/**
 * The Canvas 2D subset that chart painting uses. Browser, OffscreenCanvas and server canvases
 * satisfy it; `Path` is the host's Path2D.
 */
export interface ChartCanvasContext<Path> {
  font: string;
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
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
  clip(): void;
  fill(path?: Path): void;
  stroke(path?: Path): void;
  fillText(text: string, x: number, y: number): void;
}

/** Paints a chart scene at the context's current transform, one unit per scene pixel. */
export function paintChartScene<Path>(context: ChartCanvasContext<Path>, scene: ChartScene, path: (d: string) => Path): void {
  context.save();
  context.beginPath();
  context.rect(0, 0, scene.width, scene.height);
  context.clip();
  context.textBaseline = "alphabetic";
  paintMarks(context, scene.marks, path);
  context.restore();
}

const ALIGN = { start: "left", middle: "center", end: "right" } as const;

function paintMarks<Path>(context: ChartCanvasContext<Path>, marks: readonly ChartMark[], path: (d: string) => Path): void {
  for (const mark of marks) {
    switch (mark.kind) {
      case "rect":
        context.beginPath();
        context.rect(mark.x, mark.y, mark.width, mark.height);
        fillAndStroke(context, mark.fill, mark.stroke, 1);
        break;
      case "circle":
        context.beginPath();
        context.arc(mark.cx, mark.cy, mark.r, 0, Math.PI * 2);
        context.globalAlpha = mark.fillOpacity ?? 1;
        fillAndStroke(context, mark.fill, undefined, 1);
        context.globalAlpha = 1;
        fillAndStroke(context, undefined, mark.stroke, 1);
        break;
      case "path": {
        const shape = path(mark.d);
        if (mark.fill !== undefined) {
          context.fillStyle = mark.fill;
          context.fill(shape);
        }
        if (mark.stroke !== undefined) {
          context.strokeStyle = mark.stroke;
          context.lineWidth = mark.strokeWidth ?? 1;
          context.stroke(shape);
        }
        break;
      }
      case "line":
        context.beginPath();
        context.moveTo(mark.x1, mark.y1);
        context.lineTo(mark.x2, mark.y2);
        fillAndStroke(context, undefined, mark.stroke, mark.width);
        break;
      case "text":
        context.save();
        context.translate(mark.x, mark.y);
        if (mark.rotate) context.rotate(mark.rotate * Math.PI / 180);
        context.font = chartFontShorthand(mark.font);
        context.textAlign = ALIGN[mark.anchor];
        context.fillStyle = mark.font.color;
        context.fillText(mark.text, 0, 0);
        context.restore();
        break;
      case "group":
        if (mark.clip === undefined) {
          paintMarks(context, mark.marks, path);
          break;
        }
        context.save();
        context.beginPath();
        context.rect(mark.clip.x, mark.clip.y, mark.clip.width, mark.clip.height);
        context.clip();
        paintMarks(context, mark.marks, path);
        context.restore();
        break;
    }
  }
}

/** Fills and strokes the current path. */
function fillAndStroke<Path>(context: ChartCanvasContext<Path>, fill: string | undefined, stroke: string | undefined, width: number): void {
  if (fill !== undefined) {
    context.fillStyle = fill;
    context.fill();
  }
  if (stroke !== undefined) {
    context.strokeStyle = stroke;
    context.lineWidth = width;
    context.stroke();
  }
}
