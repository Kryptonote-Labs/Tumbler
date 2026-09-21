import type {
  DrawingGradient,
  DrawingShadow,
  DrawingLineEnd,
} from "./appearance.ts";
import type { DrawingGeometry } from "./drawing-geometry.ts";
import type { ChartModel } from "@tumblerjs/charts";
import type { LosslessXmlDocument } from "@tumblerjs/ooxml";
import type { OpcPackage } from "@tumblerjs/opc";

export type Matrix = readonly [number, number, number, number, number, number];
export interface SlideTransform {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
  readonly flipH: boolean;
  readonly flipV: boolean;
}
export interface PresentationDiagnostic {
  readonly part: string;
  readonly shapeId?: string;
  readonly message: string;
}
export interface SlideTextRun {
  readonly text: string;
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly color: string;
  readonly bold: boolean;
  readonly italic: boolean;
  readonly underline: boolean;
  readonly strike?: boolean;
  readonly baseline?: number;
  readonly spacing?: number;
  readonly capitals?: string;
  readonly hyperlink?: { readonly href?: string; readonly slidePart?: string };
}
export interface SlideParagraph {
  readonly tabs?: readonly { position: number; alignment: string }[];
  readonly defaultTabSize?: number;
  readonly distributed?: boolean;
  readonly marginRight?: number;
  readonly fontSize?: number;
  readonly runs: readonly SlideTextRun[];
  readonly align: "left" | "center" | "right" | "justify";
  readonly bullet: string;
  readonly marginLeft: number;
  readonly indent: number;
  readonly before: number;
  readonly after: number;
  readonly lineHeight: number | string;
  readonly rtl?: boolean;
  readonly bulletFont?: string;
  readonly bulletColor?: string;
  readonly bulletSize?: number;
}
export interface SlideText {
  readonly autoFit?: "none" | "normal" | "shape";
  readonly horizontalOverflow?: "overflow" | "clip";
  readonly verticalOverflow?: "overflow" | "clip" | "ellipsis";
  readonly editable?: boolean;
  readonly paragraphs: readonly SlideParagraph[];
  readonly inset: readonly [number, number, number, number];
  readonly anchor: "top" | "center" | "bottom";
  readonly wrap: boolean;
  readonly direction?: string;
  readonly rotation?: number;
  readonly columns?: number;
  readonly columnGap?: number;
  readonly tabSize?: number;

  readonly textElementId: number | undefined;
}
export interface SlideTableCell {
  readonly elementId: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly row: number;
  readonly column: number;
  readonly rowSpan: number;
  readonly columnSpan: number;
  readonly fill: string;
  readonly text: SlideText | undefined;
  readonly borders: readonly {
    readonly color: string;
    readonly width: number;
    readonly dash: string;
  }[];
}
export interface SlideTable {
  readonly elementId: number;
  readonly width: number;
  readonly height: number;
  readonly cells: readonly SlideTableCell[];
}
export interface SlideObject {
  readonly media?: import("./media.ts").PresentationMedia | undefined;
  readonly key: string;
  readonly shapeId: string;
  readonly elementId: number;
  readonly sourcePart: string;
  readonly layer: "master" | "layout" | "slide";
  readonly name: string;
  readonly kind: "shape" | "picture" | "chart" | "table" | "unsupported";
  readonly geometry: string;
  readonly drawingGeometry: DrawingGeometry | undefined;
  readonly transform: SlideTransform;
  readonly matrix: Matrix;
  readonly fill: string;
  readonly gradient: DrawingGradient | undefined;
  readonly shadow: DrawingShadow | undefined;
  readonly strokeDash: string;
  readonly strokeCap: "butt" | "round" | "square";
  readonly head: DrawingLineEnd | undefined;
  readonly tail: DrawingLineEnd | undefined;
  readonly stroke: string;
  readonly strokeWidth: number;
  readonly cornerRadius: number;
  readonly text: SlideText | undefined;
  readonly effects?: readonly import("./appearance.ts").DrawingEffect[];
  readonly reflection?: import("./appearance.ts").DrawingReflection | undefined;
  readonly pattern?: import("./appearance.ts").DrawingPattern | undefined;
  readonly pictureFill?:
    | import("./appearance.ts").DrawingPictureFill
    | undefined;
  readonly image: import("./appearance.ts").DrawingPictureFill | undefined;
  readonly chart: ChartModel | undefined;
  readonly table: SlideTable | undefined;
  readonly movable: boolean;
  readonly textEditable: boolean;
  readonly restriction: string | undefined;
  readonly transformElementId: number | undefined;
}
export interface PresentationSlide {
  readonly animations?: readonly import("./timing.ts").SlideAnimation[];
  readonly transition?: import("./timing.ts").SlideTransition | undefined;
  readonly id: string;
  readonly part: string;
  readonly title: string;
  readonly hidden: boolean;
  readonly notes: string;
  readonly background: string;
  readonly backgroundPattern?:
    | import("./appearance.ts").DrawingPattern
    | undefined;
  readonly backgroundPicture?:
    | import("./appearance.ts").DrawingPictureFill
    | undefined;
  readonly backgroundGradient: DrawingGradient | undefined;
  readonly objects: readonly SlideObject[];
  readonly diagnostics: readonly PresentationDiagnostic[];
}
export interface PresentationEmbeddedFont {
  readonly family: string;
  readonly bold: boolean;
  readonly italic: boolean;
  readonly bytes: Uint8Array;
}
export interface PresentationDocument {
  readonly embeddedFonts?: readonly PresentationEmbeddedFont[];
  readonly package: OpcPackage;
  readonly conformance: "strict" | "transitional";
  readonly width: number;
  readonly height: number;
  readonly slides: readonly PresentationSlide[];
  readonly sources: ReadonlyMap<string, LosslessXmlDocument>;
  readonly signed: boolean;
}
export class PresentationError extends Error {
  constructor(
    readonly code:
      | "invalid_document"
      | "unsupported_document"
      | "limit_exceeded"
      | "unsupported_edit",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "PresentationError";
  }
}
export interface OpenPresentationOptions {
  readonly maxSlides?: number;
  readonly maxObjects?: number;
  readonly maxGroupDepth?: number;
  readonly maxTextCharacters?: number;
}
export interface PresentationObjectChange {
  /** Clockwise degrees; omitted values preserve the current rotation. */
  readonly rotation?: number;
  readonly slideId: string;
  readonly objectKey: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
