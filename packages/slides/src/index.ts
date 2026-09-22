/** Headless PresentationML reading, preservation, scenes, and bounded editing. */
export { openPresentationDocument } from "./reader.ts";
export { openPresentationArtifact, PresentationArtifact } from "./artifact.ts";
export {
  openPresentationEditingSession,
  PresentationEditingSession,
} from "./session.ts";
export { PresentationError } from "./model.ts";
export type {
  Matrix,
  OpenPresentationOptions,
  PresentationDiagnostic,
  PresentationDocument,
  PresentationEmbeddedFont,
  PresentationSlide,
  PresentationObjectChange,
  SlideObject,
  SlideTable,
  SlideTableCell,
  SlideParagraph,
  SlideText,
  SlideTextRun,
  SlideTransform,
} from "./model.ts";
export {
  multiply,
  shapeMatrix,
  resizeSlideTransform,
  transformPoint,
  EMUS_PER_PIXEL,
} from "./geometry.ts";

export type {
  DrawingGradient,
  DrawingShadow,
  DrawingLineEnd,
} from "./appearance.ts";

export {
  presentationFormattingCapabilities,
  presentationTextTarget,
  presentationFormattingState,
  slideTextValue,
  slideColorHex,
} from "./editing.ts";
export type {
  PresentationTextRange,
  PresentationTableCellAddress,
  PresentationTextEdit,
  PresentationFormatChange,
  PresentationShapeStyle,
  PresentationShapeChange,
} from "./editing.ts";
