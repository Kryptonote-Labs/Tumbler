/** Shared OOXML vocabulary and compatibility behavior. */
export {
  DEFAULT_LOSSLESS_XML_LIMITS,
  encodeXmlSource,
  LosslessXmlDocument,
  LosslessXmlError,
  parseLosslessXml,
} from "./xml/source-document.ts";
export type {
  LosslessXmlAttribute,
  LosslessXmlElement,
  LosslessXmlErrorCode,
  LosslessXmlLimits,
  LosslessXmlNode,
  LosslessXmlText,
  SourceSpan,
  XmlEncoding,
  XmlQualifiedName,
} from "./xml/source-document.ts";
export {
  beginLosslessXmlEdit,
  LosslessXmlEditor,
  XmlEditError,
} from "./xml/editor.ts";
export { identifyOoxmlNamespace, OOXML_NAMESPACES } from "./namespaces.ts";
export {
  OoxmlThemeError,
  parseThemeColorScheme,
  ThemeColorScheme,
  THEME_COLOR_SLOTS,
} from "./theme-colors.ts";
export type { ThemeColorSlot } from "./theme-colors.ts";
export {
  parseThemeFontScheme,
  ThemeFontScheme,
} from "./theme-fonts.ts";
export type {
  ThemeFontRole,
  ThemeFontScript,
  ThemeTypefaceSet,
} from "./theme-fonts.ts";
export type {
  OoxmlNamespaceProfile,
  OoxmlVocabulary,
} from "./namespaces.ts";
export {
  createMarkupCompatibilityView,
  MarkupCompatibilityError,
  MarkupCompatibilityView,
} from "./markup-compatibility.ts";
export {
  beginCorePropertiesEdit,
  CoreProperties,
  CorePropertiesEditor,
  CorePropertiesError,
  parseCoreProperties,
  readCoreProperties,
} from "./core-properties.ts";
export type {
  CorePropertiesErrorCode,
  CorePropertyName,
} from "./core-properties.ts";
export type {
  MarkupCompatibilityErrorCode,
  MarkupCompatibilityOptions,
} from "./markup-compatibility.ts";
export type {
  NewXmlAttribute,
  XmlEditErrorCode,
  XmlEditResult,
  XmlEditorStatus,
} from "./xml/editor.ts";

export { DEFAULT_OFFICE_THEME, officeThemeXml } from './office-theme.ts';

export { customGeometry, evaluateGeometry, resolveDrawingGeometry, resizeDrawingGeometry, nativePresetGeometry } from "./drawing-geometry.ts";
export type { GeometryDefinition, DrawingGeometry } from "./drawing-geometry.ts";
export { presetGeometries } from "./preset-geometries.ts";
export { resolveDrawingColor } from "./drawing-color.ts";
export { gradientFill, gradientFillMarkup, linearGradientLine, rectangularGradientFaces, type GradientFill, type DrawingGradient } from "./gradient.ts";
export { drawingGradientFill } from "./gradient.ts";
export { readGradientFill } from "./gradient.ts";
export { paintDrawingGradient, paintRectangularGradient, type DrawingGradientCanvasContext } from "./gradient-canvas.ts";
