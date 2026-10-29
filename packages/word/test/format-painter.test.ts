import { expect, test } from 'bun:test';
import * as Y from 'yjs';
import { NativeWordDocument, createWordArtifact, importWordContent, openWordArtifact, wordFormatPainterSample } from '../src/index.ts';
import { createWordCommands, WordShapeText } from '../src/collaboration/index.ts';
import { beginPackageTransaction } from '../../opc/src/index.ts';

const commands = createWordCommands();
const positioning = { indentStartTwips: 200, tabs: [{ positionTwips: 1440, alignment: 'end', leader: 'dot' }] } as const;
const source = new NativeWordDocument({ content: [{ kind: 'paragraph', styleId: 'Heading2', positioning, runs: [{ text: 'Source', format: { color: '#174A26' } }] }] });
const content = (story: WordShapeText) => story.paragraphs().map(paragraph => ({ kind: 'paragraph' as const, ...paragraph }));

test('painting resolved character formatting clears old appearance and preserves linked text', () => {
  const doc = new Y.Doc();
  const text = doc.getText('body');
  text.insert(0, 'Target', { italic: true, highlight: 'yellow', shading: '#FF0000', fontSize: 10, link: 'https://example.com' });
  text.insert(text.length, '\n', { positioning: { indentStartTwips: 900 } });
  const sample = wordFormatPainterSample(source, 0)!;
  text.applyDelta(commands.formatWordDelta(text, { start: 0, end: 6 }, sample.character));
  expect(text.toString()).toBe('Target\n');
  expect(commands.wordFormats(text, { start: 0, end: 6 })).toMatchObject({ fontSize: 16, bold: true, italic: false, highlight: 'none', shading: 'transparent', link: 'https://example.com' });
  expect(commands.wordFormats(text, { start: 0, end: 0 }).positioning?.indentStartTwips).toBe(900);
  doc.destroy();
});

test('painting paragraph formatting replaces direct positioning and retains heading level through export', () => {
  const story = new WordShapeText({ textBody: [{ runs: [{ text: 'Target' }], positioning: { indentStartTwips: 900, tabs: [{ positionTwips: 500, alignment: 'start', leader: 'none' }] } }] });
  const sample = wordFormatPainterSample(source, 0, { positioning })!;
  story.format({ start: 0, end: 6 }, { ...sample.character, ...sample.paragraph });
  const native = new NativeWordDocument({ content: content(story) });
  const artifact = openWordArtifact(native.artifact().bytes());
  const block = artifact.document.blocks[0]!;
  if (block.kind !== 'paragraph') throw new Error('Expected paragraph');
  const actual = artifact.document.styles.paragraphFormat(artifact.document, block);
  expect(actual.styleId).toBe('Heading2');
  expect(actual.outlineLevel).toBe(1);
  expect(actual.indentStartTwips).toBe(200);
  expect(actual.tabs).toEqual(positioning.tabs);
  expect(story.text.toString()).toBe('Target\n');
  story.destroy();
});

test('painting an empty paragraph stores character formatting for later typing and DOCX export', () => {
  const story = new WordShapeText({ text: '' });
  const sample = wordFormatPainterSample(source, 0)!;
  story.format({ start: 0, end: 0 }, { ...sample.character, ...sample.paragraph });
  expect(story.formats({ start: 0, end: 0 })).toMatchObject({ bold: true, fontSize: 16, color: '#174A26' });
  const native = new NativeWordDocument({ content: content(story) });
  const artifact = openWordArtifact(native.artifact().bytes());
  const block = artifact.document.blocks[0]!;
  if (block.kind !== 'paragraph') throw new Error('Expected paragraph');
  expect(artifact.document.styles.runFormat(artifact.document, block)).toMatchObject({ bold: true, fontSizePoints: 16, color: '#174A26' });
  story.replace({ start: 0, end: 0 }, 'New text');
  expect(story.formats({ start: 0, end: 8 })).toMatchObject({ bold: true, color: '#174A26' });
  story.destroy();
});

test('painting an imported empty paragraph updates its mark without losing opaque Word properties', () => {
  const original = createWordArtifact({ paragraphs: [{ styleId: 'Normal', runs: [{ text: '' }] }] });
  const transaction = beginPackageTransaction(original.document.package);
  transaction.replacePart(original.document.part.name, new TextEncoder().encode(original.document.source.source.replace('</w:pPr>', '<w:rPr><w:lang w:val="en-US"/></w:rPr></w:pPr>')));
  const imported = openWordArtifact(transaction.commit());
  const first = importWordContent(imported)[0]!;
  if (first.kind !== 'paragraph') throw new Error('Expected paragraph');
  const story = new WordShapeText({ textBody: [{
    runs: first.runs.map(run => ({ text: run.text, ...(run.format ? { format: run.format } : {}) })),
    ...(first.styleId ? { styleId: first.styleId } : {}),
    ...(first.paragraph ? { paragraph: first.paragraph } : {}),
    ...(first.positioning ? { positioning: first.positioning } : {}),
  }] });
  const sample = wordFormatPainterSample(source, 0)!;
  story.format({ start: 0, end: 0 }, { ...sample.character, ...sample.paragraph });
  const native = new NativeWordDocument({ source: imported });
  native.update([{ ...first, ...story.paragraphs()[0]!, kind: 'paragraph' }]);
  const artifact = openWordArtifact(native.artifact().bytes());
  const block = artifact.document.blocks[0]!;
  if (block.kind !== 'paragraph') throw new Error('Expected paragraph');
  expect(artifact.document.styles.runFormat(artifact.document, block)).toMatchObject({ bold: true, color: '#174A26' });
  expect(artifact.document.source.source).toContain('<w:lang w:val="en-US"/>');
  story.destroy();
});
