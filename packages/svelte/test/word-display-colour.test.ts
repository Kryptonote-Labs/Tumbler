import { expect, test } from 'bun:test';
import { createWordArtifact, NativeWordDocument, importWordContent } from '@tumblerjs/word';
import { wordTextCss } from '../src/word-font-metrics.ts';
import { wordDarkColour, wordDisplayColour } from '../src/word-display-colour.ts';

function luminance(hex: string) {
  const channels = [1, 3, 5].map((offset) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}

test('white paper and black text use Word-like dark canvas endpoints', () => {
  expect(wordDarkColour('#fff')).toBe('#262626');
  expect(wordDarkColour('#000000', '#ffffff')).toBe('#ffffff');
  expect(wordDisplayColour('transparent')).toBe('transparent');
  expect(wordDisplayColour('none')).toBe('none');
});

test('coloured text retains its hue family on a dark page', () => {
  const red = wordDarkColour('#ff0000', '#ffffff');
  const blue = wordDarkColour('#0000ff', '#ffffff');
  expect(parseInt(red.slice(1, 3), 16)).toBeGreaterThan(parseInt(red.slice(3, 5), 16));
  expect(parseInt(blue.slice(5, 7), 16)).toBeGreaterThan(parseInt(blue.slice(1, 3), 16));
  expect(red).not.toBe('#00ffff');
});

test('readable text stays readable on coloured cells and highlights', () => {
  for (const [text, surface] of [
    ['#000000', '#ffff00'],
    ['#ffffff', '#156082'],
    ['#ffffff', '#000000'],
    ['#000000', '#c1e4f5'],
  ]) {
    const a = luminance(wordDarkColour(text!, surface));
    const b = luminance(wordDarkColour(surface!));
    expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toBeGreaterThan(4.45);
  }
});

test('display styling keeps source colours, theme references and exported DOCX intact', () => {
  const artifact = createWordArtifact({
    paragraphs: [
      {
        runs: [
          {
            text: 'Theme colour',
            format: { color: { theme: 'accent1', fallback: '#156082' }, highlight: 'yellow' },
          },
        ],
      },
    ],
  });
  const model = new NativeWordDocument({ source: artifact, content: importWordContent(artifact) });
  const paragraph = model.blocks[0];
  if (paragraph?.kind !== 'paragraph' || paragraph.inlines[0]?.kind !== 'run')
    throw new Error('Missing run');
  const format = model.runFormat(paragraph, paragraph.inlines[0]);
  const before = structuredClone(format);
  const bytes = artifact.bytes();
  const css = wordTextCss(format);
  expect(css).toContain(`color:light-dark(${format.color},`);
  expect(css).toContain('background-color:light-dark(#FFFF00,');
  expect(format).toEqual(before);
  expect(artifact.bytes()).toEqual(bytes);
});

