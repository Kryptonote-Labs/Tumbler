import { expect, test } from 'bun:test';
import * as Y from 'yjs';
import { createWordCommands, validateWordText } from '../src/collaboration/index.ts';

const commands = createWordCommands();
const range = { start: 0, end: 5 };
function peers() {
  const a = new Y.Doc();
  a.clientID = 100;
  const x = a.getText('body');
  x.insert(0, 'Hello world\nTail\n');
  const b = new Y.Doc();
  b.clientID = 200;
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  const y = b.getText('body');
  return { a, b, x, y, sync() {
    const au = Y.encodeStateAsUpdate(a), bu = Y.encodeStateAsUpdate(b);
    Y.applyUpdate(a, bu, 'remote'); Y.applyUpdate(b, au, 'remote');
    expect(x.toDelta()).toEqual(y.toDelta());
    validateWordText(x); validateWordText(y);
  }, destroy() { a.destroy(); b.destroy(); } };
}

test('concurrent paragraph properties survive synchronization and selective undo', () => {
  const p = peers();
  const undo = new Y.UndoManager(p.x, { captureTimeout: 0 });
  p.x.applyDelta(commands.wordTransaction(p.x, [{ kind: 'format', target: commands.anchorWordRange(p.x, range), attributes: { paragraph: { keepNext: true } } }]));
  p.y.applyDelta(commands.formatWordDelta(p.y, range, { paragraph: { keepLines: true } }));
  p.sync();
  expect(commands.wordFormats(p.x, range).paragraph).toEqual({ keepNext: true, keepLines: true });
  undo.undo(); p.sync();
  expect(commands.wordFormats(p.x, range).paragraph).toEqual({ keepLines: true });
  undo.redo(); p.sync();
  expect(commands.wordFormats(p.x, range).paragraph).toEqual({ keepNext: true, keepLines: true });
  undo.destroy(); p.destroy();
});

test('legacy paragraph properties survive patches, splits, reset, undo and redo', () => {
  const p = peers();
  p.x.format(11, 1, { paragraph: { keepNext: true, spacingBeforeTwips: 120 } });
  p.sync();
  const undo = new Y.UndoManager(p.x, { captureTimeout: 0 });
  p.x.applyDelta(commands.formatWordDelta(p.x, range, { paragraph: { keepNext: false } }));
  p.y.applyDelta(commands.formatWordDelta(p.y, range, { paragraph: { keepLines: true } }));
  p.sync();
  const merged = { keepNext: false, keepLines: true, spacingBeforeTwips: 120 };
  expect(commands.wordFormats(p.x, range).paragraph).toEqual(merged);
  p.x.applyDelta(commands.formatWordDelta(p.x, range, { paragraph: {} }));
  expect(commands.wordFormats(p.x, range).paragraph).toEqual(merged);
  p.x.applyDelta(commands.formatWordDelta(p.x, range, { paragraph: null }));
  p.sync();
  expect(commands.wordFormats(p.x, range).paragraph).toBeUndefined();
  undo.undo(); p.sync();
  expect(commands.wordFormats(p.x, range).paragraph).toEqual(merged);
  undo.redo(); p.sync();
  expect(commands.wordFormats(p.x, range).paragraph).toBeUndefined();
  undo.undo();
  p.x.applyDelta(commands.replaceWordDelta(p.x, { start: 5, end: 5 }, '\n'));
  expect(commands.wordFormats(p.x, { start: 0, end: 0 }).paragraph).toEqual(merged);
  expect(commands.wordFormats(p.x, { start: 6, end: 6 }).paragraph).toEqual(merged);
  p.sync(); undo.destroy(); p.destroy();
});

test('same-property conflicts and reset versus patch converge in either delivery order', () => {
  for (const reverse of [false, true]) {
    const p = peers();
    p.x.applyDelta(commands.formatWordDelta(p.x, range, { paragraph: { keepNext: true } }));
    p.sync();
    p.x.applyDelta(commands.formatWordDelta(p.x, range, { paragraph: null }));
    p.y.applyDelta(commands.formatWordDelta(p.y, range, { paragraph: { keepNext: false, keepLines: true } }));
    const updates = [Y.encodeStateAsUpdate(p.a), Y.encodeStateAsUpdate(p.b)];
    if (reverse) updates.reverse();
    const receiver = new Y.Doc();
    for (const update of updates) Y.applyUpdate(receiver, update);
    p.sync();
    expect(receiver.getText('body').toDelta()).toEqual(p.x.toDelta());
    expect(commands.wordFormats(p.x, range).paragraph).toEqual({ keepNext: false, keepLines: true });
    receiver.destroy(); p.destroy();
  }
});

test('property registers reject malformed values and non-boundary placement', () => {
  for (const attributes of [
    { 'wordParagraphFormat:keepNext': { value: 'yes' } },
    { 'wordParagraphFormat:unknown': { value: true } },
    { 'wordParagraphFormat:keepNext': { value: true, extra: true } },
  ]) {
    const p = peers();
    p.x.format(11, 1, attributes);
    expect(() => validateWordText(p.x)).toThrow();
    p.destroy();
  }
  const p = peers();
  p.x.format(0, 1, { 'wordParagraphFormat:keepNext': { value: null } });
  expect(() => validateWordText(p.x)).toThrow('Paragraph formatting belongs on paragraph boundaries.');
  p.destroy();
});

test('property registers project through DOCX and shape text without leaking wire keys', async () => {
  const { createWordArtifact, importWordContent } = await import('../src/index.ts');
  const { openWordOperationDocument } = await import('../src/operations/document.ts');
  const { WordShapeText } = await import('../src/collaboration/shape-text.ts');
  const source = createWordArtifact({ paragraphs: [{ runs: [{ text: 'Hello' }], paragraph: { spacingBeforeTwips: 120 } }] });
  const document = openWordOperationDocument(source);
  document.text.applyDelta(commands.formatWordDelta(document.text, range, { paragraph: { keepNext: false, keepLines: true, lineSpacing: { rule: 'exact', value: 240 } } }));
  const artifact = document.artifact();
  expect(importWordContent(artifact)[0]).toMatchObject({ paragraph: { spacingBeforeTwips: 120, keepNext: false, keepLines: true, lineSpacing: { rule: 'exact', value: 240 } } });
  expect(artifact.document.source.source).not.toContain('wordParagraphFormat');
  expect(artifact.document.source.source).toContain('w:keepLines');
  const shape = new WordShapeText({ text: 'Hello' });
  shape.text.applyDelta(commands.formatWordDelta(shape.text, range, { paragraph: { keepNext: true } }));
  expect(shape.paragraphs()[0]?.paragraph).toEqual({ keepNext: true });
  shape.destroy(); document.destroy();
});

test('concurrent reset and patch remove imported properties from DOCX', async () => {
  const { createWordArtifact, importWordContent } = await import('../src/index.ts');
  const { openWordOperationDocument } = await import('../src/operations/document.ts');
  for (const styleId of [undefined, 'Normal']) {
    const source = createWordArtifact({ paragraphs: [{ ...(styleId ? { styleId } : {}), runs: [{ text: 'Hello' }], paragraph: { keepNext: true, spacingBeforeTwips: 120 } }] });
    const document = openWordOperationDocument(source);
    const a = document.text.doc!;
    a.clientID = 100;
    const b = new Y.Doc(); b.clientID = 200;
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    const peer = b.getText('body');
    document.text.applyDelta(commands.formatWordDelta(document.text, range, { paragraph: null }));
    peer.applyDelta(commands.formatWordDelta(peer, range, { paragraph: { keepLines: true } }));
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b), 'remote');
    expect(commands.wordFormats(document.text, range).paragraph).toEqual({ keepLines: true });
    expect(importWordContent(document.artifact())[0]).toMatchObject({ paragraph: { keepLines: true } });
    const xml = document.artifact().document.source.source;
    expect(xml).not.toContain('<w:keepNext');
    expect(xml).not.toContain('w:before="120"');
    document.text.applyDelta(commands.replaceWordDelta(document.text, { start: 2, end: 2 }, '\n'));
    const split = document.artifact();
    expect(split.document.source.source).not.toContain('<w:keepNext');
    expect(split.document.source.source).not.toContain('w:before="120"');
    expect(importWordContent(split)).toHaveLength(2);
    document.destroy(); b.destroy();
  }
});

test('shape paste overrides paragraph removal registers with clipboard formatting', async () => {
  const { WordShapeText } = await import('../src/collaboration/shape-text.ts');
  const shape = new WordShapeText({ text: 'Hello' });
  shape.format(range, { paragraph: null });
  shape.paste({ start: 0, end: 0 }, [
    { runs: [{ text: 'First' }], paragraph: { keepNext: true, spacingBeforeTwips: 120 } },
    { runs: [{ text: 'Second' }] },
  ]);
  expect(shape.paragraphs()[0]?.paragraph).toEqual({ keepNext: true, spacingBeforeTwips: 120 });
  shape.destroy();
});
