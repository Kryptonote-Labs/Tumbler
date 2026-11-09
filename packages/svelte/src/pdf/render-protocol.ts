import type {
  PdfSource,
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
};
export type PdfRenderRequest =
  | { type: "open"; input: ReturnType<PdfSource["renderInput"]>; limits: PdfExecutionLimits }
  | { type: "render"; id: number; tile: PdfTileRequest }
  | { type: "release"; page: number };
export type PdfRenderResponse =
  | { id: number; bitmap: ImageBitmap; text?: PdfTextContent }
  | { id: number; error: string; code?: PdfError["code"] };
