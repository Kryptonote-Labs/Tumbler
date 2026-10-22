import { openWordArtifact, wordParagraphText, type WordArtifact } from '../src/index.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';
export const textRun = (text: string) => `<w:r><w:t>${text}</w:t></w:r>`;
export const marker = (type: string) => `<w:r><w:fldChar w:fldCharType="${type}"/></w:r>`;
export const complexField = (instruction: string, result: string) => `${marker('begin')}<w:r><w:instrText>${instruction}</w:instrText></w:r>${marker('separate')}${result}${marker('end')}`;
export function fieldArtifact(body: string) {
  return openWordArtifact(buildWordDocumentFixture({ documentXml: `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>` }));
}
export function firstParagraph(artifact: WordArtifact) {
  const paragraph = artifact.document.blocks[0];
  if (paragraph?.kind !== 'paragraph') throw new Error('Expected paragraph');
  return paragraph;
}
export function visible(artifact: WordArtifact) { return wordParagraphText(artifact.document, firstParagraph(artifact)); }
export function deleteField(artifact: WordArtifact, start = 1) {
  const paragraphElementId = firstParagraph(artifact).elementId;
  return artifact.replaceText({ anchor: { paragraphElementId, offset: start }, focus: { paragraphElementId, offset: start + 1 } }, '');
}
