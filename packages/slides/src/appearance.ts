export type { DrawingGradient } from "@tumblerjs/ooxml";
import type { DrawingGradient } from "@tumblerjs/ooxml";
export interface DrawingShadow {
  readonly color: string;
  readonly blur: number;
  readonly x: number;
  readonly y: number;
}
export interface DrawingLineEnd {
  readonly type: string;
  readonly width: number;
  readonly length: number;
}
export type { DrawingPictureFill } from '@tumblerjs/ooxml';
export interface DrawingEffect {
  readonly kind: "glow" | "innerShadow" | "softEdge" | "blur";
  readonly radius: number;
  readonly color: string;
  readonly x: number;
  readonly y: number;
}
export interface DrawingPattern {
  readonly preset: string;
  readonly foreground: string;
  readonly background: string;
}
export interface DrawingReflection {
  readonly blur: number;
  readonly startAlpha: number;
  readonly endAlpha: number;
  readonly startPosition: number;
  readonly endPosition: number;
  readonly fadeDirection: number;
  readonly x: number;
  readonly y: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly skewX: number;
  readonly skewY: number;
  readonly alignment: string;
}
