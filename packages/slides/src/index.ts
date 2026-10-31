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

export { createPresentation } from './authoring-xml.ts';
export { applyPresentationCommand, presentationCommand } from './commands.ts';
export type { PresentationCommand } from './commands.ts';
export type { NewSlideObject, ObjectBounds, ShapeGeometry } from './authoring-objects.ts';
export { inspectPresentation } from './inspect.ts';
export { paintPresentationSlide, presentationSlideImages } from './canvas.ts';
export type { SlideCanvasContext, SlideCanvasOptions } from './canvas.ts';

export { slideObjectEnclosed, translateSlideObject, type SlideSelectionRect } from "./selection.ts";

export { findVisibleSlideIndex } from "./slideshow.ts";
export { rebasePresentationCommands, PresentationRebaseConflict } from './collaboration.ts';

export { findPresentationMatches } from './search.ts';
export type { PresentationSearchMatch } from './search.ts';

export { presentationThemeColours } from './reader.ts';
