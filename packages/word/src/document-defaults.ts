import type { WordDocument, WordParagraph } from './document.ts';

/** Resolve document/style defaults once, including the default paragraph style and theme fonts. */
export function wordDocumentDefaults(document: WordDocument) {
  const paragraph: WordParagraph = { kind:'paragraph', elementId:0, propertiesElementId:undefined, section:undefined, inlines:[] };
  return { paragraph: document.styles.paragraphFormat(document, paragraph), text: document.styles.runFormat(document, paragraph) };
}
