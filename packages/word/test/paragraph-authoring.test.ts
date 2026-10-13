import { expect, test } from 'bun:test';
import * as Y from 'yjs';
import { createWordArtifact, importWordContent, NativeWordDocument } from '../src/index.ts';
import { createWordCommands, validateWordText } from '../src/collaboration/index.ts';

test('paragraph properties round-trip and control native pagination', () => {
  const paragraph = { spacingBeforeTwips: 240, spacingAfterTwips: 160, lineSpacing: { rule: 'exact' as const, value: 400 }, shading: '#FFF000', borders: { bottom: { style: 'single' as const, color: '#112233', widthPoints: 1 } }, keepNext: true };
  const source = createWordArtifact({ paragraphs: [{ paragraph, runs: [{ text: 'One' }] }, { paragraph: { pageBreakBefore: true }, runs: [{ text: 'Two' }] }] });
  const blocks = importWordContent(source);
  expect(blocks[0]).toMatchObject({ paragraph });
  const model = new NativeWordDocument({ source });
  const first = blocks[0]!;
  if (first.kind !== 'paragraph') throw Error('paragraph');
  model.update([{ ...first, paragraph: { ...first.paragraph, spacingAfterTwips: 0, shading: 'transparent', keepNext: false } }, ...blocks.slice(1)]);
  expect(importWordContent(model.artifact())[0]).toMatchObject({ paragraph: { ...paragraph, spacingAfterTwips: 0, shading: 'transparent', keepNext: false } });
  const layout = model.layout({ measure: text => ({ width: text.length * 6, ascent: 9, descent: 3 }) });
  expect(layout.pages).toHaveLength(2);
  expect(layout.pages[0]!.columns[0]!.lines[0]!.paragraphDecoration?.shading).toBe('transparent');
});

test('formatting multiple paragraphs retains each existing property and excludes the next paragraph', () => {
  const doc = new Y.Doc(); const text = doc.getText('body'); text.insert(0, 'one\ntwo\nthree\n');
  const commands = createWordCommands();
  text.applyDelta(commands.formatWordDelta(text, { start: 0, end: 3 }, { paragraph: { shading: '#FF0000' } }));
  text.applyDelta(commands.formatWordDelta(text, { start: 4, end: 7 }, { paragraph: { spacingBeforeTwips: 100 } }));
  text.applyDelta(commands.formatWordDelta(text, { start: 0, end: 8 }, { paragraph: { spacingAfterTwips: 200 } }));
  expect(commands.wordFormats(text, { start: 0, end: 0 }).paragraph).toEqual({ shading: '#FF0000', spacingAfterTwips: 200 });
  expect(commands.wordFormats(text, { start: 4, end: 4 }).paragraph).toEqual({ spacingBeforeTwips: 100, spacingAfterTwips: 200 });
  expect(commands.wordFormats(text, { start: 8, end: 8 }).paragraph).toBeUndefined();
  expect(() => validateWordText(text)).not.toThrow();
  doc.destroy();
});
