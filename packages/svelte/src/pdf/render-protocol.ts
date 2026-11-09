import type {
  PdfSource,
  PdfScenePlacement,
  PdfTextContent,
  PdfPaintOptions,
  PdfError,
  PdfExecutionLimits,
} from "@tumblerjs/pdf";
export type PdfTileRequest = {
  page: number;
  scale: number;
  region: NonNullable<PdfPaintOptions["region"]>;
  text?: boolean;
  /** Thumbnails can discard decoded page resources after painting. */
  cache?: boolean;
  /** Apply source-preserving editing projections without moving PDF interpretation to the UI thread. */
  projection?: {
    placements: readonly PdfScenePlacement[];
    exclude: readonly string[];
    excludeAnnotations?: readonly string[];
    include?: readonly string[];
    transparent?: boolean;
    snapshot?: Uint8Array;
    blank?: { width: number; height: number };
  };
};
export type PdfRenderRequest =
  | { type: "open"; input: ReturnType<PdfSource["renderInput"]>; limits: PdfExecutionLimits }
  | { type: "render"; id: number; tile: PdfTileRequest }
  | { type: "release"; page: number };
export type PdfRenderResponse =
  | { id: number; bitmap: ImageBitmap; text?: PdfTextContent }
  | { id: number; error: string; code?: PdfError["code"] };
