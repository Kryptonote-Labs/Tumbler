import type { PdfBox, PdfPage } from "./document.ts";
import type { PdfFont, PdfGlyph } from "./fonts.ts";
import type { PdfMatrix } from "./matrix.ts";
import type { PdfDictionary, PdfReference } from "./objects.ts";

export type PdfPathCommand = (
  | { readonly kind: "move" | "line"; readonly x: number; readonly y: number }
  | {
      readonly kind: "curve";
      readonly x1: number;
      readonly y1: number;
      readonly x2: number;
      readonly y2: number;
      readonly x: number;
      readonly y: number;
    }
  | { readonly kind: "close" }
) & { readonly transform?: PdfMatrix };
export interface PdfClip {
  readonly path: readonly PdfPathCommand[];
  readonly transform: PdfMatrix;
  readonly rule: "nonzero" | "evenodd";
}
export type PdfPaint =
  | string
  | {
      readonly kind: "shading-pattern";
      readonly shading: PdfDictionary;
      readonly transform: PdfMatrix;
      readonly resources: PdfDictionary;
    };
export interface PdfPaintState {
  readonly transform: PdfMatrix;
  readonly clips: readonly PdfClip[];
  readonly fill: PdfPaint;
  readonly stroke: PdfPaint;
  readonly fillAlpha: number;
  readonly strokeAlpha: number;
  readonly blend: GlobalCompositeOperation;
  readonly lineWidth: number;
  readonly lineCap: CanvasLineCap;
  readonly lineJoin: CanvasLineJoin;
  readonly miterLimit: number;
  readonly dash: readonly number[];
  readonly dashPhase: number;
}
export interface PdfSceneSource {
  readonly object: PdfReference;
  readonly instance: string;
  readonly start: number;
  readonly end: number;
}
interface Element {
  readonly id: string;
  readonly source: PdfSceneSource;
  readonly state: PdfPaintState;
}
export interface PdfPathElement extends Element {
  readonly kind: "path";
  readonly path: readonly PdfPathCommand[];
  readonly fillRule: "nonzero" | "evenodd";
  readonly fill: boolean;
  readonly stroke: boolean;
}
export interface PdfGlyphElement extends Element {
  readonly kind: "glyph";
  readonly font: PdfFont;
  readonly glyph: PdfGlyph;
  readonly textMatrix: PdfMatrix;
  readonly fontSize: number;
  readonly mode: number;
  readonly advance: readonly [number, number];
}
export interface PdfImageData {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray | undefined;
  readonly encoded: Uint8Array | undefined;
  readonly mime: string | undefined;
  readonly interpolate: boolean;
  readonly stencil: boolean;
}
export interface PdfImageElement extends Element {
  readonly kind: "image";
  readonly image: PdfImageData;
}
export interface PdfShadingElement extends Element {
  readonly kind: "shading";
  readonly shading: PdfDictionary;
  readonly resources: PdfDictionary;
}
export type PdfSceneElement =
  | PdfPathElement
  | PdfGlyphElement
  | PdfImageElement
  | PdfShadingElement;
export interface PdfPageScene {
  readonly page: PdfPage;
  readonly width: number;
  readonly height: number;
  readonly viewport: PdfMatrix;
  readonly elements: readonly PdfSceneElement[];
  readonly text: string;
  readonly annotations: readonly {
    readonly subtype: string;
    readonly contents: string;
    readonly rect: PdfBox | undefined;
  }[];
}

export function pageViewport(page: PdfPage): PdfMatrix {
  const [left, bottom, right, top] = page.cropBox,
    unit = page.userUnit;
  switch (page.rotation) {
    case 0:
      return [unit, 0, 0, -unit, -left * unit, top * unit];
    case 90:
      return [0, unit, unit, 0, -bottom * unit, -left * unit];
    case 180:
      return [-unit, 0, 0, unit, right * unit, -bottom * unit];
    case 270:
      return [0, -unit, -unit, 0, top * unit, right * unit];
  }
}
