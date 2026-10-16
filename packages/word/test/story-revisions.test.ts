import { expect, test } from 'bun:test';
import { createWordArtifact, createWordStory, importWordContent, NativeWordDocument, openWordArtifact, reconcileWordContent, wordStoryArtifact } from '../src/index.ts';
import { storyMainArtifact } from '../src/stories.ts';

const paragraph = (text: string) => ({ kind: 'paragraph' as const, runs: [{ text }] });

function storyText(artifact: ReturnType<typeof createWordArtifact>, part: string) {
  return importWordContent(wordStoryArtifact(artifact, part));
}

test('story edits recover their own main revision without changing previous revisions', () => {
  const header = createWordStory(createWordArtifact({ paragraphs: [paragraph('Body')] }), { section: 0, kind: 'header', type: 'default' });
  const footer = createWordStory(header.artifact, { section: 0, kind: 'footer', type: 'default' });
  const original = footer.artifact;
  const first = reconcileWordContent(wordStoryArtifact(original, header.partName), [paragraph('First header')]);
  const firstMain = storyMainArtifact(first);
  const second = reconcileWordContent(first, [paragraph('Second header')]);
  const secondMain = storyMainArtifact(second);
  expect(firstMain.bytes()).toBe(first.bytes());
  expect(secondMain.bytes()).toBe(second.bytes());
  expect(storyText(firstMain, header.partName)[0]).toMatchObject(paragraph('First header'));
  expect(storyText(secondMain, header.partName)[0]).toMatchObject(paragraph('Second header'));
  expect(importWordContent(secondMain)).toEqual(importWordContent(original));
  expect(storyText(secondMain, footer.partName)).toEqual(storyText(original, footer.partName));
  expect(storyText(original, header.partName)).not.toEqual(storyText(firstMain, header.partName));
});

test('native export retains simultaneous body, header and footer edits across revisions', () => {
  const header = createWordStory(createWordArtifact(), { section: 0, kind: 'header', type: 'default' });
  const footer = createWordStory(header.artifact, { section: 0, kind: 'footer', type: 'default' });
  const model = new NativeWordDocument({ source: footer.artifact });
  model.update([paragraph('Edited body')]);
  model.updateStory(header.partName, [paragraph('Edited header')]);
  model.updateStory(footer.partName, [paragraph('Edited footer')]);
  const first = openWordArtifact(model.artifact().bytes());
  model.updateStory(header.partName, [paragraph('Next header')]);
  const second = openWordArtifact(model.artifact().bytes());
  for (const exported of [first, second]) {
    expect(exported.document.source.root.localName).toBe('document');
    expect(importWordContent(exported)[0]).toMatchObject(paragraph('Edited body'));
    expect(storyText(exported, footer.partName)[0]).toMatchObject(paragraph('Edited footer'));
  }
  expect(storyText(first, header.partName)[0]).toMatchObject(paragraph('Edited header'));
  expect(storyText(second, header.partName)[0]).toMatchObject(paragraph('Next header'));
});

test('native story export retains resized images and their relationships', () => {
  const header = createWordStory(createWordArtifact({ paragraphs: [paragraph('Body')] }), { section: 0, kind: 'header', type: 'default' });
  const image = { bytes: new Uint8Array([137, 80, 78, 71]), contentType: 'image/png' as const, width: 30, height: 20 };
  const seeded = reconcileWordContent(wordStoryArtifact(header.artifact, header.partName), [
    { kind: 'paragraph', runs: [{ text: '\uFFFC', image }] },
  ]);
  const source = storyMainArtifact(seeded);
  const content = importWordContent(seeded);
  const model = new NativeWordDocument({ source });
  model.updateStory(header.partName, content.map(block => block.kind === 'paragraph' ? {
    ...block,
    runs: block.runs.map(run => seeded.document.drawings.has(run.source!) ? { ...run, image: { ...image, width: 60, height: 40 } } : run),
  } : block));
  const exported = openWordArtifact(model.artifact().bytes());
  expect(importWordContent(exported)).toEqual(importWordContent(source));
  expect(exported.document.drawings.size).toBe(0);
  const drawing = [...wordStoryArtifact(exported, header.partName).document.drawings.values()][0]!;
  expect(drawing.kind).toBe('image');
  expect(drawing.widthPoints).toBe(60);
  expect(drawing.heightPoints).toBe(40);
  if (drawing.kind === 'image') expect(drawing.bytes).toEqual(image.bytes);
  expect([...seeded.document.drawings.values()][0]!.widthPoints).toBe(30);
});
