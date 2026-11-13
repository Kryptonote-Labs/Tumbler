import { expect, test } from 'bun:test';
import {
  NativeWordEditor, createWordArtifact, importWordContent,
  openWordArtifact,
} from '../src/index.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';

const selection = (paragraphId: string, start: number, end = start) => ({
  anchor: { paragraphId, offset: start }, focus: { paragraphId, offset: end },
});
const text = (editor: NativeWordEditor) => editor.document.paragraphs().map(p => p.text);

test('rich replacement splits and joins paragraphs, preserves untouched blocks, and restores selection on undo', () => {
  const editor = new NativeWordEditor({ content: [
    { kind: 'paragraph', id: 'a', runs: [{ text: 'Hello', format: { bold: true } }, { text: ' world', format: { italic: true } }] },
    { kind: 'paragraph', id: 'b', runs: [{ text: 'Keep me' }] },
  ] });
  const untouched = editor.blocks[1];
  editor.setSelection(selection('a', 3, 8));
  editor.replaceText('X\nY');
  expect(text(editor)).toEqual(['HelX', 'Yrld', 'Keep me']);
  expect(editor.blocks.at(-1)).toBe(untouched);
  const inserted = editor.selection;
  expect(inserted.focus.offset).toBe(1);
  editor.undo();
  expect(text(editor)).toEqual(['Hello world', 'Keep me']);
  expect(editor.selection).toEqual(selection('a', 3, 8));
  editor.redo();
  expect(editor.selection).toEqual(inserted);
  editor.replaceText('', { anchor: { paragraphId: 'a', offset: 4 }, focus: { ...inserted.focus, offset: 0 } });
  expect(text(editor)).toEqual(['HelXYrld', 'Keep me']);
  const reopened = openWordArtifact(editor.document.artifact().bytes());
  const imported = importWordContent(reopened)[0]!;
  if (imported.kind !== 'paragraph') throw new Error('Expected paragraph');
  expect(imported.runs.at(-1)?.format?.italic).toBe(true);
});

test('typing marks and selection formatting use the same native/export path', () => {
  const source = createWordArtifact({ paragraphs: [{ runs: [{ text: 'abc', format: { highlight: 'yellow' } }] }] });
  const editor = new NativeWordEditor({ source });
  const id = editor.selection.focus.paragraphId;
  editor.applyFormatting({ highlight: null }, selection(id, 0, 3));
  expect(editor.formatAt({ paragraphId: id, offset: 1 }).highlight ?? 'none').toBe('none');
  editor.setSelection(selection(id, 3));
  editor.setTypingFormat({ bold: true });
  editor.replaceText('x');
  expect(editor.formatAt().bold).toBe(true);
  expect(text(editor)).toEqual(['abcx']);
  editor.undo();
  expect(text(editor)).toEqual(['abc']);
  editor.replaceText('y');
  expect(editor.canRedo).toBe(false);
});

test('edits inside nested cells work and cross-cell replacement is rejected atomically', () => {
  const editor = new NativeWordEditor({ content: [{ kind: 'table', rows: [[
    { blocks: [{ kind: 'paragraph', id: 'a', runs: [{ text: 'A' }] }] },
    { blocks: [{ kind: 'paragraph', id: 'b', runs: [{ text: 'B' }] }] },
  ]] }] });
  editor.replaceText('!', selection('b', 1));
  expect(text(editor)).toEqual(['A', 'B!']);
  const before = editor.blocks;
  expect(() => editor.replaceText('X', { anchor: { paragraphId: 'a', offset: 0 }, focus: { paragraphId: 'b', offset: 1 } })).toThrow();
  expect(editor.blocks).toBe(before);
  expect(text(editor)).toEqual(['A', 'B!']);
});

test('edits reject partial graphemes and invalid text without changing the model or history', () => {
  const editor = new NativeWordEditor({ content: [{ kind: 'paragraph', id: 'a', runs: [{ text: '👩‍💻é' }] }] });
  expect(() => editor.replaceText('X', selection('a', 2))).toThrow();
  expect(() => editor.replaceText('\u0000', selection('a', 0))).toThrow();
  expect(text(editor)).toEqual(['👩‍💻é']);
  expect(editor.canUndo).toBe(false);
});

test('imported text edits retain source wrappers and rich formatting through split, join and reopen', () => {
  const source = openWordArtifact(buildWordDocumentFixture({ documentXml: `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:ext="urn:keep"><w:body><w:p><w:r><w:rPr><w:i/><ext:keep/></w:rPr><w:t>Hello</w:t></w:r></w:p></w:body></w:document>` }));
  const editor = new NativeWordEditor({ source });
  const id = editor.selection.focus.paragraphId;
  editor.replaceText('!\nNew', selection(id, 5));
  const exported = openWordArtifact(editor.document.artifact().bytes());
  const blocks = importWordContent(exported);
  expect(blocks.map(block => block.kind === 'paragraph' ? block.runs.map(run => run.text).join('') : '')).toEqual(['Hello!', 'New']);
  for (const block of blocks) if (block.kind === 'paragraph') expect(block.runs.every(run => run.format?.italic)).toBe(true);
  expect(exported.document.source.elements('urn:keep', 'keep').length).toBeGreaterThan(0);
});

test('undo restores the supplied command range even before a host selection notification', () => {
  const editor = new NativeWordEditor({ content: [{ kind: 'paragraph', id: 'a', runs: [{ text: 'Hello' }] }] });
  const range = selection('a', 4, 1);
  editor.replaceText('X', range);
  editor.undo();
  expect(editor.selection).toEqual(range);
  expect(text(editor)).toEqual(['Hello']);
});

test('caret affinity samples and inherits the intended side of a formatting boundary', () => {
  for (const affinity of ['before', 'after'] as const) {
    const editor = new NativeWordEditor({ content: [{ kind: 'paragraph', id: 'a', runs: [
      { text: 'A', format: { bold: true } }, { text: 'B', format: { italic: true } },
    ] }] });
    const position = { paragraphId: 'a', offset: 1, affinity };
    expect(editor.formatAt(position).bold).toBe(affinity === 'after');
    expect(editor.formatAt(position).italic).toBe(affinity === 'before');
    editor.replaceText('X', { anchor: position, focus: position });
    expect(editor.formatAt().bold).toBe(affinity === 'after');
    expect(editor.formatAt().italic).toBe(affinity === 'before');
    editor.undo();
    expect(editor.selection).toEqual({ anchor: position, focus: position });
  }
});
