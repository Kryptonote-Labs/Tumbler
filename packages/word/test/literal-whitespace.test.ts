import { expect, test } from 'bun:test';
import * as Y from 'yjs';
import { createWordNativeArchive, decodeWordNativeArchive, encodeWordNativeArchive, importWordContent,
  NativeWordDocument, openWordArtifact, openWordNativeArchive, wordParagraphText } from '../src/index.ts';
import { restoreWordSourceWhitespace } from '../src/collaboration/source-whitespace.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';

const w = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const spellings = ['literalLF A\nB', 'literalCRLF A\r\nB', 'literalCR A\rB', 'entityLF A&#xA;B',
  'entityCR A&#xD;B', 'entityCRLF A&#xD;&#xA;B', 'tabs A\tB', 'entityTab A&#x9;B',
  'mixed A\r&#xA;B', 'trailing A\r&#xA;', 'opposite A&#xD;\nB'];
const expected = ['literalLF A B', 'literalCRLF A B', 'literalCR A B', 'entityLF A B',
  'entityCR A\u2028B', 'entityCRLF A\u2028 B', 'tabs A\tB', 'entityTab A\tB',
  'mixed A  B', 'trailing A  ', 'opposite A\u2028 B'];
function source() {
  return openWordArtifact(buildWordDocumentFixture({ documentXml: `<w:document xmlns:w="${w}"><w:body>` +
    spellings.map(text => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`).join('') + '</w:body></w:document>' }));
}

test('literal XML line ends and referenced carriage returns retain Writer semantics and lexical source', () => {
  const original = source();
  const restored = openWordNativeArchive(decodeWordNativeArchive(encodeWordNativeArchive(createWordNativeArchive(original))));
  for (const artifact of [original, restored]) {
    expect(artifact.document.blocks.map(block => block.kind === 'paragraph' ? wordParagraphText(artifact.document, block) : '')).toEqual(expected);
    const content = importWordContent(artifact);
    expect(content.map(block => block.kind === 'paragraph' ? block.runs.map(run => run.text).join('') : '')).toEqual(expected);
    const model = new NativeWordDocument({ source: artifact, content });
    expect(new NativeWordDocument({ source: artifact }).artifact().bytes()).toEqual(original.bytes());
    const layout = model.layout({ measure: value => ({ width: value.length * 5, ascent: 8, descent: 2 }) });
    expect(layout.pages.flatMap(page => page.columns.flatMap(column => column.lines.map(line =>
      line.fragments.map(fragment => fragment.text).join(''))))).toEqual(expected.flatMap(value => value.split('\u2028').map(line => line.replace(/ +$/u, ''))));
    model.update([...content, { kind: 'paragraph', runs: [{ text: 'Neighbour edit' }] }]);
    const xml = model.artifact().document.source.source;
    for (const text of spellings) expect(xml).toContain(`<w:t xml:space="preserve">${text}</w:t>`);
  }
});

test('native v1 archives with the old literal-line-end projection rebuild from preserved bytes', async () => {
  const bytes = new Uint8Array(await Bun.file(new URL('./fixtures/legacy-literal-newlines.native', import.meta.url)).arrayBuffer());
  const archive = decodeWordNativeArchive(bytes), restored = openWordNativeArchive(archive);
  const content = importWordContent(restored);
  expect(content.some(block => block.kind === 'paragraph' && block.runs.some(run => /[\r\n]/.test(run.text)))).toBe(false);
  expect(content.some(block => block.kind === 'paragraph' && block.runs.some(run => run.text === ' literal line feed '))).toBe(true);
  const current = openWordNativeArchive(createWordNativeArchive(restored));
  expect(current.bytes()).toEqual(restored.bytes());
  expect(importWordContent(current)).toEqual(content);
});

test('old shared source text repairs only unchanged originals, preserving formatting and user changes', () => {
  const artifact = source(), doc = new Y.Doc(), text = doc.getText('body');
  const elements = artifact.document.source.elements(w, 't');
  try {
    for (const [index, element] of elements.entries()) {
      const value = artifact.document.source.textContentOrigins(element).map(part => part.original).join('');
      text.insert(text.length, value, { wordSource: element.id, bold: index % 2 === 0 });
      text.insert(text.length, '\n', { wordParagraph: index + 100 });
    }
    const beforeSource = artifact.bytes().slice();
    expect(restoreWordSourceWhitespace(text, artifact)).toBe(13);
    expect(text.toString()).toBe(expected.join('\n') + '\n');
    for (const part of text.toDelta()) if (part.attributes?.wordSource)
      expect(part.attributes.bold).toBe(elements.findIndex(element => element.id === part.attributes.wordSource) % 2 === 0);
    expect(artifact.bytes()).toEqual(beforeSource);
    expect(restoreWordSourceWhitespace(text, artifact)).toBe(0);
    const changed = new Y.Doc();
    try {
      const target = changed.getText('body');
      target.insert(0, 'User changed A\r\nB', { wordSource: elements[1]!.id });
      target.insert(target.length, 'literalCRLF A\r\nB', { wordSource: elements[1]!.id, wordCopy: 'copy' });
      const before = target.toDelta();
      expect(restoreWordSourceWhitespace(target, artifact)).toBe(0);
      expect(target.toDelta()).toEqual(before);
    } finally { changed.destroy(); }
  } finally { doc.destroy(); }
});
