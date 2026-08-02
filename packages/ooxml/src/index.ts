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
