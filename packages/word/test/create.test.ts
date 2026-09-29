import { describe, expect, test } from 'bun:test';
import { createWordArtifact, wordParagraphText, openWordArtifact } from '../src/index.ts';
import { readCoreProperties } from '@tumblerjs/ooxml';

describe('headless Word creation', () => {
  test('creates a blank editable A4 document with modern Word settings', () => {
    const artifact = createWordArtifact();
    const paragraph = artifact.document.blocks[0]!;
    expect(paragraph.kind).toBe('paragraph');
    const at = { paragraphElementId: paragraph.elementId, offset: 0 };
    const edited = artifact.replaceText({ anchor: at, focus: at }, 'Hello\nWorld');
    expect(edited.document.blocks.filter(block => block.kind === 'paragraph').map(paragraph => wordParagraphText(edited.document, paragraph))).toEqual(['Hello', 'World']);
    expect(artifact.document.finalSection.pageWidthTwips).toBe(11906);
  });

  test('authors mixed formatting, tabs, alignment and escaped properties in one write', () => {
    const artifact = createWordArtifact({
      defaultFormat: { fontFamily: 'Arial', fontSizePoints: 13 },
      lineSpacing: 1.8,
      author: 'Alex & <Team>',
      lastModifiedBy: 'Agent "one"',
      paragraphs: [
        { alignment: 'center', runs: [{ text: 'A < B\t', format: { bold: true, color: '#c62828' } }, { text: 'normal', format: { bold: false, italic: true } }] },
        { runs: [] },
        { runs: [{ text: '最後 😀' }] },
      ],
    });
    const reopened = openWordArtifact(artifact.bytes());
    const paragraphs = reopened.document.blocks.filter(block => block.kind === 'paragraph');
    expect(paragraphs.map(paragraph => wordParagraphText(reopened.document, paragraph))).toEqual(['A < B\tnormal', '', '最後 😀']);
    const at = { paragraphElementId: paragraphs[0]!.elementId, offset: 0 };
    expect(reopened.formattingState({ anchor: at, focus: { ...at, offset: 5 } }).text.bold).toMatchObject({ value: true });
    expect(reopened.formattingState({ anchor: at, focus: at }).block.horizontalAlignment).toMatchObject({ value: 'center' });
    expect(readCoreProperties(reopened.document.package)?.values.creator).toBe('Alex & <Team>');
  });

  test('rejects malformed authored content instead of silently changing its meaning', () => {
    expect(() => createWordArtifact({ paragraphs: [{ runs: [{ text: 'one\ntwo' }] }] })).toThrow('paragraph');
    expect(() => createWordArtifact({ paragraphs: [{ runs: [{ text: '\u0000' }] }] })).toThrow('XML');
    expect(() => createWordArtifact({ defaultFormat: { color: 'red' } })).toThrow('RGB');
    expect(() => createWordArtifact({ defaultFormat: { fontSizePoints: NaN } })).toThrow('Font');
    expect(() => createWordArtifact({ page: { width: 100, height: 100, margin: 60 } })).toThrow('margins');
  });
});
