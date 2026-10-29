import { expect, test } from 'bun:test';
import { WordShapeText } from '../src/collaboration/index.ts';

function fixture() {
  return new WordShapeText({
    textBody: [720, 1440].map((positionTwips) => ({
      runs: [{ text: 'Paragraph' }],
      positioning: {
        indentStartTwips: 200,
        tabs: [{ positionTwips, alignment: 'start', leader: 'none' }],
      },
    })),
  });
}

test('editing a stop preserves each selected paragraph’s other stops and indentation', () => {
  const story = fixture();
  story.setTabStop(
    { start: 0, end: story.length },
    { positionTwips: 2160, alignment: 'end', leader: 'dot' },
  );
  expect(story.paragraphs().map((p) => p.positioning?.tabs?.map((t) => t.positionTwips))).toEqual([
    [720, 2160],
    [1440, 2160],
  ]);
  expect(story.paragraphs().every((p) => p.positioning?.indentStartTwips === 200)).toBe(true);
  story.destroy();
});

test('editing or moving a stop retains its exact twip identity and clears the previous position', () => {
  const story = fixture();
  const range = { start: 0, end: 0 };
  story.setTabStop(range, { positionTwips: 1000, alignment: 'start', leader: 'none' });
  story.setTabStop(range, { positionTwips: 1000, alignment: 'end', leader: 'dot' }, 1000);
  expect(story.paragraphs()[0]!.positioning!.tabs!.filter((t) => t.positionTwips === 1000)).toEqual(
    [{ positionTwips: 1000, alignment: 'end', leader: 'dot' }],
  );
  story.setTabStop(range, { positionTwips: 1100, alignment: 'end', leader: 'dot' }, 1000);
  expect(story.paragraphs()[0]!.positioning!.tabs).toContainEqual({
    positionTwips: 1000,
    alignment: 'clear',
    leader: 'none',
  });
  expect(story.paragraphs()[1]!.positioning!.tabs).toHaveLength(1);
  story.destroy();
});

test('tab stop edits reject invalid original ranges without modifying paragraphs', () => {
  const story = fixture();
  const before = story.paragraphs();
  for (const range of [
    { start: -1, end: 9999 },
    { start: 5, end: 1 },
    { start: 0.5, end: 1 },
    { start: 0, end: story.length + 1 },
  ]) {
    expect(() =>
      story.setTabStop(range, { positionTwips: 1000, alignment: 'start', leader: 'none' }),
    ).toThrow();
    expect(story.paragraphs()).toEqual(before);
  }
  story.destroy();
});
