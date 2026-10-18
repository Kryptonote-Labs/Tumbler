import { expect, test } from 'bun:test';
import {
  createWordArtifact,
  importWordContent,
  shapePlainText,
  type WordAuthoredShape,
} from '../src/index.ts';
import { WordShapeText } from '../src/collaboration/index.ts';
const shape: WordAuthoredShape = {
  preset: 'rect',
  width: 180,
  height: 100,
  fill: '#ffffff',
  outline: '#000000',
  outlineWidth: 1,
  text: 'Hello world\nSecond paragraph',
};

test('shape text edits preserve mixed formatting and paragraph boundaries', () => {
  const story = new WordShapeText(shape);
  story.format({ start: 0, end: 5 }, { bold: true, fontSize: 18, color: '#ff0000' });
  story.format(
    { start: 12, end: 12 },
    { align: 'right', list: { id: 'test', kind: 'decimal', level: 0 } },
  );
  story.replace({ start: 5, end: 5 }, '!');
  expect(story.formats({ start: 0, end: 6 })).toMatchObject({
    bold: true,
    fontSize: 18,
    color: '#ff0000',
  });
  expect(story.paragraphs()[1]).toMatchObject({ alignment: 'end', list: { kind: 'decimal' } });
  expect(shapePlainText({ textBody: story.paragraphs() })).toBe('Hello! world\nSecond paragraph');
  story.destroy();
});

test('rich shape text survives DOCX export, import and another export', () => {
  const story = new WordShapeText(shape);
  story.format(
    { start: 0, end: 5 },
    { bold: true, fontFamily: 'Arial', fontSize: 20, color: '#123456' },
  );
  story.format({ start: 6, end: 11 }, { italic: true, underline: true });
  story.format(
    { start: 12, end: 12 },
    { align: 'right', list: { id: 'numbers', kind: 'decimal', level: 0 } },
  );
  let current: WordAuthoredShape = { ...shape, textBody: story.paragraphs(), textAnchor: 'bottom' };
  for (let i = 0; i < 2; i++) {
    const artifact = createWordArtifact({
      paragraphs: [{ runs: [{ text: '\uFFFC', shape: current }] }],
    });
    const drawing = [...artifact.document.drawings.values()][0];
    expect(drawing?.kind).toBe('shape');
    if (drawing?.kind !== 'shape') throw new Error(JSON.stringify(drawing));
    current = drawing.shape;
    expect(current.textAnchor).toBe('bottom');
    expect(current.textBody?.[0]?.runs[0]?.format).toMatchObject({
      bold: true,
      fontFamily: 'Arial',
      fontSizePoints: 20,
      color: '#123456',
    });
    expect(current.textBody?.[0]?.runs.find((r) => r.text === 'world')?.format).toMatchObject({
      italic: true,
      underline: 'single',
    });
    expect(current.textBody?.[1]).toMatchObject({ alignment: 'end', list: { kind: 'decimal' } });
    expect(shapePlainText(current)).toBe(shape.text!);
    expect(importWordContent(artifact)[0]?.kind).toBe('paragraph');
  }
  story.destroy();
});

test('empty shapes retain typing formats and rich clipboard fragments replace inherited formats', () => {
  const empty = new WordShapeText({ text: '' });
  empty.format({ start: 0, end: 0 }, { bold: true, fontSize: 24 });
  const restored = new WordShapeText({ textBody: empty.paragraphs() });
  restored.replace({ start: 0, end: 0 }, 'New');
  expect(restored.formats({ start: 0, end: 3 })).toMatchObject({ bold: true, fontSize: 24 });
  const plain = new WordShapeText({ text: 'plain' });
  restored.paste({ start: 0, end: 3 }, plain.slice({ start: 0, end: 5 }));
  expect(restored.formats({ start: 0, end: 5 }).bold).not.toBe(true);
  expect(shapePlainText({ textBody: restored.paragraphs() })).toBe('plain');
  empty.destroy();
  restored.destroy();
  plain.destroy();
});


test('many text boxes retain distinct formatting and numbering across packages', () => {
  for (const color of ['#123456', '#654321']) {
    const boxes = Array.from({ length: 30 }, (_, index): WordAuthoredShape => ({
      ...shape,
      textBody: [{
        runs: [{ text: `Box ${index}`, format: { color, bold: index % 2 === 0 } }],
        list: { id: 'boxes', kind: 'decimal', level: 0, start: 3 },
      }],
    }));
    const artifact = createWordArtifact({
      paragraphs: boxes.map(shape => ({ runs: [{ text: '\uFFFC', shape }] })),
    });
    const drawings = [...artifact.document.drawings.values()];
    expect(drawings).toHaveLength(boxes.length);
    drawings.forEach((drawing, index) => {
      if (drawing.kind !== 'shape') throw new Error('Expected text box');
      expect(drawing.shape.textBody?.[0]).toMatchObject({
        runs: [{ text: `Box ${index}`, format: { color, bold: index % 2 === 0 } }],
        list: { kind: 'decimal', level: 0, start: 3 },
      });
    });
  }
});
