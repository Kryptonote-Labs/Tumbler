export const OOXML_NAMESPACES = Object.freeze({
  markupCompatibility: "http://schemas.openxmlformats.org/markup-compatibility/2006",
  coreProperties: "http://schemas.openxmlformats.org/package/2006/metadata/core-properties",
  dublinCore: "http://purl.org/dc/elements/1.1/",
  dublinCoreTerms: "http://purl.org/dc/terms/",
  dublinCoreType: "http://purl.org/dc/dcmitype/",
  xsi: "http://www.w3.org/2001/XMLSchema-instance",
  transitional: Object.freeze({
    wordprocessing: "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    spreadsheet: "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    presentation: "http://schemas.openxmlformats.org/presentationml/2006/main",
    drawing: "http://schemas.openxmlformats.org/drawingml/2006/main",
    spreadsheetDrawing: "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing",
    chart: "http://schemas.openxmlformats.org/drawingml/2006/chart",
  }),
  strict: Object.freeze({
    wordprocessing: "http://purl.oclc.org/ooxml/wordprocessingml/main",
    spreadsheet: "http://purl.oclc.org/ooxml/spreadsheetml/main",
    presentation: "http://purl.oclc.org/ooxml/presentationml/main",
    drawing: "http://purl.oclc.org/ooxml/drawingml/main",
    spreadsheetDrawing: "http://purl.oclc.org/ooxml/drawingml/spreadsheetDrawing",
    chart: "http://purl.oclc.org/ooxml/drawingml/chart",
  }),
});

export type OoxmlVocabulary =
  | "wordprocessing"
  | "spreadsheet"
  | "presentation"
  | "drawing";

export interface OoxmlNamespaceProfile {
  readonly vocabulary: OoxmlVocabulary;
  readonly conformance: "strict" | "transitional";
}

export function identifyOoxmlNamespace(
  namespaceUri: string,
): OoxmlNamespaceProfile | undefined {
  for (const conformance of ["strict", "transitional"] as const) {
    const profile = OOXML_NAMESPACES[conformance];
    for (const vocabulary of [
      "wordprocessing",
      "spreadsheet",
      "presentation",
      "drawing",
    ] as const) {
      if (profile[vocabulary] === namespaceUri) {
        return Object.freeze({ vocabulary, conformance });
      }
    }
  }
  return undefined;
}
