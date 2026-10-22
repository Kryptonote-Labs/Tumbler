import { openWordArtifact, wordParagraphText, type WordArtifact } from '../src/index.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';

export const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
export const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
export const p = (text: string) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
export function open(body: string) {
  return openWordArtifact(buildWordDocumentFixture({ documentXml: `<w:document xmlns:w="${ns}"><w:body>${body}</w:body></w:document>` }));
}
export function paragraphs(artifact: WordArtifact) {
  return artifact.document.blocks.filter(block => block.kind === 'paragraph');
}
export function selection(artifact: WordArtifact, start: number, end = start, last = 0) {
  const items = paragraphs(artifact);
  return { anchor: { paragraphElementId: items[0]!.elementId, offset: start }, focus: { paragraphElementId: items[last]!.elementId, offset: end } };
}
export function texts(artifact: WordArtifact) {
  return paragraphs(artifact).map(item => wordParagraphText(artifact.document, item));
}

