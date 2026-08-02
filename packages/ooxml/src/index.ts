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
export type {
  NewXmlAttribute,
  XmlEditErrorCode,
  XmlEditResult,
  XmlEditorStatus,
} from "./xml/editor.ts";
